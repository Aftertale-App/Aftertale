// ============================================================================
// eventSync — cloud backup/restore for raw captured addon events.
//
// The captured event stream IS the player's story; losing it is unacceptable.
// cloudSync mirrors the *bible/enrichments/recaps* blob; this module mirrors
// the high-volume per-event rows into the purpose-built `public.events` table
// (RLS via character ownership) so a device switch or a cleared browser store
// reconstructs every captured session byte-for-byte.
//
// Model:
//   - Rows are keyed by the addon's own event UUID, so re-imports + re-pushes
//     dedupe for free (upsert onConflict 'id').
//   - payload holds the FULL AddonEventRecord, so restore is exact (no lossy
//     reconstruction) — the local store just merges payloads back in.
//   - Push uses a per-character savedAt high-water so we don't re-send the
//     whole firehose every sync. CRITICAL: the water-mark only advances for
//     events THIS device actually pushed (never on pull, except the provably-
//     safe fresh-restore case), so a device's local-only events can never be
//     skipped and lost on a multi-device merge.
//
// These functions are driven by cloudSync (which owns the character-uuid cache
// and the auth/push/hydrate lifecycle); they take the resolved Supabase client
// + character_id so they don't duplicate that machinery.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/supabase';
import {
  loadAddonEventRecords,
  mergeAddonEventRecords,
  type AddonEventRecord,
} from './addonEventStore';

type Client = SupabaseClient<Database>;

const HWM_KEY = 'at.sync.events-hwm.v1'; // { [characterKey]: max savedAt pushed }
const UPSERT_BATCH = 500; // rows per upsert request
const PULL_PAGE = 1000; // rows per select page (Supabase default cap)

// ---------------------------------------------------------------------------
// per-character push high-water (savedAt ms)
// ---------------------------------------------------------------------------

function readHwm(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HWM_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeHwm(map: Record<string, number>): void {
  try {
    localStorage.setItem(HWM_KEY, JSON.stringify(map));
  } catch {
    // storage full / disabled — fail soft; worst case we re-push (idempotent).
  }
}

function getHwm(key: string): number {
  return readHwm()[key] ?? 0;
}

function bumpHwm(key: string, value: number): void {
  const map = readHwm();
  if ((map[key] ?? 0) >= value) return;
  map[key] = value;
  writeHwm(map);
}

/** Any locally-stored events for this character newer than the push water-mark? */
export function hasUnpushedEvents(key: string): boolean {
  const hwm = getHwm(key);
  return loadAddonEventRecords(key).some((r) => r.savedAt > hwm);
}

function occurredAtISO(rec: AddonEventRecord): string | null {
  const ts = rec.event.timestamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  try {
    return new Date(ts).toISOString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// push  (local -> cloud)
// ---------------------------------------------------------------------------

/**
 * Mirror this character's not-yet-pushed events up to public.events. Pushes
 * only records past the per-character water-mark (so we never resend the whole
 * stream) and advances it ONLY over batches that actually succeeded, so a
 * mid-flight failure resumes cleanly next time.
 */
export async function pushEvents(
  supabase: Client,
  characterId: string,
  key: string,
): Promise<boolean> {
  const hwm = getHwm(key);
  const fresh = loadAddonEventRecords(key)
    .filter((r) => r.savedAt > hwm)
    .sort((a, b) => a.savedAt - b.savedAt); // oldest first, so the water-mark advances monotonically
  if (fresh.length === 0) return true;

  for (let i = 0; i < fresh.length; i += UPSERT_BATCH) {
    const chunk = fresh.slice(i, i + UPSERT_BATCH);
    const rows = chunk.map((rec) => ({
      id: rec.event.id,
      character_id: characterId,
      event_type: rec.event.wowEvent ?? rec.event.kind ?? 'unknown',
      occurred_at: occurredAtISO(rec),
      payload: rec as unknown as Json,
    }));
    const { error } = await supabase.from('events').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('[eventSync] push failed', key, error.message);
      return false; // leave the water-mark where it was for the failed chunk; retry later
    }
    // Whole chunk committed (upsert of an array is atomic) — advance past it.
    bumpHwm(key, chunk[chunk.length - 1].savedAt);
  }
  return true;
}

// ---------------------------------------------------------------------------
// pull  (cloud -> local)  — the restore path
// ---------------------------------------------------------------------------

/**
 * Restore a character's events from the cloud into the local store. Skips the
 * fetch when the device already holds at least as many events as the cloud
 * (common re-hydrate). Otherwise pages through public.events and merges by
 * event id without clobbering local rows.
 */
export async function pullEvents(
  supabase: Client,
  characterId: string,
  key: string,
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('character_id', characterId);
  if (countErr) {
    console.warn('[eventSync] count failed', key, countErr.message);
    return;
  }
  const cloudCount = count ?? 0;
  if (cloudCount === 0) return;

  // Were there local events not yet pushed BEFORE this restore? If not, it is
  // provably safe to park the water-mark afterward (nothing local could be
  // lost). If there were, we leave the water-mark so the next push reconciles
  // them — re-pushing pulled rows is idempotent, never lossy.
  const hadUnpushedBefore = hasUnpushedEvents(key);
  const localCount = loadAddonEventRecords(key).length;
  if (localCount >= cloudCount) {
    if (!hadUnpushedBefore) parkWaterMark(key);
    return;
  }

  const restored: AddonEventRecord[] = [];
  for (let from = 0; from < cloudCount; from += PULL_PAGE) {
    const { data, error } = await supabase
      .from('events')
      .select('payload')
      .eq('character_id', characterId)
      .order('occurred_at', { ascending: true })
      .range(from, from + PULL_PAGE - 1);
    if (error) {
      console.warn('[eventSync] pull page failed', key, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rec = row.payload as unknown as AddonEventRecord;
      if (rec && rec.event && typeof rec.event.id === 'string') restored.push(rec);
    }
    if (data.length < PULL_PAGE) break;
  }

  if (restored.length > 0) {
    mergeAddonEventRecords(restored);
    if (!hadUnpushedBefore) parkWaterMark(key);
  }
}

/** Advance the push water-mark past every locally-stored event. Only called on
 *  the provably-safe path (no un-pushed local events), so it can never skip a
 *  device's own captures. */
function parkWaterMark(key: string): void {
  const maxSavedAt = loadAddonEventRecords(key).reduce((m, r) => Math.max(m, r.savedAt), 0);
  if (maxSavedAt > 0) bumpHwm(key, maxSavedAt);
}
