// ===========================================================================
// Per-hero status helpers — shared by the import roster and Meet Your Heroes.
// Sessions are *derived* from a hero's saved moments (not stored), so these
// recompute on demand from the addon event store + the hero's published history.
// ===========================================================================

import { getBibleByKey } from './bibleStore';
import { loadAddonEventRecords } from './addonEventStore';
import { buildChronicleSessions } from './sessionHistory';
import { recapSessionId } from './chapterParse';

export interface HeroSessionStatus {
  /** Total observed play sessions for this hero. */
  total: number;
  /** Sessions with no published recap yet — the "to write" backlog. */
  unwritten: number;
}

/**
 * Count a hero's sessions and how many are still unwritten (no published recap
 * in the hero's `bible.history`). This is the visibility layer that surfaces the
 * backlog the account-wide import creates under heroes you're not looking at.
 */
export function heroSessionStatus(key: string, name: string): HeroSessionStatus {
  const records = loadAddonEventRecords(key);
  if (records.length === 0) return { total: 0, unwritten: 0 };
  const sessions = buildChronicleSessions(records, name);
  const bible = getBibleByKey(key);
  const written = new Set<string>();
  for (const entry of bible?.history ?? []) {
    const sid = recapSessionId(entry.id);
    if (sid) written.add(sid);
  }
  const writtenCount = sessions.filter((s) => written.has(s.id)).length;
  return { total: sessions.length, unwritten: sessions.length - writtenCount };
}

/** How many raw moments (addon event records) a hero has banked. */
export function heroMomentCount(key: string): number {
  return loadAddonEventRecords(key).length;
}
