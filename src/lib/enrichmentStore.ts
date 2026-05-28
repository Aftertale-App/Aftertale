// ============================================================================
// Enrichment store — localStorage persistence for per-event LLM paragraphs
// produced at the Scribe's Desk. Scoped per character so heroes don't bleed
// prose into each other.
//
// Why this exists: enrichment is the user's most expensive activity (real
// OpenRouter $$). Before this store, paragraphs lived only in React state and
// vaporized on refresh. Now they persist and also feed the web Chronicle
// reader so the user can see their narrative without round-tripping through
// the WoW addon.
// ============================================================================

const STORAGE_PREFIX = 'at.enrichments.';
export const ENRICHMENTS_UPDATED_EVENT = 'at:enrichments-updated';

export interface EnrichmentRecord {
  paragraph: string;
  savedAt: number;
  modelId?: string;
}

export type EnrichmentMap = Record<string, EnrichmentRecord>;

function storageKey(characterKey: string): string {
  return `${STORAGE_PREFIX}${characterKey}`;
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(ENRICHMENTS_UPDATED_EVENT));
  } catch {
    // SSR / no DOM — silently drop.
  }
}

export function loadEnrichments(characterKey: string | null | undefined): EnrichmentMap {
  if (!characterKey) return {};
  try {
    const raw = localStorage.getItem(storageKey(characterKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as EnrichmentMap;
  } catch {
    return {};
  }
}

export function saveEnrichments(characterKey: string, map: EnrichmentMap): void {
  if (!characterKey) return;
  try {
    localStorage.setItem(storageKey(characterKey), JSON.stringify(map));
    notify();
  } catch {
    // localStorage may be full or disabled — fail soft; in-memory state still works.
  }
}

export interface EnrichmentUpsertInput {
  id: string;
  paragraph: string;
  modelId?: string;
}

/**
 * Merge one or more new paragraphs into the character's stored enrichments.
 * Empty / whitespace-only paragraphs are skipped (we never want to overwrite
 * a good paragraph with a partial / failed retry).
 */
export function upsertEnrichments(
  characterKey: string | null | undefined,
  entries: EnrichmentUpsertInput[],
): void {
  if (!characterKey || entries.length === 0) return;
  const current = loadEnrichments(characterKey);
  const now = Date.now();
  let dirty = false;
  for (const e of entries) {
    if (!e.id || !e.paragraph || !e.paragraph.trim()) continue;
    current[e.id] = { paragraph: e.paragraph, savedAt: now, modelId: e.modelId };
    dirty = true;
  }
  if (dirty) saveEnrichments(characterKey, current);
}

export function clearEnrichments(characterKey: string | null | undefined): void {
  if (!characterKey) return;
  try {
    localStorage.removeItem(storageKey(characterKey));
    notify();
  } catch {
    // ignore
  }
}

/**
 * Remove specific enrichment entries by id from a character's store. Useful
 * for per-session chronicle purges where we only want to drop a slice.
 */
export function removeEnrichments(
  characterKey: string | null | undefined,
  ids: string[],
): number {
  if (!characterKey || ids.length === 0) return 0;
  const map = loadEnrichments(characterKey);
  let removed = 0;
  for (const id of ids) {
    if (id in map) {
      delete map[id];
      removed += 1;
    }
  }
  if (removed > 0) saveEnrichments(characterKey, map);
  return removed;
}

/**
 * Convenience: flatten an EnrichmentMap into the plain `Record<id, paragraph>`
 * shape used by the in-memory UI state in ScribesDesk.
 */
export function toParagraphMap(map: EnrichmentMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, rec] of Object.entries(map)) {
    if (rec && rec.paragraph) out[id] = rec.paragraph;
  }
  return out;
}
