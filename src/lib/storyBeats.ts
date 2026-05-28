// ============================================================================
// Story beats — canonical curation for the Inkwell's penn-able addon events.
// Everything not admitted here remains telemetry: useful to recap AI, hidden
// from the player's note-taking surface.
//
// Why this exists: addon capture is intentionally broad, but The Inkwell needs
// a quiet list of moments that feel worthy of player-authored chronicle notes.
// ============================================================================

import type { AddonEvent, AddonEventKind } from './addonEvents';
import type { AddonEventRecord } from './addonEventStore';
import { DEFAULT_STORY_BEAT_SETTINGS, type LootQuality, type StoryBeatSettings } from './storyBeatSettings';

/**
 * The curated set of event kinds that surface as user-penn-able "story
 * beats" in The Inkwell. Everything outside this set stays as telemetry
 * the recap AI can read for context but the user never sees as a beat.
 *
 * Locked in 2026-05-27 design conversation with Jeff. If you're tempted
 * to add a kind here, ask yourself: would a player open the Inkwell and
 * think "yeah, that moment deserved a note"?
 */
export const STORY_BEAT_KINDS: ReadonlySet<AddonEventKind> = new Set([
  'quest_accepted',
  'quest_turned_in',
  'level_up',
  'player_death',
  'achievement_earned',
  'item_loot',
  'instance_enter_first',
  'boss_kill',
  'instance_complete',
]);

const QUALITY_ORDER: LootQuality[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function meetsFloor(itemQuality: LootQuality, floor: LootQuality): boolean {
  return QUALITY_ORDER.indexOf(itemQuality) >= QUALITY_ORDER.indexOf(floor);
}

export function isStoryBeat(event: AddonEvent, settings: StoryBeatSettings = DEFAULT_STORY_BEAT_SETTINGS): boolean {
  if (!STORY_BEAT_KINDS.has(event.kind)) return false;
  if (event.kind !== 'item_loot') return true;
  return meetsFloor(event.itemQuality ?? 'common', settings.lootQualityFloor);
}

/**
 * Filters records to only story beats, honoring user settings (e.g., loot
 * quality floor). Preserves chronological order from the input.
 */
export function pickStoryBeats(
  records: AddonEventRecord[],
  settings?: StoryBeatSettings,
): AddonEventRecord[] {
  return records.filter((record) => isStoryBeat(record.event, settings));
}

/**
 * Returns a short noun-form label suitable for a beat list row.
 * Examples: "Accepted: The Defias Brotherhood", "Died at Klaven Mortwake",
 * "Leveled to 14", "Boss kill: Edwin VanCleef".
 *
 * Falls back to event.summary for unknown shapes.
 */
export function beatLabel(event: AddonEvent): string {
  switch (event.kind) {
    case 'quest_accepted':
      return labelWithFallback('Accepted', event.questName, event.summary);
    case 'quest_turned_in':
      return labelWithFallback('Completed', event.questName, event.summary);
    case 'level_up':
      return typeof event.playerLevel === 'number' ? `Leveled to ${event.playerLevel}` : event.summary;
    case 'player_death':
      return labelWithFallback('Died at', event.unitName ?? event.npcName ?? event.subZone ?? event.zone, event.summary);
    case 'achievement_earned':
      return labelWithFallback('Achievement', undefined, event.summary);
    case 'item_loot':
      return labelWithFallback('Looted', event.itemName, event.summary);
    case 'instance_enter_first':
      return labelWithFallback('Entered', event.zone ?? event.subZone, event.summary);
    case 'boss_kill':
      return labelWithFallback('Boss kill', event.unitName ?? event.npcName, event.summary);
    case 'instance_complete':
      return labelWithFallback('Instance complete', event.zone ?? event.subZone, event.summary);
    default:
      return event.summary;
  }
}

/**
 * A short emoji glyph suitable for visual differentiation in a list.
 * Examples: '◯' for quest_accepted, '✓' for quest_turned_in,
 * '⬆' for level_up, '💀' for player_death, '🏆' for achievement_earned,
 * '💎' for item_loot, '🗺' for instance_enter_first, '⚔' for boss_kill,
 * '🏁' for instance_complete.
 */
export function beatGlyph(kind: AddonEventKind): string {
  switch (kind) {
    case 'quest_accepted':
      return '◯';
    case 'quest_turned_in':
      return '✓';
    case 'level_up':
      return '⬆';
    case 'player_death':
      return '💀';
    case 'achievement_earned':
      return '🏆';
    case 'item_loot':
      return '💎';
    case 'instance_enter_first':
      return '🗺';
    case 'boss_kill':
      return '⚔';
    case 'instance_complete':
      return '🏁';
    default:
      return '•';
  }
}

function labelWithFallback(prefix: string, value: string | undefined, fallback: string): string {
  return value?.trim() ? `${prefix}: ${value}` : fallback;
}
