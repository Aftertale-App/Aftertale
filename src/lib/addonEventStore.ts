import type { AddonEvent, AddonIngestResult } from './addonEvents';

const STORAGE_KEY = 'at.addon.events.v1';

export interface AddonEventRecord {
  event: AddonEvent;
  characterKey: string | null;
  result: AddonIngestResult;
  savedAt: number;
}

function fireAddonEventsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('at:addon-events-updated'));
  }
}

export function loadAddonEventRecords(characterKey?: string): AddonEventRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddonEventRecord[];
    if (!Array.isArray(parsed)) return [];
    const records = parsed.filter((r) => r && typeof r === 'object' && r.event);
    const scoped = characterKey === undefined
      ? records
      : records.filter((r) => r.characterKey === characterKey);
    return scoped.sort((a, b) => b.savedAt - a.savedAt);
  } catch (err) {
    console.warn('[addonEventStore] failed to load records:', err);
    return [];
  }
}

export function hasAddonEvent(eventId: string): boolean {
  return loadAddonEventRecords().some((r) => r.event.id === eventId);
}

export function appendAddonEventRecord(record: AddonEventRecord): void {
  const records = loadAddonEventRecords();
  if (records.some((r) => r.event.id === record.event.id)) return;
  records.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  fireAddonEventsUpdated();
}

/**
 * Upsert variant of {@link appendAddonEventRecord}. If a record with the same
 * event id already exists it is replaced in-place (preserving its position).
 * Returns 'inserted' for a fresh add or 'refreshed' for a replacement. Used by
 * bulk re-imports so a newer parser pass can refresh stored event shape
 * (e.g. corrected playerLevel) without forcing the user to clear first.
 */
export function upsertAddonEventRecord(record: AddonEventRecord): 'inserted' | 'refreshed' {
  const records = loadAddonEventRecords();
  const idx = records.findIndex((r) => r.event.id === record.event.id);
  if (idx >= 0) {
    records[idx] = record;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    fireAddonEventsUpdated();
    return 'refreshed';
  }
  records.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  fireAddonEventsUpdated();
  return 'inserted';
}

export function clearAddonEventRecords(characterKey?: string): number {
  const records = loadAddonEventRecords();
  const keep = characterKey === undefined
    ? []
    : records.filter((r) => r.characterKey !== characterKey);
  const removed = records.length - keep.length;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
  fireAddonEventsUpdated();
  return removed;
}

/**
 * Remove specific addon event records by their event id. Returns the count
 * actually removed. Fires the standard updated event so consumers re-bucket.
 */
export function removeAddonEventRecords(eventIds: string[]): number {
  if (eventIds.length === 0) return 0;
  const drop = new Set(eventIds);
  const records = loadAddonEventRecords();
  const keep = records.filter((r) => !drop.has(r.event.id));
  const removed = records.length - keep.length;
  if (removed === 0) return 0;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
  fireAddonEventsUpdated();
  return removed;
}
