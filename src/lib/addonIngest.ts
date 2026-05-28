import type { AddonEvent, AddonIngestResult } from './addonEvents';
import { loadBible, updateActiveBible } from './bibleStore';
import { appendAddonEventRecord, hasAddonEvent } from './addonEventStore';

function characterKey(createdAt: number): string {
  return String(createdAt);
}

export function ingestAddonEvent(event: AddonEvent): AddonIngestResult {
  const existing = hasAddonEvent(event.id);
  if (existing) {
    return {
      status: 'skipped',
      message: 'Event already ingested.',
      changes: [],
    };
  }

  const bible = loadBible();
  if (!bible) {
    const result: AddonIngestResult = {
      status: 'failed',
      message: 'No active character bible. Roll or select a hero before ingesting addon events.',
      changes: [],
    };
    appendAddonEventRecord({
      event,
      characterKey: null,
      result,
      savedAt: Date.now(),
    });
    return result;
  }

  const changes: string[] = [];
  const patch: Parameters<typeof updateActiveBible>[0] = {};

  if (event.zone && event.zone !== bible.currentZone) {
    patch.currentZone = event.zone;
    changes.push(`Zone → ${event.zone}`);
  }

  if (typeof event.playerLevel === 'number' && event.playerLevel !== bible.level) {
    patch.level = event.playerLevel;
    changes.push(`Level → ${event.playerLevel}`);
  }

  // Addon events no longer write chronicle entries directly. They live in
  // addonEventRecords as source material for Session Trail and the AI to
  // weave into committed session recaps. Only committed recaps + manual
  // entries are deeds / chapters now.

  if (changes.length > 0) {
    updateActiveBible(patch);
  }

  const result: AddonIngestResult = {
    status: 'ingested',
    message: changes.length > 0 ? 'Event ingested into the active hero.' : 'Event logged; no character state changed.',
    changes,
    characterKey: characterKey(bible.createdAt),
  };

  appendAddonEventRecord({
    event,
    characterKey: characterKey(bible.createdAt),
    result,
    savedAt: Date.now(),
  });

  return result;
}
