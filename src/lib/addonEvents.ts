import type { CharacterBible } from '../types';
import type { LootQuality } from './storyBeatSettings';
import type { LuaValue } from './luaSavedVariables';

// Re-export so downstream tooling (chronicleSnippet) doesn't have to reach
// into luaSavedVariables for the same structural type.
export type { LuaValue } from './luaSavedVariables';

export type AddonEventKind =
  | 'session_start'
  | 'session_end'
  | 'quest_detail'
  | 'quest_accepted'
  | 'quest_objective_progress'
  | 'quest_turned_in'
  | 'gossip_show'
  | 'zone_changed'
  | 'level_up'
  | 'player_death'
  | 'achievement_earned'
  | 'unit_kill'
  | 'item_use'
  | 'item_loot'
  | 'escort_start'
  | 'instance_enter_first'
  | 'boss_kill'
  | 'instance_complete'
  // Downtime register — professions, gathering, wealth (see capture-expansion-scope.md)
  | 'profession_first'
  | 'profession_rank'
  | 'profession_session'
  | 'recipe_learned'
  | 'crafted_notable'
  | 'wealth_milestone'
  // Martial register — PvP
  | 'battleground'
  | 'arena_match'
  | 'rating_milestone'
  | 'world_pvp'
  | 'duel'
  | 'honor_milestone'
  | 'unknown';

export type WowEventName =
  | 'PLAYER_ENTERING_WORLD'
  | 'PLAYER_LOGIN'
  | 'PLAYER_LOGOUT'
  | 'PLAYER_DEAD'
  | 'QUEST_DETAIL'
  | 'QUEST_ACCEPTED'
  | 'QUEST_PROGRESS'
  | 'QUEST_TURNED_IN'
  | 'GOSSIP_SHOW'
  | 'ZONE_CHANGED'
  | 'ZONE_CHANGED_NEW_AREA'
  | 'PLAYER_LEVEL_UP'
  | 'COMBAT_LOG_EVENT_UNFILTERED'
  | 'UNIT_QUEST_LOG_CHANGED';

export type AddonEventSource = 'simulator' | 'wow-addon';

export interface QuestStoryCard {
  moment: string;
  setup: string;
  playerAction: string;
  outcome: string;
  emotionalWeight: string;
  chronicleEntry: string;
  tags: string[];
}

export interface AddonEventTemplate {
  kind: AddonEventKind;
  wowEvent: WowEventName;
  summary: string;
  zone?: string;
  subZone?: string;
  npcName?: string;
  npcId?: number;
  unitName?: string;
  itemName?: string;
  itemQuality?: LootQuality;
  playerLevel?: number;
}

export interface SimulatorEventOptions {
  sessionId?: string;
  timestamp?: number;
}

export interface QuestStepFixture {
  stepId: string;
  questId: number;
  questName: string;
  wowheadUrl: string;
  zone: string;
  npcName?: string;
  npcId?: number;
  storyCard: QuestStoryCard;
  events: AddonEventTemplate[];
}

export interface QuestChainFixture {
  id: string;
  title: string;
  faction: CharacterBible['faction'];
  era: 'classic';
  recommendedHero: string;
  zonePath: string[];
  summary: string;
  versionNotes: string;
  steps: QuestStepFixture[];
}

export interface QuestTextEnrichment {
  source: 'manual-paste' | 'wow-client-runtime';
  text: string;
  capturedAt: number;
}

// A (structured facts): quest objectives as DATA, from C_QuestLog.GetQuestObjectives.
// Short factual lines + type + counts — the QuestieDB tier of data, never the
// multi-paragraph quest-giver flavor prose. Safe to send to the LLM.
export interface QuestObjective {
  type?: string; // "monster" | "item" | "object" | "reputation" | ...
  text?: string; // short factual line, e.g. "Slay 10 Kobolds"
  need?: number;
  have?: number;
  done?: boolean;
}

// A (structured facts): reward facts captured at QUEST_COMPLETE — item
// names/links + money/xp. Names are facts, not lore. Safe to send.
export interface QuestRewards {
  items?: Array<{ kind?: string; name?: string; qty?: number; link?: string }>;
  money?: number;
  xp?: number;
}

// B (DEV/EXPERIMENTAL ONLY): verbatim Blizzard quest prose for the prose-quality
// A/B test. This is COPYRIGHTED text — only present when the addon's
// captureBlizzardText dev flag is on, and only fed to the LLM behind the web
// `richStorySeed` dev flag. NEVER ship to the default/paid pipeline.
export interface QuestRichText {
  description?: string;
  objectives?: string;
  progress?: string;
  reward?: string;
}

// One item captured from a LOOT_OPENED event (mirrors what `captureLoot`
// in the Lua addon emits). All fields are optional because Classic and
// Retail expose slightly different shapes from GetLootSlotInfo.
export interface LootItem {
  name?: string;
  link?: string;
  qty?: number;
  // WoW item quality enum: 0 Poor, 1 Common, 2 Uncommon, 3 Rare, 4 Epic,
  // 5 Legendary, 6 Artifact, 7 Heirloom. The web companion's filter
  // gates LOOT_OPENED enrichment by this value.
  quality?: number;
}

// Downtime-register detail (professions, gathering, wealth). Optional, only
// present on the relevant kinds.
export interface ProfessionDetail {
  skill?: string;        // "Blacksmithing", "Fishing", "Cooking", "Mining"…
  from?: number;         // session-rollup start skill value
  to?: number;           // session-rollup end / current skill value
  rank?: string;         // named rank crossed (Classic): "Journeyman", "Artisan"…
  recipe?: string;       // mastered recipe name
  itemName?: string;     // crafted notable item
  itemQuality?: LootQuality;
}

export interface WealthDetail {
  copper?: number;          // current total wealth, in copper
  thresholdCopper?: number; // the gold threshold just crossed, in copper
  // Narrator hint for the aspiration this wealth unlocks ("a first real mount",
  // "the epic mount within reach"). We narrate the meaning, never the number.
  aspiration?: string;
}

// Martial-register detail (battlegrounds, arenas, world PvP, duels).
export interface PvpDetail {
  battleground?: string;    // "Warsong Gulch", "Arathi Basin"…
  bracket?: string;         // arena bracket: "2v2", "3v3" — or BG size
  isArena?: boolean;
  won?: boolean;
  durationSec?: number;
  // After-action stats (from the scoreboard API; no combat log needed).
  killingBlows?: number;
  honorableKills?: number;
  deaths?: number;
  honor?: number;
  damage?: number;
  healing?: number;
  // Rated.
  rating?: number;
  ratingDelta?: number;
  ratingMilestone?: number; // crossed bracket (1500/1800/2000…)
  // Rivalry (real names ship on). rival = enemy standout from the scoreboard;
  // killer = best-effort "who killed me"; opponent = duel / world-pvp target.
  rivalName?: string;
  rivalClass?: string;
  rivalRace?: string;
  killerName?: string;
  opponentName?: string;
  opponentClass?: string;
  // World PvP.
  zone?: string;
  killStreak?: number;      // aggregated kills in a zone streak
  // Honor / PvP rank milestones.
  honorMilestone?: string;  // "Grunt", "Knight", or an HK threshold label
}

export interface AddonEvent {
  id: string;
  source: AddonEventSource;
  kind: AddonEventKind;
  wowEvent: WowEventName;
  // Populated by addon schemaVersion 2+; absent on older imports for legacy backwards compatibility.
  char?: string;
  charName?: string;
  timestamp: number;
  chainId?: string;
  chainTitle?: string;
  stepId?: string;
  questId?: number;
  questName?: string;
  questWowheadUrl?: string;
  // A (structured facts): objectives/rewards/tag as DATA. Safe to send to the LLM.
  questObjectives?: QuestObjective[];
  questRewards?: QuestRewards;
  questTag?: string;
  // B (dev/experimental): verbatim copyrighted quest prose. Gated by the addon
  // captureBlizzardText flag on capture + the web richStorySeed flag on use.
  questRichText?: QuestRichText;
  faction?: CharacterBible['faction'];
  zone?: string;
  subZone?: string;
  npcName?: string;
  npcId?: number;
  unitName?: string;
  itemName?: string;
  itemQuality?: LootQuality;
  playerLevel?: number;
  playerXp?: number;
  playerXpMax?: number;
  moneyCopper?: number;
  // Populated for LOOT_OPENED from `enrichment.loot[]`. The web filter
  // can gate this event by minimum quality before deciding to enrich.
  loot?: LootItem[];
  // Capture-expansion detail, present only on the relevant kinds.
  profession?: ProfessionDetail;
  wealth?: WealthDetail;
  pvp?: PvpDetail;
  sessionId?: string;
  summary: string;
  storyCard?: QuestStoryCard;
  questTextEnrichment?: QuestTextEnrichment;
  // Round-trip metadata for the at-CHRONICLE-V1 blob exported back to the
  // Lua addon. When the event was parsed out of the addon's SavedVariables,
  // we preserve the original ISO `ts` string (local time, second precision)
  // and the raw `args` array so we can reconstruct the addon's EntryID
  // byte-for-byte. Both are optional; simulator-generated events leave them
  // undefined and the export falls back to reconstructing from `timestamp`
  // and known typed fields.
  rawTs?: string;
  rawArgs?: string[];
  // Numeric GetTime() value from the original SV row, when we ingested from
  // SavedVariables. Preserved so the .lua restore snippet can round-trip
  // the row back to the addon byte-for-byte (it's harmless if approximated;
  // the addon only reads `ts` for templating, but other consumers may use
  // `t` for ordering inside the same session).
  rawT?: number;
  // Verbatim `enrichment` subtable from the original SV row. This is what
  // the parchment book's resolvers actually consume (zoneText, questTitle,
  // npc.name, encounterName, loot[], etc.). Preserved on ingest so the
  // restore snippet can hand it back to the addon untouched. Simulator
  // events have no rawEnrichment; the snippet writer synthesises a minimal
  // one from the typed fields in that case.
  rawEnrichment?: { [k: string]: LuaValue };
}

export interface AddonIngestResult {
  status: 'ingested' | 'skipped' | 'failed';
  message: string;
  changes: string[];
  characterKey?: string;
}

export function createSimulatorEvent(
  chain: QuestChainFixture,
  step: QuestStepFixture,
  template: AddonEventTemplate,
  questText?: string,
  options: SimulatorEventOptions = {},
): AddonEvent {
  const now = options.timestamp ?? Date.now();
  return {
    id: `addon_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'simulator',
    kind: template.kind,
    wowEvent: template.wowEvent,
    timestamp: now,
    sessionId: options.sessionId,
    chainId: chain.id,
    chainTitle: chain.title,
    stepId: step.stepId,
    questId: step.questId,
    questName: step.questName,
    questWowheadUrl: step.wowheadUrl,
    faction: chain.faction,
    zone: template.zone ?? step.zone,
    subZone: template.subZone,
    npcName: template.npcName ?? step.npcName,
    npcId: template.npcId ?? step.npcId,
    unitName: template.unitName,
    itemName: template.itemName,
    playerLevel: template.playerLevel,
    summary: template.summary,
    storyCard: step.storyCard,
    questTextEnrichment: questText?.trim()
      ? {
          source: 'manual-paste',
          text: questText.trim(),
          capturedAt: now,
        }
      : undefined,
  };
}

export function createSimulatorSessionEvent(
  kind: 'session_start' | 'session_end' | 'player_death',
  bible: Pick<CharacterBible, 'name' | 'level' | 'currentZone'> | null,
  sessionId: string,
  timestamp = Date.now(),
): AddonEvent {
  const zone = bible?.currentZone;
  const playerLevel = bible?.level;
  const name = bible?.name ?? 'The hero';
  const isStart = kind === 'session_start';
  const isEnd = kind === 'session_end';
  return {
    id: `addon_${kind}_${timestamp.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'simulator',
    kind,
    wowEvent: isStart ? 'PLAYER_ENTERING_WORLD' : isEnd ? 'PLAYER_LOGOUT' : 'PLAYER_DEAD',
    timestamp,
    sessionId,
    zone,
    playerLevel,
    summary: isStart
      ? `${name} entered the world${zone ? ` in ${zone}` : ''}.`
      : isEnd
        ? `${name} ended the play session${zone ? ` in ${zone}` : ''}.`
        : `${name} died${zone ? ` in ${zone}` : ''}.`,
  };
}

// Build a simulator event for a capture-expansion beat (profession / wealth /
// PvP). Used by the Addon Simulator to exercise the Downtime + Martial
// registers without a live addon. `wowEvent` is cosmetic for these (they're
// derived from CHAT_MSG_* / scoreboard, not a single WoW event), so we tag a
// reasonable source event for the log.
export function createSimulatorActivityEvent(
  kind: AddonEventKind,
  fields: Partial<AddonEvent> & { summary: string },
  bible: Pick<CharacterBible, 'name' | 'level' | 'currentZone'> | null,
  sessionId: string,
  timestamp = Date.now(),
): AddonEvent {
  return {
    id: `addon_${kind}_${timestamp.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'simulator',
    kind,
    wowEvent: 'COMBAT_LOG_EVENT_UNFILTERED',
    timestamp,
    sessionId,
    zone: bible?.currentZone,
    playerLevel: bible?.level,
    ...fields,
  };
}

export function formatEventLabel(event: Pick<AddonEvent, 'wowEvent' | 'questId' | 'questName'>): string {
  const quest = event.questId ? ` · #${event.questId}${event.questName ? ` ${event.questName}` : ''}` : '';
  return `${event.wowEvent}${quest}`;
}
