// ============================================================================
// Story beat settings — localStorage persistence for per-character curation
// knobs that decide which addon events rise above telemetry into Inkwell beats.
// Scoped per character so one hero's loot appetite does not bleed into another.
//
// Why this exists: The Inkwell needs a quiet, opinionated penning surface while
// preserving the full addon event stream for recap context. These settings tune
// that curation without changing ingest or historical telemetry.
// ============================================================================

export const STORAGE_PREFIX = 'at.story-beat-settings.';
export const STORY_BEAT_SETTINGS_UPDATED_EVENT = 'at:story-beat-settings-updated';

export type LootQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface StoryBeatSettings {
  /** Minimum loot quality that surfaces as a story beat. Default: 'rare'. */
  lootQualityFloor: LootQuality;
}

export const DEFAULT_STORY_BEAT_SETTINGS: StoryBeatSettings = {
  lootQualityFloor: 'rare',
};

function storageKey(characterKey: string): string {
  return `${STORAGE_PREFIX}${characterKey}`;
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(STORY_BEAT_SETTINGS_UPDATED_EVENT));
  } catch {
    // SSR / no DOM — silently drop.
  }
}

function normalizeSettings(value: unknown): StoryBeatSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STORY_BEAT_SETTINGS };
  const parsed = value as Partial<StoryBeatSettings>;
  return {
    lootQualityFloor: isLootQuality(parsed.lootQualityFloor)
      ? parsed.lootQualityFloor
      : DEFAULT_STORY_BEAT_SETTINGS.lootQualityFloor,
  };
}

function isLootQuality(value: unknown): value is LootQuality {
  return value === 'common'
    || value === 'uncommon'
    || value === 'rare'
    || value === 'epic'
    || value === 'legendary';
}

export function loadStoryBeatSettings(characterKey: string | null | undefined): StoryBeatSettings {
  if (!characterKey) return { ...DEFAULT_STORY_BEAT_SETTINGS };
  try {
    const raw = localStorage.getItem(storageKey(characterKey));
    if (!raw) return { ...DEFAULT_STORY_BEAT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STORY_BEAT_SETTINGS };
  }
}

export function saveStoryBeatSettings(characterKey: string, settings: StoryBeatSettings): void {
  if (!characterKey) return;
  try {
    localStorage.setItem(storageKey(characterKey), JSON.stringify(normalizeSettings(settings)));
    notify();
  } catch {
    // localStorage may be full or disabled — fail soft; in-memory state still works.
  }
}
