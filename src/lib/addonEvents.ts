import type { CharacterBible } from '../types';

export type AddonEventKind =
  | 'quest_detail'
  | 'quest_accepted'
  | 'quest_objective_progress'
  | 'quest_turned_in'
  | 'gossip_show'
  | 'zone_changed'
  | 'level_up'
  | 'unit_kill'
  | 'item_use'
  | 'escort_start';

export type WowEventName =
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
  playerLevel?: number;
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

export interface AddonEvent {
  id: string;
  source: AddonEventSource;
  kind: AddonEventKind;
  wowEvent: WowEventName;
  timestamp: number;
  chainId?: string;
  chainTitle?: string;
  stepId?: string;
  questId?: number;
  questName?: string;
  questWowheadUrl?: string;
  faction?: CharacterBible['faction'];
  zone?: string;
  subZone?: string;
  npcName?: string;
  npcId?: number;
  unitName?: string;
  itemName?: string;
  playerLevel?: number;
  summary: string;
  storyCard?: QuestStoryCard;
  questTextEnrichment?: QuestTextEnrichment;
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
): AddonEvent {
  const now = Date.now();
  return {
    id: `addon_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    source: 'simulator',
    kind: template.kind,
    wowEvent: template.wowEvent,
    timestamp: now,
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

export function formatEventLabel(event: Pick<AddonEvent, 'wowEvent' | 'questId' | 'questName'>): string {
  const quest = event.questId ? ` · #${event.questId}${event.questName ? ` ${event.questName}` : ''}` : '';
  return `${event.wowEvent}${quest}`;
}
