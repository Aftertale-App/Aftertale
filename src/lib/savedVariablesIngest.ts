// ============================================================================
// SavedVariables ingest — converts the addon's AftertaleDB into
// the AddonEvent[] shape the web companion already understands.
//
// Pipeline:
//   raw Lua text  →  parseSavedVariables()  →  ParsedSavedVariables
//                 →  ingestChroniclesSavedVariables()  →  AddonEvent[]
//
// Critical invariant: every produced AddonEvent carries `rawTs` and `rawArgs`
// so chronicleExport.entryId() reconstructs the addon's exact EntryID
// byte-for-byte. Without that, the /aftertale sync round-trip silently skips.
// ============================================================================

import type { AddonEvent, AddonEventKind, LootItem, WowEventName } from './addonEvents';
import { parseSavedVariables, type LuaValue, type ParsedSavedVariables } from './luaSavedVariables';

export interface IngestSummary {
  /** Total addon events found in db.events. */
  found: number;
  /** Events successfully converted to AddonEvent. */
  converted: number;
  /** Events skipped (e.g. malformed, missing required fields). */
  skipped: number;
  /** Non-fatal warnings worth surfacing in the UI. */
  warnings: string[];
  /** db.schemaVersion if present (otherwise null). */
  schemaVersion: number | null;
  /** Sum of db.counts[*] if present (a sanity check vs. db.events length). */
  totalCount: number | null;
}

export interface IngestResult {
  events: AddonEvent[];
  summary: IngestSummary;
}

// ---------------------------------------------------------------------------
// LuaValue helpers — narrow ParsedSavedVariables values without crashing.
// ---------------------------------------------------------------------------

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

function asStringArray(v: LuaValue | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
    if (entry === null) return '';
    return '';
  });
}

// Strip WoW item-link control codes so the LLM sees just the readable name.
// Example: "|cffffffff|Hitem:2589::::::::1:::::::|h[Linen Cloth]|h|r" -> "Linen Cloth".
function plainItemName(link: string | undefined, fallback: string | undefined): string | undefined {
  if (typeof link === 'string') {
    const m = /\[(.+?)\]/.exec(link);
    if (m && m[1]) return m[1];
  }
  return fallback;
}

function extractLoot(enrichment: { [k: string]: LuaValue } | undefined): LootItem[] | undefined {
  if (!enrichment) return undefined;
  const raw = enrichment.loot;
  if (!Array.isArray(raw)) return undefined;
  const out: LootItem[] = [];
  for (const entry of raw) {
    if (!isObj(entry)) continue;
    const name = asString(entry.name);
    const link = asString(entry.link);
    const display = plainItemName(link, name);
    const qty = asNumber(entry.qty);
    const quality = asNumber(entry.quality);
    if (!display && quality === undefined && qty === undefined) continue;
    out.push({
      name: display,
      link,
      qty,
      quality,
    });
  }
  return out.length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// ts parsing — the addon writes `date("%Y-%m-%dT%H:%M:%S")` which is local
// time, no timezone suffix, second precision. We parse it as local time so
// it round-trips against tsLocalIso() in the export side.
// ---------------------------------------------------------------------------

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function parseLocalIso(s: string): number | null {
  const m = TS_RE.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const ms = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(se),
  ).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// Event-name → AddonEventKind mapping. For events we don't model in the
// typed kind union we fall back to a sensible default and rely on the
// downstream consumers using `wowEvent` (the raw string) as the source of
// truth. The cast is intentional: WowEventName/AddonEventKind exist for
// simulator-side autocomplete, not as runtime contracts.
// ---------------------------------------------------------------------------

function mapKind(wowEvent: string): AddonEventKind {
  switch (wowEvent) {
    case 'PLAYER_ENTERING_WORLD':
      return 'session_start';
    case 'PLAYER_LOGOUT':
      return 'session_end';
    case 'PLAYER_DEAD':
      return 'player_death';
    case 'QUEST_DETAIL':
      return 'quest_detail';
    case 'QUEST_ACCEPTED':
      return 'quest_accepted';
    case 'QUEST_PROGRESS':
      return 'quest_objective_progress';
    case 'QUEST_TURNED_IN':
      return 'quest_turned_in';
    case 'GOSSIP_SHOW':
      return 'gossip_show';
    case 'ZONE_CHANGED':
    case 'ZONE_CHANGED_NEW_AREA':
    case 'ZONE_CHANGED_INDOORS':
      return 'zone_changed';
    case 'PLAYER_LEVEL_UP':
      return 'level_up';
    case 'ENCOUNTER_END':
    case 'BOSS_KILL':
      return 'unit_kill';
    default:
      // Anything we don't recognise (TIME_PLAYED_MSG, PLAYER_LOGIN, combat
      // log spam, etc.) gets the neutral 'unknown' kind. Crucially this is
      // NOT 'session_start' — that used to be the default and it caused
      // every unmapped event to start a new session bucket in the trail.
      return 'unknown';
  }
}

function summarize(wowEvent: string, args: string[], enrichment: { [k: string]: LuaValue } | undefined): string {
  const zone = enrichment ? asString(enrichment.zoneText) : undefined;
  const questTitle = enrichment ? asString(enrichment.questTitle) : undefined;
  const npc = enrichment && isObj(enrichment.npc) ? asString(enrichment.npc.name) : undefined;
  const encounterName = enrichment ? asString(enrichment.encounterName) : undefined;
  const loot = extractLoot(enrichment);

  switch (wowEvent) {
    case 'QUEST_TURNED_IN':
      return questTitle
        ? `Turned in "${questTitle}"${zone ? ` in ${zone}` : ''}.`
        : `Turned in quest ${args[0] ?? ''}${zone ? ` in ${zone}` : ''}.`.trim();
    case 'QUEST_ACCEPTED':
      return questTitle
        ? `Accepted "${questTitle}"${zone ? ` in ${zone}` : ''}.`
        : `Accepted quest ${args[0] ?? ''}${zone ? ` in ${zone}` : ''}.`.trim();
    case 'QUEST_PROGRESS':
      return questTitle ? `Progress on "${questTitle}".` : `Progress on quest ${args[0] ?? ''}.`;
    case 'QUEST_DETAIL':
      return questTitle
        ? `Read details of "${questTitle}"${npc ? ` from ${npc}` : ''}.`
        : `Read quest details${npc ? ` from ${npc}` : ''}.`;
    case 'GOSSIP_SHOW':
      return npc ? `Spoke with ${npc}${zone ? ` in ${zone}` : ''}.` : `Spoke with an NPC.`;
    case 'PLAYER_LEVEL_UP':
      return `Reached level ${args[0] ?? ''}${zone ? ` in ${zone}` : ''}.`;
    case 'ZONE_CHANGED':
    case 'ZONE_CHANGED_NEW_AREA':
    case 'ZONE_CHANGED_INDOORS':
      return `Entered ${zone ?? 'a new area'}.`;
    case 'PLAYER_DEAD':
      return `Died${zone ? ` in ${zone}` : ''}.`;
    case 'PLAYER_ENTERING_WORLD':
      return `Entered the world${zone ? ` in ${zone}` : ''}.`;
    case 'PLAYER_LOGOUT':
      return `Logged out${zone ? ` from ${zone}` : ''}.`;
    case 'ENCOUNTER_END':
      return encounterName ? `Encounter ended: ${encounterName}.` : `Encounter ended.`;
    case 'BOSS_KILL':
      return encounterName ? `Defeated ${encounterName}.` : `Defeated a boss.`;
    case 'LOOT_OPENED': {
      if (!loot || loot.length === 0) return `Opened loot${zone ? ` in ${zone}` : ''}.`;
      const named = loot.filter((i) => i.name).map((i) => i.name as string);
      if (named.length === 0) return `Opened loot (${loot.length} items)${zone ? ` in ${zone}` : ''}.`;
      const preview = named.slice(0, 3).join(', ');
      const more = named.length > 3 ? ` and ${named.length - 3} more` : '';
      return `Found: ${preview}${more}${zone ? ` in ${zone}` : ''}.`;
    }
    default:
      return `${wowEvent}${args.length ? ` (${args.join(', ')})` : ''}`;
  }
}

/**
 * Convert a single Lua-parsed event row into an AddonEvent. Returns null when
 * required fields are missing.
 */
function rowToEvent(
  row: { [k: string]: LuaValue },
  fallbackId: string,
  warnings: string[],
): AddonEvent | null {
  const wowEvent = asString(row.event);
  const ts = asString(row.ts);
  if (!wowEvent || !ts) {
    warnings.push('Skipped event with missing `event` or `ts`.');
    return null;
  }
  const parsedTs = parseLocalIso(ts);
  if (parsedTs === null) {
    warnings.push(`Skipped event with unparseable ts "${ts}".`);
    return null;
  }
  const rawArgs = asStringArray(row.args);
  const enrichment = isObj(row.enrichment) ? row.enrichment : undefined;

  const id = asString(row.id) ?? fallbackId;
  const zone = enrichment ? asString(enrichment.zoneText) : undefined;
  const subZone = enrichment ? asString(enrichment.subzoneText) : undefined;
  const playerLevel = enrichment ? asNumber(enrichment.level) : undefined;
  const npc = enrichment && isObj(enrichment.npc) ? enrichment.npc : undefined;
  const npcName = npc ? asString(npc.name) : undefined;
  const questId = (() => {
    if (wowEvent.startsWith('QUEST_')) {
      const n = asNumber(rawArgs[0]);
      if (typeof n === 'number') return n;
    }
    return undefined;
  })();
  const questName = enrichment ? asString(enrichment.questTitle) : undefined;
  const unitName = enrichment ? asString(enrichment.encounterName) : undefined;
  const loot = extractLoot(enrichment);

  return {
    id,
    source: 'wow-addon',
    kind: mapKind(wowEvent),
    wowEvent: wowEvent as WowEventName,
    char: asString(row.char),
    charName: asString(row.charName),
    timestamp: parsedTs,
    rawTs: ts,
    rawArgs,
    rawT: asNumber(row.t),
    rawEnrichment: enrichment,
    zone,
    subZone,
    npcName,
    questId,
    questName,
    playerLevel,
    unitName,
    loot,
    summary: summarize(wowEvent, rawArgs, enrichment),
  };
}

/**
 * Convert a parsed SV blob into AddonEvents. Looks for the standard
 * AftertaleDB.events array. Any other top-level vars are ignored.
 */
export function ingestChroniclesSavedVariables(parsed: ParsedSavedVariables): IngestResult {
  const warnings: string[] = [];
  // Prefer the new (post-rebrand) global; fall back to the legacy name so
  // pre-rebrand SV captures still load. Remove the fallback after launch.
  const db = parsed.AftertaleDB ?? (parsed as Record<string, unknown>).ChroniclesOfAzerothDB as typeof parsed.AftertaleDB | undefined;
  if (!isObj(db)) {
    return {
      events: [],
      summary: {
        found: 0,
        converted: 0,
        skipped: 0,
        warnings: ['No AftertaleDB variable found in the file.'],
        schemaVersion: null,
        totalCount: null,
      },
    };
  }
  const events = db.events;
  if (!Array.isArray(events)) {
    return {
      events: [],
      summary: {
        found: 0,
        converted: 0,
        skipped: 0,
        warnings: ['AftertaleDB.events is missing or not an array.'],
        schemaVersion: asNumber(db.schemaVersion) ?? null,
        totalCount: null,
      },
    };
  }

  const schemaVersion = asNumber(db.schemaVersion) ?? null;
  const totalCount = (() => {
    if (!isObj(db.counts)) return null;
    let sum = 0;
    for (const v of Object.values(db.counts)) {
      const n = asNumber(v);
      if (typeof n === 'number') sum += n;
    }
    return sum;
  })();

  const out: AddonEvent[] = [];
  let converted = 0;
  let skipped = 0;
  for (let i = 0; i < events.length; i++) {
    const row = events[i];
    if (!isObj(row)) {
      skipped++;
      continue;
    }
    const fallback = `sv_${i.toString(36)}_${asString(row.ts) ?? 'noTs'}`;
    const event = rowToEvent(row, fallback, warnings);
    if (event) {
      out.push(event);
      converted++;
    } else {
      skipped++;
    }
  }

  // Cap warnings so a totally malformed file doesn't fill the UI.
  if (warnings.length > 8) {
    const extra = warnings.length - 8;
    warnings.length = 8;
    warnings.push(`(${extra} more warnings suppressed)`);
  }

  return {
    events: out,
    summary: {
      found: events.length,
      converted,
      skipped,
      warnings,
      schemaVersion,
      totalCount,
    },
  };
}

/** Convenience wrapper: text → IngestResult. Surfaces parse errors as a warning. */
export function ingestChroniclesSavedVariablesText(text: string): IngestResult {
  try {
    const parsed = parseSavedVariables(text);
    return ingestChroniclesSavedVariables(parsed);
  } catch (err) {
    return {
      events: [],
      summary: {
        found: 0,
        converted: 0,
        skipped: 0,
        warnings: [`Lua parse error: ${err instanceof Error ? err.message : String(err)}`],
        schemaVersion: null,
        totalCount: null,
      },
    };
  }
}
