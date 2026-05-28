import type { CharacterBible } from '../types';
import type { AddonEvent, AddonIngestResult } from './addonEvents';
import { appendAddonEventRecord, hasAddonEvent, loadAddonEventRecords } from './addonEventStore';
import { loadBible, updateActiveBible } from './bibleStore';
import { ingestChroniclesSavedVariables } from './savedVariablesIngest';
import { parseSavedVariables, type LuaValue } from './luaSavedVariables';

export interface ImportCharacter {
  guid: string;
  name: string;
  realm?: string;
  wowClass?: string;
  wowRace?: string;
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
  skipped: number;
  characterKey: string;
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
}

function getAftertaleDb(content: string): { db: { [k: string]: LuaValue } | null; rawEvents: AddonEvent[] } {
  const parsed = parseSavedVariables(content);
  const db = parsed.AftertaleDB ?? (parsed as Record<string, LuaValue>).ChroniclesOfAzerothDB;
  const result = ingestChroniclesSavedVariables(parsed);
  return { db: isObj(db) ? db : null, rawEvents: result.events };
}

function readCharacterRegistry(db: { [k: string]: LuaValue } | null): Map<string, CharacterRegistryEntry> {
  const registry = new Map<string, CharacterRegistryEntry>();
  if (!db || !isObj(db.characters)) return registry;
  for (const [guid, value] of Object.entries(db.characters)) {
    if (!isObj(value)) continue;
    registry.set(guid, {
      guid,
      name: asString(value.name),
      realm: asString(value.realm),
      wowClass: asString(value.class) ?? asString(value.classFile),
      wowRace: asString(value.race) ?? asString(value.raceFile),
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
  const existing = new Set(loadAddonEventRecords().map((r) => r.event.id));
  const savedAt = Date.now();
  let imported = 0;
  let skipped = 0;

  for (const event of plan.rawEvents) {
    const guid = event.char?.trim();
    const shouldImport = guid ? accepted.has(guid) : opts.includeLegacy;
    if (!shouldImport) {
      skipped++;
      continue;
    }
    if (existing.has(event.id) || hasAddonEvent(event.id)) {
      skipped++;
      continue;
    }

    appendAddonEventRecord({
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
    existing.add(event.id);
    imported++;
  }

  return { imported, skipped, characterKey: key };
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
