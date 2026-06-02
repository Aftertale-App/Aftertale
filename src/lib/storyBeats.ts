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

// ============================================================================
// Narrative weight — how "story-worthy" a session is, used to scale chapter
// length so a marathon doesn't get compressed into the same 3 paragraphs as a
// quick errand run. Not every beat counts equally: a hard-won quest turn-in or
// a death is a real story moment; accepting a quest is a lighter thread-opener.
//
// In WoW the quest log IS the story spine, so quests carry real weight (a
// turn-in is the payoff of a thread). Tune these freely — they're the only
// knobs that decide how long a chapter gets.
// ============================================================================
export const BEAT_WEIGHTS: Record<AddonEventKind, number> = {
  quest_turned_in: 2,        // the payoff — a story thread lands
  quest_accepted: 1,         // a thread opens
  player_death: 3,           // drama spike
  boss_kill: 3,              // set-piece
  instance_complete: 2.5,    // a whole arc resolved
  achievement_earned: 2,     // milestone
  level_up: 1.5,             // milestone, rarer than quests
  instance_enter_first: 1.5, // new place, new stakes
  item_loot: 1,              // base; refined by quality below
} as Record<AddonEventKind, number>;

const LOOT_QUALITY_WEIGHT: Record<LootQuality, number> = {
  common: 0.5,
  uncommon: 0.75,
  rare: 1,
  epic: 2,
  legendary: 3,
};

/** Narrative weight of a single event (0 if it isn't a story beat at all). */
export function beatWeight(event: AddonEvent, settings: StoryBeatSettings = DEFAULT_STORY_BEAT_SETTINGS): number {
  if (!isStoryBeat(event, settings)) return 0;
  if (event.kind === 'item_loot') return LOOT_QUALITY_WEIGHT[event.itemQuality ?? 'common'];
  return BEAT_WEIGHTS[event.kind] ?? 1;
}

/** Total narrative weight of a session — the scaling signal for chapter length. */
export function sessionNarrativeScore(records: AddonEventRecord[], settings?: StoryBeatSettings): number {
  return records.reduce((sum, r) => sum + beatWeight(r.event, settings), 0);
}

// ----------------------------------------------------------------------------
// Chapter length tiers. Three user-facing sizes (the buttons on the session
// card). Each drives both the prose target injected into the prompt AND the
// token budget. `estOutputTokens` is the realistic fill used only for the
// "~4¢" cost estimate (models rarely use the whole maxTokens budget).
// ----------------------------------------------------------------------------
export type ChapterLengthId = 'quick' | 'full' | 'epic';

export interface ChapterLength {
  id: ChapterLengthId;
  label: string;        // button label
  blurb: string;        // one-liner under the option
  paragraphSpec: string;// injected into the prompt, e.g. "2 to 3"
  lingerSpec: string;   // closing-bullet count, e.g. "1 to 2"
  movements: boolean;   // allow titled scene-breaks (long sessions only)
  maxTokens: number;    // hard generation budget
  estOutputTokens: number; // realistic fill, for the cost estimate only
}

export const CHAPTER_LENGTHS: Record<ChapterLengthId, ChapterLength> = {
  quick: {
    id: 'quick', label: 'Quick recap', blurb: 'Short and sweet',
    paragraphSpec: '2 to 3', lingerSpec: '1 to 2', movements: false,
    maxTokens: 700, estOutputTokens: 450,
  },
  full: {
    id: 'full', label: 'Full chapter', blurb: 'The whole session, as a chapter',
    paragraphSpec: '4 to 7', lingerSpec: '2 to 3', movements: false,
    maxTokens: 1900, estOutputTokens: 1300,
  },
  epic: {
    id: 'epic', label: 'Epic', blurb: 'A long, multi-part chapter',
    paragraphSpec: '9 to 12', lingerSpec: '2 to 3', movements: true,
    maxTokens: 3400, estOutputTokens: 2600,
  },
};

export const CHAPTER_LENGTH_ORDER: ChapterLengthId[] = ['quick', 'full', 'epic'];

// Score thresholds that pick the *recommended* size. Below `full` → quick;
// at/above `epic` → epic; the broad middle → full. See the worked examples in
// the design notes: ~quick run ≈ 12, ~1hr ≈ 25, ~2hr ≈ 55, ~3-4hr ≈ 100.
export const RECOMMEND_THRESHOLDS = { full: 12, epic: 45 };

export function recommendChapterLength(score: number): ChapterLengthId {
  if (score >= RECOMMEND_THRESHOLDS.epic) return 'epic';
  if (score >= RECOMMEND_THRESHOLDS.full) return 'full';
  return 'quick';
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
