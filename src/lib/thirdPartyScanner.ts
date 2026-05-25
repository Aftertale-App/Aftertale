/**
 * Third-party SavedVariables scanner.
 *
 * Phase 1.5-Web v1: best-effort, browser-side scanner. The user drops one
 * or more .lua SavedVariables files (their own addons' captures) onto a
 * file input; we parse each with the Lua subset parser and surface any
 * findings keyed by the target character's name / realm / GUID.
 *
 * Design rules:
 *   - Best-effort. Unknown addons get the generic walker, not an error.
 *   - Read-only. We never write back to addon files.
 *   - Per-addon registry of specific extractors keyed on file name pattern,
 *     each producing typed `IntelEntry[]`. New extractors slot in
 *     without touching the public API.
 *   - All findings are summarized into `{ source, summary }` so the
 *     Inspire Me prompt can ingest them via its existing `intel` field.
 *
 * Out of scope here (Phase 1 Electron will own these):
 *   - Filesystem traversal of WTF/Account/<ACCOUNT> directories
 *   - Combat log .txt grep
 *   - Screenshot folder count
 */

import { parseSavedVariables, LuaParseError, type LuaValue } from './luaSavedVariables';
import type { InspireMeIntel } from './inspireMePrompt';

export interface ScanInput {
  /** Original filename, e.g. "Altoholic.lua". Used for extractor routing. */
  filename: string;
  /** Raw lua source text. */
  content: string;
}

export interface ScanTargets {
  name: string;
  realm?: string;
  guid?: string;
}

export interface ScanFinding extends InspireMeIntel {
  /** Which input file produced this entry (filename, not full path). */
  filename: string;
  /** Best-effort confidence: 'exact' name+realm match, 'name' name only,
   *  'guid' GUID match, 'generic' from heuristic walk. */
  confidence: 'exact' | 'name' | 'guid' | 'generic';
}

export interface ScanResult {
  /** Per-file findings, ordered by confidence then by source. */
  findings: ScanFinding[];
  /** Files we could not parse, with the error message. */
  errors: Array<{ filename: string; error: string }>;
  /** Files parsed successfully with zero matches; useful for UI ("we
   *  scanned 4 files, found nothing in 2 of them"). */
  emptyFiles: string[];
}

// ---------------------------------------------------------------------------
// Extractor registry. Each entry's `matches(filename)` decides whether the
// extractor runs on a given input; the extractor returns 0..N findings.
// ---------------------------------------------------------------------------

interface Extractor {
  id: string;
  matches: (filename: string) => boolean;
  extract: (parsed: LuaValue, targets: ScanTargets) => ScanFinding[];
}

function lc(s: string): string {
  return s.toLowerCase();
}

function isTable(v: LuaValue): v is { [k: string]: LuaValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getKey(v: LuaValue, key: string): LuaValue {
  if (!isTable(v)) return null;
  const child = v[key];
  return child === undefined ? null : child;
}

/**
 * Walks an arbitrary Lua value tree looking for the target character's name
 * (case-insensitive). Returns a list of `path/value` summaries. Cap output
 * size to keep prompts cheap.
 */
function genericWalk(
  root: LuaValue,
  targets: ScanTargets,
  filename: string,
  maxFindings = 6,
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const nameLower = lc(targets.name);
  const realmLower = targets.realm ? lc(targets.realm) : null;
  const guidLower = targets.guid ? lc(targets.guid) : null;

  const stack: Array<{ value: LuaValue; path: string[] }> = [{ value: root, path: [] }];
  const seen = new WeakSet<object>();

  while (stack.length && findings.length < maxFindings) {
    const { value, path } = stack.pop()!;
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      const sl = lc(value);
      const hitGuid = guidLower && sl.includes(guidLower);
      const hitName = sl.includes(nameLower);
      if (hitGuid || hitName) {
        const pathStr = path.join('.') || '(root)';
        findings.push({
          filename,
          source: pathStr.split('.')[0] || filename,
          summary: `${filename} @ ${pathStr}: "${value.length > 120 ? value.slice(0, 120) + '…' : value}"`,
          confidence: hitGuid ? 'guid' : 'generic',
        });
      }
      continue;
    }

    if (typeof value !== 'object') continue;
    if (seen.has(value as object)) continue;
    seen.add(value as object);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && stack.length < 5000; i++) {
        stack.push({ value: value[i], path: [...path, String(i + 1)] });
      }
      continue;
    }

    for (const [k, v] of Object.entries(value as Record<string, LuaValue>)) {
      // Direct key hit: a table keyed by character name / "Name-Realm" / GUID.
      const kl = lc(k);
      const keyIsName = kl === nameLower;
      const keyIsNameRealm =
        realmLower && (kl === `${nameLower}-${realmLower}` || kl === `${nameLower} - ${realmLower}`);
      const keyIsGuid = guidLower && kl === guidLower;
      if (keyIsName || keyIsNameRealm || keyIsGuid) {
        const conf: ScanFinding['confidence'] = keyIsGuid
          ? 'guid'
          : keyIsNameRealm
          ? 'exact'
          : 'name';
        findings.push({
          filename,
          source: path[0] ?? filename,
          summary: `${filename}: table keyed by ${k} -> ${summarizeTable(v)}`,
          confidence: conf,
        });
      }
      if (stack.length < 5000) stack.push({ value: v, path: [...path, k] });
    }
  }

  return findings;
}

function summarizeTable(v: LuaValue): string {
  if (v === null) return 'nil';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  const keys = Object.keys(v);
  if (keys.length === 0) return '{}';
  const preview = keys.slice(0, 6).map((k) => {
    const cv = (v as Record<string, LuaValue>)[k];
    if (cv === null) return `${k}=nil`;
    if (typeof cv === 'string') return `${k}="${cv.length > 30 ? cv.slice(0, 30) + '…' : cv}"`;
    if (typeof cv === 'object') return `${k}=…`;
    return `${k}=${cv}`;
  });
  return `{ ${preview.join(', ')}${keys.length > 6 ? ', …' : ''} }`;
}

// ---------------------------------------------------------------------------
// Specific extractors — the priority list from plan.md lines 99-115.
// Each is intentionally tolerant: layout drift between versions returns
// empty, never throws.
// ---------------------------------------------------------------------------

const ALTOHOLIC: Extractor = {
  id: 'altoholic',
  matches: (fn) => /altoholic/i.test(fn) || /^altmanager/i.test(fn),
  extract: (root, targets) => {
    const out: ScanFinding[] = [];
    // Altoholic packs alts as AltoholicDB.global.Characters["Realm.Faction.Name"]
    const db = getKey(root, 'AltoholicDB') ?? root;
    const characters =
      getKey(getKey(db, 'global') ?? db, 'Characters') ?? getKey(db, 'Characters');
    if (isTable(characters)) {
      for (const [key, entry] of Object.entries(characters)) {
        if (lc(key).includes(lc(targets.name))) {
          out.push({
            filename: 'Altoholic',
            source: 'Altoholic',
            summary: `Altoholic knows ${key}: ${summarizeTable(entry)}`,
            confidence: 'name',
          });
        }
      }
    }
    return out;
  },
};

const RAIDERIO: Extractor = {
  id: 'raiderio',
  matches: (fn) => /raiderio/i.test(fn),
  extract: (root, targets) => {
    const out: ScanFinding[] = [];
    const db = getKey(root, 'RaiderIO_Profile') ?? getKey(root, 'RaiderIODB') ?? root;
    // Most RIO profiles live under .profile / .characters keyed by GUID or name
    const characters = getKey(db, 'characters') ?? getKey(db, 'profile');
    if (isTable(characters)) {
      for (const [key, entry] of Object.entries(characters)) {
        if (lc(key).includes(lc(targets.name))) {
          out.push({
            filename: 'Raider.IO',
            source: 'RaiderIO',
            summary: `Raider.IO profile for ${key}: ${summarizeTable(entry)}`,
            confidence: 'name',
          });
        }
      }
    }
    return out;
  },
};

const DETAILS: Extractor = {
  id: 'details',
  matches: (fn) => /^details/i.test(fn) || /skada/i.test(fn),
  extract: (root, targets) => {
    const out: ScanFinding[] = [];
    // Details! stores combat history under _detalhes_global.combat_history;
    // we just surface that it exists + size, since per-encounter prose is
    // too dense for the prompt.
    const detalhes = getKey(root, '_detalhes_global');
    if (isTable(detalhes)) {
      const history = getKey(detalhes, 'combat_history');
      const total = isTable(history) ? Object.keys(history).length : 0;
      if (total > 0) {
        out.push({
          filename: 'Details!',
          source: 'Details!',
          summary: `Details! has ${total} historical encounters logged for this account; the character may be a returning combatant.`,
          confidence: 'generic',
        });
      }
    }
    const skada = getKey(root, 'SkadaDB') ?? getKey(root, 'SkadaPDB');
    if (isTable(skada)) {
      const sets = getKey(skada, 'sets');
      const setCount = isTable(sets) ? Object.keys(sets).length : 0;
      if (setCount > 0) {
        out.push({
          filename: 'Skada',
          source: 'Skada',
          summary: `Skada has ${setCount} saved combat sets; the character has a recorded fighting history.`,
          confidence: 'generic',
        });
      }
    }
    // Fall back to a name-scoped walk so per-character data still surfaces.
    if (out.length === 0) {
      out.push(...genericWalk(root, targets, 'Details!/Skada', 3));
    }
    return out;
  },
};

const BAG_SYNC: Extractor = {
  id: 'bagsync',
  matches: (fn) => /bagsync/i.test(fn) || /bagbrother/i.test(fn),
  extract: (root, targets) => {
    const out: ScanFinding[] = [];
    const db = getKey(root, 'BagSyncDB') ?? getKey(root, 'BagBrother_DB') ?? root;
    // BagSync typically keys by realm -> faction -> name.
    if (isTable(db)) {
      const found: string[] = [];
      const walk = (v: LuaValue, depth: number): void => {
        if (depth > 5 || !isTable(v)) return;
        for (const [k, child] of Object.entries(v)) {
          if (lc(k) === lc(targets.name)) {
            found.push(`Inventory snapshot for ${k}: ${summarizeTable(child)}`);
          } else {
            walk(child, depth + 1);
          }
        }
      };
      walk(db, 0);
      for (const summary of found.slice(0, 3)) {
        out.push({
          filename: 'BagSync',
          source: 'BagSync',
          summary,
          confidence: 'name',
        });
      }
    }
    return out;
  },
};

const TSM: Extractor = {
  id: 'tsm',
  matches: (fn) => /tradeskillmaster|^tsm/i.test(fn),
  extract: (root) => {
    const out: ScanFinding[] = [];
    const tsm = getKey(root, 'TradeSkillMasterDB') ?? getKey(root, 'TSM_DB');
    if (isTable(tsm)) {
      out.push({
        filename: 'TradeSkillMaster',
        source: 'TSM',
        summary: 'Character has a TradeSkillMaster profile — likely engaged with the in-game economy (auctions, professions, gold-making).',
        confidence: 'generic',
      });
    }
    return out;
  },
};

const EXTRACTORS: Extractor[] = [ALTOHOLIC, RAIDERIO, DETAILS, BAG_SYNC, TSM];

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Scan an array of SV file inputs for findings on a target character.
 * Files that match a specific extractor are processed by that extractor
 * AND by the generic walker (catches data the extractor missed). Files
 * that match no specific extractor fall back to the generic walker.
 */
export function scanSavedVariables(inputs: ScanInput[], targets: ScanTargets): ScanResult {
  const findings: ScanFinding[] = [];
  const errors: Array<{ filename: string; error: string }> = [];
  const emptyFiles: string[] = [];

  for (const input of inputs) {
    let parsed: LuaValue;
    try {
      parsed = parseSavedVariables(input.content);
    } catch (e) {
      const msg = e instanceof LuaParseError ? e.message : String(e);
      errors.push({ filename: input.filename, error: msg });
      continue;
    }

    const initialCount = findings.length;
    const matchedExtractor = EXTRACTORS.find((x) => x.matches(input.filename));
    if (matchedExtractor) {
      try {
        findings.push(...matchedExtractor.extract(parsed, targets));
      } catch (e) {
        // Don't let an extractor bug kill the whole scan.
        errors.push({
          filename: input.filename,
          error: `extractor ${matchedExtractor.id} threw: ${String(e)}`,
        });
      }
    }
    // Always do a bounded generic walk; specific extractors may have
    // missed something interesting.
    try {
      findings.push(...genericWalk(parsed, targets, input.filename, 4));
    } catch (e) {
      errors.push({ filename: input.filename, error: `walker threw: ${String(e)}` });
    }

    if (findings.length === initialCount) {
      emptyFiles.push(input.filename);
    }
  }

  // Sort: exact > guid > name > generic; stable by source.
  const rank: Record<ScanFinding['confidence'], number> = {
    exact: 0,
    guid: 1,
    name: 2,
    generic: 3,
  };
  findings.sort((a, b) => {
    const r = rank[a.confidence] - rank[b.confidence];
    if (r !== 0) return r;
    return a.source.localeCompare(b.source);
  });

  // Dedupe by (source + summary). Keeps the highest-confidence copy.
  const seen = new Set<string>();
  const deduped: ScanFinding[] = [];
  for (const f of findings) {
    const key = `${f.source}::${f.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  return { findings: deduped, errors, emptyFiles };
}

/**
 * Convert findings to the lighter `InspireMeIntel[]` shape the prompt
 * accepts. Caps to N items so we don't blow the prompt budget.
 */
export function findingsToIntel(findings: ScanFinding[], max = 8): InspireMeIntel[] {
  return findings.slice(0, max).map(({ source, summary }) => ({ source, summary }));
}
