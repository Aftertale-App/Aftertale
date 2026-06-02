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
  // Downtime register
  'profession_first',
  'profession_rank',
  'profession_session',
  'recipe_learned',
  'crafted_notable',
  'wealth_milestone',
  // Martial register
  'battleground',
  'arena_match',
  'rating_milestone',
  'world_pvp',
  'duel',
  'honor_milestone',
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
  // Downtime register
  profession_rank: 2,        // crossed a named rank
  profession_first: 1.5,     // took up a craft for the first time
  profession_session: 1,     // a session of patient grind, rolled up
  recipe_learned: 1.5,       // mastered a recipe (notable bumped in beatWeight)
  crafted_notable: 2,        // forged something worth keeping
  wealth_milestone: 1.5,     // a fortune turned (big thresholds bumped)
  // Martial register
  battleground: 2.5,         // a full match (loss trimmed in beatWeight)
  arena_match: 2.5,          // a rated bout
  rating_milestone: 2,       // crossed a rated threshold
  world_pvp: 1.5,            // a zone killstreak, rolled up
  duel: 1,                   // settled it behind the inn
  honor_milestone: 1.5,      // a PvP rank / honor threshold
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
  let w = BEAT_WEIGHTS[event.kind] ?? 1;
  // A battleground/arena loss still earns a beat, just a slightly lighter one.
  if ((event.kind === 'battleground' || event.kind === 'arena_match') && event.pvp?.won === false) w -= 0.5;
  // Big fortunes and notable recipes weigh a touch more.
  if (event.kind === 'wealth_milestone' && (event.wealth?.thresholdCopper ?? 0) >= 10_000 * 10_000) w += 0.5;
  if (event.kind === 'recipe_learned' && event.profession?.itemQuality && event.profession.itemQuality !== 'common' && event.profession.itemQuality !== 'uncommon') w += 0.5;
  return w;
}

// ----------------------------------------------------------------------------
// Session register — the narrative voice a session earns, from which beats
// dominate its weight. The single most important concept for landing the
// non-combat storytelling: a fishing night must not be narrated like a raid.
// See docs/capture-expansion-scope.md §1.
// ----------------------------------------------------------------------------
export type SessionRegister = 'adventuring' | 'downtime' | 'martial';

const REGISTER_BY_KIND: Partial<Record<AddonEventKind, SessionRegister>> = {
  profession_first: 'downtime', profession_rank: 'downtime', profession_session: 'downtime',
  recipe_learned: 'downtime', crafted_notable: 'downtime', wealth_milestone: 'downtime',
  battleground: 'martial', arena_match: 'martial', rating_milestone: 'martial',
  world_pvp: 'martial', duel: 'martial', honor_milestone: 'martial',
  // everything else (quests, kills, zones, levels, instances) is adventuring
};

export function registerForKind(kind: AddonEventKind): SessionRegister {
  return REGISTER_BY_KIND[kind] ?? 'adventuring';
}

/**
 * Classify a session into the register that should set its narrative voice, by
 * summing beat weight per register and taking the max. Ties break toward the
 * rarer/spikier story winning the voice: martial > adventuring > downtime.
 * Returns 'adventuring' for an empty/beatless session.
 */
export function classifyRegister(records: AddonEventRecord[], settings?: StoryBeatSettings): SessionRegister {
  const totals: Record<SessionRegister, number> = { adventuring: 0, downtime: 0, martial: 0 };
  for (const r of records) {
    const w = beatWeight(r.event, settings);
    if (w > 0) totals[registerForKind(r.event.kind)] += w;
  }
  const order: SessionRegister[] = ['martial', 'adventuring', 'downtime'];
  let best: SessionRegister = 'adventuring';
  let bestVal = -1;
  for (const reg of order) {
    if (totals[reg] > bestVal) { bestVal = totals[reg]; best = reg; }
  }
  return bestVal <= 0 ? 'adventuring' : best;
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
    case 'profession_first':
      return labelWithFallback('Took up', event.profession?.skill, event.summary);
    case 'profession_rank':
      return event.profession?.skill && event.profession?.rank
        ? `${event.profession.skill}: ${event.profession.rank}`
        : labelWithFallback('Rank', event.profession?.rank, event.summary);
    case 'profession_session':
      return event.profession?.skill && typeof event.profession.from === 'number' && typeof event.profession.to === 'number'
        ? `${event.profession.skill} ${event.profession.from} to ${event.profession.to}`
        : labelWithFallback('Practiced', event.profession?.skill, event.summary);
    case 'recipe_learned':
      return labelWithFallback('Learned', event.profession?.recipe, event.summary);
    case 'crafted_notable':
      return labelWithFallback('Crafted', event.profession?.itemName ?? event.itemName, event.summary);
    case 'wealth_milestone':
      return labelWithFallback('Wealth', event.wealth?.aspiration, event.summary);
    case 'battleground':
      return labelWithFallback(event.pvp?.won ? 'Won' : 'Fought', event.pvp?.battleground, event.summary);
    case 'arena_match':
      return event.pvp?.bracket
        ? `Arena ${event.pvp.bracket}: ${event.pvp.won ? 'win' : 'loss'}`
        : labelWithFallback('Arena', event.pvp?.won ? 'win' : 'loss', event.summary);
    case 'rating_milestone':
      return typeof event.pvp?.ratingMilestone === 'number'
        ? `Reached ${event.pvp.ratingMilestone} rating`
        : labelWithFallback('Rating', undefined, event.summary);
    case 'world_pvp':
      return typeof event.pvp?.killStreak === 'number'
        ? `${event.pvp.killStreak} felled in ${event.pvp.zone ?? 'the field'}`
        : labelWithFallback('World PvP', event.pvp?.zone, event.summary);
    case 'duel':
      return labelWithFallback('Duel', event.pvp?.opponentName, event.summary);
    case 'honor_milestone':
      return labelWithFallback('Honor', event.pvp?.honorMilestone, event.summary);
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
    case 'profession_first':
      return '🔰';
    case 'profession_rank':
      return '🔨';
    case 'profession_session':
      return '⚒';
    case 'recipe_learned':
      return '📜';
    case 'crafted_notable':
      return '✨';
    case 'wealth_milestone':
      return '💰';
    case 'battleground':
      return '⚔';
    case 'arena_match':
      return '🏟';
    case 'rating_milestone':
      return '📈';
    case 'world_pvp':
      return '🗡';
    case 'duel':
      return '🤺';
    case 'honor_milestone':
      return '🎖';
    default:
      return '•';
  }
}

function labelWithFallback(prefix: string, value: string | undefined, fallback: string): string {
  return value?.trim() ? `${prefix}: ${value}` : fallback;
}
