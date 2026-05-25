import type { HistoryEntry } from '../types';
import { loadBible, updateActiveBible } from './bibleStore';
import type { AddonEvent, AddonIngestResult } from './addonEvents';
import { appendAddonEventRecord, hasAddonEvent } from './addonEventStore';

function characterKey(createdAt: number): string {
  return String(createdAt);
}

function cleanInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function questTextNote(event: AddonEvent): string | null {
  const raw = event.questTextEnrichment?.text;
  if (!raw?.trim()) return null;
  const compact = cleanInline(raw);
  if (!compact) return null;
  const clipped = compact.length > 360 ? `${compact.slice(0, 357)}...` : compact;
  return ` Local quest-text note: ${clipped}`;
}

function shouldAppendHistory(event: AddonEvent): boolean {
  if (event.kind === 'quest_turned_in') return true;
  if (event.kind === 'level_up') return true;
  return false;
}

function historyTextFor(event: AddonEvent): string | null {
  if (event.kind === 'level_up' && typeof event.playerLevel === 'number') {
    return `Reached level ${event.playerLevel}${event.zone ? ` in ${event.zone}` : ''}.`;
  }
  if (!shouldAppendHistory(event)) return null;
  const base = event.storyCard?.chronicleEntry ?? event.summary;
  const note = questTextNote(event);
  return `${base}${note ?? ''}`;
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

  const text = historyTextFor(event);
  if (text) {
    const id = `addon_${event.id}`;
    const exists = (bible.history ?? []).some((h) => h.id === id);
    if (!exists) {
      const entry: HistoryEntry = {
        id,
        timestamp: event.timestamp,
        text,
        zone: event.zone ?? bible.currentZone,
        level: event.playerLevel ?? bible.level,
      };
      patch.history = [...(bible.history ?? []), entry];
      changes.push('Chronicle entry appended');
    }
  }

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
