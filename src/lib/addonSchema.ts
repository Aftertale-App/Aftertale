// ============================================================================
// Canonical normalization layer for the addon SavedVariables format.
//
// This is the SINGLE source of truth for turning raw parsed Lua (the
// `AftertaleDB` global) into the canonical shapes the rest of the web app
// consumes. Both character-registry readers (characterIngest.ts and
// addonIngest.ts) route through here, so they can never disagree about the
// schema again — which is exactly the bug this module was created to kill
// (a Horde Orc Rogue importing as an "Alliance Unknown Adventurer" because
// one reader expected identity fields nested under `identity` and the other
// read them flat).
//
// Policy + format contract: docs/addon-sv-format.md.
// Design rules:
//   - Tolerant: unknown fields/tables are ignored, never fatal.
//   - Version-stamp forward, shape-sniff backward: prefer the addon's explicit
//     `v` / `meta.capabilities` where present; fall back to shape detection for
//     records written before those stamps existed.
// ============================================================================

import type { LuaValue } from './luaSavedVariables';

// The canonical model version the web app normalizes TO. Independent of any
// single addon build's on-disk `schemaVersion`; bump when the canonical shape
// produced by this module changes (not when the addon merely adds a field the
// reader already tolerates).
export const CANONICAL_SCHEMA_VERSION = 4;

export type Faction = 'Alliance' | 'Horde' | 'Neutral';

export interface CanonicalIdentity {
  name?: string;
  realm?: string;
  class?: string;
  classFile?: string;
  race?: string;
  raceFile?: string;
  sex?: number;
  faction?: Faction;
}

export interface CanonicalCharacterRecord {
  guid: string;
  identity: CanonicalIdentity;
  /** The raw character record, passed through so callers can read firstSeen /
   *  lastSeen / classification without re-walking the registry themselves. */
  raw: { [k: string]: LuaValue };
  /** Which addon schema generation this record's identity came from. */
  identityShape: 'nested' | 'flat';
}

export interface AddonCapabilities {
  /** db.schemaVersion (or db.meta.schemaVersion), if present. */
  fileSchemaVersion: number | null;
  /** db.meta.capabilities manifest: feature name -> version int. Empty for
   *  addon builds older than schema 4 (no manifest written). */
  features: Record<string, number>;
}

// ---------------------------------------------------------------------------
// narrow helpers (tolerant — never throw on unexpected Lua shapes)
// ---------------------------------------------------------------------------

export function isObj(v: LuaValue | undefined): v is { [k: string]: LuaValue } {
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

function asFaction(v: LuaValue | undefined): Faction | undefined {
  const s = asString(v);
  return s === 'Alliance' || s === 'Horde' || s === 'Neutral' ? s : undefined;
}

/** Pull the AftertaleDB global out of a parsed file, tolerating the legacy
 *  pre-rebrand global name. Returns null if neither is present/an object. */
export function getAftertaleDb(parsed: Record<string, LuaValue>): { [k: string]: LuaValue } | null {
  const db = parsed.AftertaleDB ?? (parsed as Record<string, LuaValue>).ChroniclesOfAzerothDB;
  return isObj(db) ? db : null;
}

// ---------------------------------------------------------------------------
// identity normalization — the heart of this module
// ---------------------------------------------------------------------------

/**
 * Normalize one `characters[guid]` record into a canonical identity.
 *
 * Identity lives nested under `value.identity` (addon schema ≥ 2). A handful of
 * legacy / hand-authored captures put the fields flat on the record instead —
 * we tolerate both. Reading flat off a nested record (the original bug) left
 * every field undefined, so heroes defaulted to Alliance / Unknown / Adventurer.
 */
export function normalizeCharacterRecord(
  guid: string,
  raw: LuaValue | undefined,
): CanonicalCharacterRecord | null {
  if (!isObj(raw)) return null;
  const nested = isObj(raw.identity);
  const src = nested ? (raw.identity as { [k: string]: LuaValue }) : raw;
  const identity: CanonicalIdentity = {
    name: asString(src.name),
    realm: asString(src.realm),
    class: asString(src.class) ?? asString(src.classFile),
    classFile: asString(src.classFile),
    race: asString(src.race) ?? asString(src.raceFile),
    raceFile: asString(src.raceFile),
    sex: asNumber(src.sex),
    faction: asFaction(src.faction),
  };
  return { guid, identity, raw, identityShape: nested ? 'nested' : 'flat' };
}

/** Normalize every character in `db.characters`. Skips non-object records. */
export function normalizeCharacters(
  db: { [k: string]: LuaValue } | null,
): CanonicalCharacterRecord[] {
  const out: CanonicalCharacterRecord[] = [];
  if (!db || !isObj(db.characters)) return out;
  for (const [guid, raw] of Object.entries(db.characters)) {
    const rec = normalizeCharacterRecord(guid, raw);
    if (rec) out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------------------
// capability / version manifest
// ---------------------------------------------------------------------------

/** Read the file-level schema version + capability manifest. Both are absent on
 *  older addon builds; callers should treat missing features as "unknown
 *  capability", distinct from "feature present but empty". */
export function readCapabilities(db: { [k: string]: LuaValue } | null): AddonCapabilities {
  const meta = db && isObj(db.meta) ? db.meta : undefined;
  const fileSchemaVersion =
    (db ? asNumber(db.schemaVersion) : undefined) ??
    (meta ? asNumber(meta.schemaVersion) : undefined) ??
    null;
  const features: Record<string, number> = {};
  if (meta && isObj(meta.capabilities)) {
    for (const [k, v] of Object.entries(meta.capabilities)) {
      const n = asNumber(v);
      if (typeof n === 'number') features[k] = n;
    }
  }
  return { fileSchemaVersion, features };
}

/** The writer-schema version stamped on an event (`v`), or null for events
 *  written before the stamp existed (addon schema < 4). */
export function eventWriterVersion(event: { [k: string]: LuaValue } | undefined): number | null {
  if (!isObj(event)) return null;
  return asNumber(event.v) ?? null;
}
