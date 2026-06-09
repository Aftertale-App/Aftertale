import type { CharacterBible } from '../types';
import type { AddonEvent, AddonIngestResult } from './addonEvents';
import {
  appendAddonEventRecord,
  hasAddonEvent,
  upsertAddonEventRecord,
} from './addonEventStore';
import {
  createStubBibleFromCharacter,
  findBibleByCharacterGuid,
  loadBible,
  updateActiveBible,
  updateBibleByKey,
} from './bibleStore';
import { ingestChroniclesSavedVariables } from './savedVariablesIngest';
import { normalizeCharacters } from './addonSchema';
import { parseSavedVariables, type LuaValue } from './luaSavedVariables';

export interface ImportCharacter {
  guid: string;
  name: string;
  realm?: string;
  wowClass?: string;
  wowRace?: string;
  faction?: 'Alliance' | 'Horde' | 'Neutral';
  /** WoW UnitSex: 2 male, 3 female (absent = unknown). */
  sex?: number;
  eventCount: number;
}

export interface ImportPlan {
  schemaVersion: number;
  fileMeta: {
    characterName?: string;
    realm?: string;
  };
  characters: ImportCharacter[];
  legacyEventCount: number;
  totalEvents: number;
  rawEvents: AddonEvent[];
}

export interface CommitOptions {
  bible: CharacterBible;
  acceptGuids: string[];
  includeLegacy: boolean;
}

export interface CommitResult {
  imported: number;
  refreshed: number;
  skipped: number;
  characterKey: string;
  biblePatch?: Partial<Pick<CharacterBible, 'level' | 'currentZone' | 'sex'>>;
}

function characterKey(createdAt: number): string {
  return String(createdAt);
}

function isObj(v: LuaValue | undefined): v is { [k: string]: LuaValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: LuaValue | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function asNumber(v: LuaValue | undefined): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

interface CharacterRegistryEntry {
  guid: string;
  name?: string;
  realm?: string;
  wowClass?: string;
  wowRace?: string;
  faction?: 'Alliance' | 'Horde' | 'Neutral';
  sex?: number;
}

function getAftertaleDb(content: string): { db: { [k: string]: LuaValue } | null; rawEvents: AddonEvent[] } {
  const parsed = parseSavedVariables(content);
  const db = parsed.AftertaleDB ?? (parsed as Record<string, LuaValue>).ChroniclesOfAzerothDB;
  const result = ingestChroniclesSavedVariables(parsed);
  return { db: isObj(db) ? db : null, rawEvents: result.events };
}

function readCharacterRegistry(db: { [k: string]: LuaValue } | null): Map<string, CharacterRegistryEntry> {
  // Identity normalization (nested `identity` vs. legacy flat) lives in the
  // canonical layer so this reader and characterIngest.ts can never disagree
  // about the schema — see src/lib/addonSchema.ts and docs/addon-sv-format.md.
  const registry = new Map<string, CharacterRegistryEntry>();
  for (const rec of normalizeCharacters(db)) {
    registry.set(rec.guid, {
      guid: rec.guid,
      name: rec.identity.name,
      realm: rec.identity.realm,
      wowClass: rec.identity.class,
      wowRace: rec.identity.race,
      faction: rec.identity.faction,
      sex: rec.identity.sex,
    });
  }
  return registry;
}

function readFileMeta(db: { [k: string]: LuaValue } | null): ImportPlan['fileMeta'] {
  if (!db || !isObj(db.meta)) return {};
  return {
    characterName: asString(db.meta.characterName),
    realm: asString(db.meta.realm),
  };
}

export function planImport(content: string): ImportPlan {
  const { db, rawEvents } = getAftertaleDb(content);
  const schemaVersion = asNumber(db?.schemaVersion) ?? 1;
  const registry = readCharacterRegistry(db);
  const buckets = new Map<string, ImportCharacter>();
  let legacyEventCount = 0;

  for (const event of rawEvents) {
    const guid = event.char?.trim();
    if (!guid) {
      legacyEventCount++;
      continue;
    }

    const registered = registry.get(guid);
    const existing = buckets.get(guid);
    if (existing) {
      existing.eventCount++;
      if (!existing.name && (event.charName || registered?.name)) {
        existing.name = event.charName ?? registered?.name ?? guid.slice(-8);
      }
      continue;
    }

    buckets.set(guid, {
      guid,
      name: event.charName ?? registered?.name ?? guid.slice(-8),
      realm: registered?.realm,
      wowClass: registered?.wowClass,
      wowRace: registered?.wowRace,
      faction: registered?.faction,
      sex: registered?.sex,
      eventCount: 1,
    });
  }

  return {
    schemaVersion,
    fileMeta: readFileMeta(db),
    characters: Array.from(buckets.values()).sort((a, b) => b.eventCount - a.eventCount),
    legacyEventCount,
    totalEvents: rawEvents.length,
    rawEvents,
  };
}

export function commitImport(plan: ImportPlan, opts: CommitOptions): CommitResult {
  const key = characterKey(opts.bible.createdAt);
  const accepted = new Set(opts.acceptGuids.map((guid) => guid.trim()).filter(Boolean));
  const savedAt = Date.now();
  let imported = 0;
  let refreshed = 0;
  let skipped = 0;
  let latest: AddonEvent | undefined;

  for (const event of plan.rawEvents) {
    const guid = event.char?.trim();
    const shouldImport = guid ? accepted.has(guid) : opts.includeLegacy;
    if (!shouldImport) {
      skipped++;
      continue;
    }

    // Upsert: re-importing the same file refreshes stored event shape so a
    // newer parser pass (e.g. corrected playerLevel) reaches the UI without
    // forcing users to clear first. Re-stamps under the active bible's key.
    const outcome = upsertAddonEventRecord({
      event,
      characterKey: key,
      result: {
        status: 'ingested',
        message: 'Imported from SavedVariables.',
        changes: [],
        characterKey: key,
      },
      savedAt,
    });
    if (outcome === 'inserted') imported++;
    else refreshed++;

    if (!latest || event.timestamp > latest.timestamp) latest = event;
  }

  // Propagate latest snapshot to the bible so "current level / zone" reflects
  // the freshest event in the import, not whatever the live ingest path
  // happened to leave behind. Only applies when something was actually
  // imported for the active bible.
  const biblePatch: NonNullable<CommitResult['biblePatch']> = {};
  if (latest && (imported > 0 || refreshed > 0)) {
    // Use the max observed level across accepted events, not the snapshot on
    // the latest event by timestamp -- PLAYER_LOGOUT in particular can carry
    // a teardown-stale UnitLevel that would drag the bible level backwards.
    const acceptedLevels = plan.rawEvents
      .filter((event) => {
        const guid = event.char?.trim();
        return guid ? accepted.has(guid) : opts.includeLegacy;
      })
      .map((event) => event.playerLevel)
      .filter((level): level is number => typeof level === 'number' && level > 0);
    const maxLevel = acceptedLevels.length > 0 ? Math.max(...acceptedLevels) : undefined;
    if (typeof maxLevel === 'number' && maxLevel !== opts.bible.level) {
      biblePatch.level = maxLevel;
    }
    if (latest.zone && latest.zone !== opts.bible.currentZone) {
      biblePatch.currentZone = latest.zone;
    }
    // Backfill sex on bibles minted before the field existed.
    if (!opts.bible.sex) {
      const observed = plan.characters.find(
        (c) => accepted.has(c.guid) && (c.sex === 2 || c.sex === 3),
      );
      if (observed) biblePatch.sex = observed.sex;
    }
    if (Object.keys(biblePatch).length > 0) {
      updateActiveBible(biblePatch);
    }
  }

  return {
    imported,
    refreshed,
    skipped,
    characterKey: key,
    biblePatch: Object.keys(biblePatch).length > 0 ? biblePatch : undefined,
  };
}

// ---------------------------------------------------------------------------
// Multi-hero fan-out import — one Aftertale.lua holds every alt's events.
// Route each event to the bible bound to its GUID, light-creating draft heroes
// for unbound toons that have enough activity to be worth chronicling.
// ---------------------------------------------------------------------------

/** Min events before an unbound toon is auto-stubbed (keeps bank alts/mules out). */
export const STUB_MIN_EVENTS = 3;

export interface CommitAllOptions {
  /** Where untagged (legacy schema 1) events land. Usually the active hero. */
  legacyBibleKey?: string | null;
  includeLegacy?: boolean;
  /** GUIDs the player chose to import. Omit to import every eligible character. */
  acceptGuids?: string[];
  /** GUIDs the player explicitly opted OUT of (skip even if otherwise eligible). */
  declineGuids?: string[];
  autoStubThreshold?: number;
}

export interface PerCharacterCommit {
  guid: string;
  name: string;
  key: string;
  imported: number;
  refreshed: number;
  created: boolean;     // a captured record was minted for this toon
  needsSetup: boolean;  // hero still needs its authored layer
  started: boolean;     // player has begun this hero (vs captured-but-unstarted)
  level?: number;
}

export interface CommitAllResult {
  characters: PerCharacterCommit[];
  /** Toons skipped because they're too quiet to chronicle yet. */
  belowThreshold: Array<{ guid: string; name: string; eventCount: number }>;
  legacyImported: number;
  legacySkipped: number;
}

function maxLevelForGuid(plan: ImportPlan, guid: string): number | undefined {
  const levels = plan.rawEvents
    .filter((e) => e.char?.trim() === guid)
    .map((e) => e.playerLevel)
    .filter((l): l is number => typeof l === 'number' && l > 0);
  return levels.length > 0 ? Math.max(...levels) : undefined;
}

function latestZoneForGuid(plan: ImportPlan, guid: string): string | undefined {
  let latest: AddonEvent | undefined;
  for (const e of plan.rawEvents) {
    if (e.char?.trim() !== guid) continue;
    if (!latest || e.timestamp > latest.timestamp) latest = e;
  }
  return latest?.zone;
}

/**
 * Import every (chosen) character in the file in a single pass — established
 * heroes update their own chronicle, and unbound toons with enough activity get
 * a light-created draft hero. The active character is never changed here; the
 * caller decides who to view afterward.
 */
export function commitImportAll(plan: ImportPlan, opts: CommitAllOptions = {}): CommitAllResult {
  const threshold = opts.autoStubThreshold ?? STUB_MIN_EVENTS;
  const accept = opts.acceptGuids ? new Set(opts.acceptGuids.map((g) => g.trim())) : null;
  const decline = new Set((opts.declineGuids ?? []).map((g) => g.trim()));
  const savedAt = Date.now();

  // 1. Resolve each character → its target bible key (creating drafts as needed).
  const targetKeyByGuid = new Map<string, PerCharacterCommit>();
  const belowThreshold: CommitAllResult['belowThreshold'] = [];

  for (const character of plan.characters) {
    const guid = character.guid.trim();
    if (!guid) continue;
    if (decline.has(guid)) continue;
    if (accept && !accept.has(guid)) continue;

    const existing = findBibleByCharacterGuid(guid);
    if (existing) {
      // Backfill sex on bibles minted before the field existed, so pronoun
      // guidance reaches their future generations without recreating them.
      if (!existing.sex && (character.sex === 2 || character.sex === 3)) {
        updateBibleByKey(String(existing.createdAt), { sex: character.sex });
      }
      targetKeyByGuid.set(guid, {
        guid,
        name: character.name,
        key: String(existing.createdAt),
        imported: 0,
        refreshed: 0,
        created: false,
        needsSetup: Boolean(existing.needsSetup),
        started: Boolean(existing.started),
        level: existing.level,
      });
      continue;
    }

    if (character.eventCount < threshold) {
      belowThreshold.push({ guid, name: character.name, eventCount: character.eventCount });
      continue;
    }

    const stub = createStubBibleFromCharacter({
      guid,
      name: character.name,
      realm: character.realm,
      wowClass: character.wowClass,
      wowRace: character.wowRace,
      faction: character.faction,
      level: maxLevelForGuid(plan, guid),
      sex: character.sex,
    });
    targetKeyByGuid.set(guid, {
      guid,
      name: character.name,
      key: String(stub.createdAt),
      imported: 0,
      refreshed: 0,
      created: true,
      needsSetup: true,
      // Captured, not started — the import banks its moments; the player begins
      // it later from Meet Your Heroes / the import roster.
      started: false,
      level: stub.level,
    });
  }

  // 2. Route every event to its owner's chronicle.
  let legacyImported = 0;
  let legacySkipped = 0;
  for (const event of plan.rawEvents) {
    const guid = event.char?.trim();
    if (!guid) {
      if (opts.includeLegacy && opts.legacyBibleKey) {
        const outcome = upsertAddonEventRecord({
          event,
          characterKey: opts.legacyBibleKey,
          result: { status: 'ingested', message: 'Imported from SavedVariables.', changes: [], characterKey: opts.legacyBibleKey },
          savedAt,
        });
        if (outcome === 'inserted') legacyImported++;
        else legacyImported++;
      } else {
        legacySkipped++;
      }
      continue;
    }
    const target = targetKeyByGuid.get(guid);
    if (!target) continue; // declined, below threshold, or unselected
    const outcome = upsertAddonEventRecord({
      event,
      characterKey: target.key,
      result: { status: 'ingested', message: 'Imported from SavedVariables.', changes: [], characterKey: target.key },
      savedAt,
    });
    if (outcome === 'inserted') target.imported++;
    else target.refreshed++;
  }

  // 3. Refresh each touched hero's current level/zone from the freshest events.
  for (const target of targetKeyByGuid.values()) {
    if (target.imported === 0 && target.refreshed === 0 && !target.created) continue;
    const patch: Partial<CharacterBible> = {};
    const level = maxLevelForGuid(plan, target.guid);
    const zone = latestZoneForGuid(plan, target.guid);
    if (typeof level === 'number' && level !== target.level) patch.level = level;
    if (zone) patch.currentZone = zone;
    if (Object.keys(patch).length > 0) updateBibleByKey(target.key, patch);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('at:addon-events-updated'));
  }

  return {
    characters: Array.from(targetKeyByGuid.values()),
    belowThreshold,
    legacyImported,
    legacySkipped,
  };
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
  // addonEventRecords as source material for The Inkwell and the AI to
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
