// ===========================================================================
// Headless logic test for the multi-alt import fan-out.
//   npx vite-node tools/test-import-fanout.mjs
//
// Covers the deterministic, key-free / game-free / Supabase-free core of the
// "one Aftertale.lua, many alts" import:
//   - planImport buckets events per character (name/race/class/faction)
//   - commitImportAll routes each event to its own chronicle
//   - active-enough new toons become draft heroes (needsSetup=true)
//   - quiet toons (< STUB_MIN_EVENTS) are skipped
//   - re-import is idempotent (refreshed, not duplicated)
//   - declineGuids opts a hero out
//   - an already-bound hero updates in place (no duplicate stub)
//
// Run by `/test-auto` as the import slice. Pure Node — polyfills the tiny bit of
// localStorage/window the stores touch, so no browser is needed.
// ===========================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// --- minimal browser polyfills (must exist before the app modules load) -----
class MemStorage {
  #m = new Map();
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
  key(i) { return Array.from(this.#m.keys())[i] ?? null; }
  get length() { return this.#m.size; }
}
globalThis.localStorage = new MemStorage();
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };

// --- load app modules AFTER polyfills ---------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { planImport, commitImportAll, STUB_MIN_EVENTS } = await import(join(root, 'src/lib/addonIngest.ts'));
const { loadAddonEventRecords } = await import(join(root, 'src/lib/addonEventStore.ts'));
const { listBibles, findBibleByCharacterGuid, saveBible } = await import(join(root, 'src/lib/bibleStore.ts'));

const LUA = readFileSync(join(here, 'fixtures/multi-alt.lua'), 'utf8');
const GUID_THAL = 'Player-100-AAAA0001';
const GUID_GRUK = 'Player-100-BBBB0002';
const GUID_COIN = 'Player-100-CCCC0003';

// --- tiny assert harness ----------------------------------------------------
let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function reset() { globalThis.localStorage.clear(); }
function keyForGuid(guid) {
  const b = findBibleByCharacterGuid(guid);
  return b ? String(b.createdAt) : null;
}

// === 1. planImport ==========================================================
console.log('\nplanImport (multi-character bucketing)');
{
  const plan = planImport(LUA);
  check('schemaVersion 3', plan.schemaVersion === 3, String(plan.schemaVersion));
  check('11 total events', plan.totalEvents === 11, String(plan.totalEvents));
  check('0 legacy events', plan.legacyEventCount === 0, String(plan.legacyEventCount));
  check('3 characters', plan.characters.length === 3, String(plan.characters.length));
  const thal = plan.characters.find((c) => c.guid === GUID_THAL);
  check('Thaldris parsed', !!thal);
  check('Thaldris is Night Elf Druid', thal?.wowRace === 'Night Elf' && thal?.wowClass === 'Druid', `${thal?.wowRace}/${thal?.wowClass}`);
  check('Thaldris faction Alliance', thal?.faction === 'Alliance', String(thal?.faction));
  check('Thaldris 5 events', thal?.eventCount === 5, String(thal?.eventCount));
  const gruk = plan.characters.find((c) => c.guid === GUID_GRUK);
  check('Grukmar faction Horde', gruk?.faction === 'Horde', String(gruk?.faction));
  check('Grukmar 4 events', gruk?.eventCount === 4, String(gruk?.eventCount));
  const coin = plan.characters.find((c) => c.guid === GUID_COIN);
  check('Coinpurse below threshold', (coin?.eventCount ?? 99) < STUB_MIN_EVENTS, `${coin?.eventCount} vs ${STUB_MIN_EVENTS}`);
}

// === 2. commitImportAll — fresh roster (fan-out + auto-stub) =================
console.log('\ncommitImportAll (fan-out into fresh roster)');
{
  reset();
  const plan = planImport(LUA);
  const result = commitImportAll(plan, { includeLegacy: false });

  const thal = result.characters.find((c) => c.guid === GUID_THAL);
  const gruk = result.characters.find((c) => c.guid === GUID_GRUK);
  check('Thaldris committed', !!thal);
  check('Grukmar committed', !!gruk);
  check('Coinpurse NOT committed', !result.characters.find((c) => c.guid === GUID_COIN));
  check('Coinpurse in belowThreshold', result.belowThreshold.some((b) => b.guid === GUID_COIN));

  check('Thaldris minted as draft', thal?.created === true && thal?.needsSetup === true);
  check('Grukmar minted as draft', gruk?.created === true && gruk?.needsSetup === true);
  check('Thaldris 5 events imported', thal?.imported === 5, String(thal?.imported));
  check('Grukmar 4 events imported', gruk?.imported === 4, String(gruk?.imported));

  // Events actually routed to the right chronicle.
  const thalKey = keyForGuid(GUID_THAL);
  const grukKey = keyForGuid(GUID_GRUK);
  check('5 records under Thaldris key', loadAddonEventRecords(thalKey).length === 5, String(loadAddonEventRecords(thalKey).length));
  check('4 records under Grukmar key', loadAddonEventRecords(grukKey).length === 4, String(loadAddonEventRecords(grukKey).length));
  check('no records under Coinpurse', !findBibleByCharacterGuid(GUID_COIN));

  // Stub identity + derived level (max playerLevel across that guid's events).
  const thalBible = findBibleByCharacterGuid(GUID_THAL);
  check('Thaldris bible identity', thalBible?.race === 'Night Elf' && thalBible?.class === 'Druid' && thalBible?.faction === 'Alliance');
  check('Thaldris level 12 (max)', thalBible?.level === 12, String(thalBible?.level));
  check('Thaldris currentZone Darkshore (latest)', thalBible?.currentZone === 'Darkshore', String(thalBible?.currentZone));
  const grukBible = findBibleByCharacterGuid(GUID_GRUK);
  check('Grukmar level 9 (max)', grukBible?.level === 9, String(grukBible?.level));

  // Roster has exactly the two drafts, both flagged needsSetup.
  const roster = listBibles();
  check('roster has 2 heroes', roster.length === 2, String(roster.length));
  check('both flagged needsSetup', roster.every((r) => r.needsSetup === true));
}

// === 3. Idempotent re-import ===============================================
console.log('\ncommitImportAll (re-import is idempotent)');
{
  // Continues from scenario 2's roster (do NOT reset).
  const plan = planImport(LUA);
  const result = commitImportAll(plan, { includeLegacy: false });
  const thal = result.characters.find((c) => c.guid === GUID_THAL);
  check('Thaldris not re-bound (created=false)', thal?.created === false);
  check('Thaldris 0 new, 5 refreshed', thal?.imported === 0 && thal?.refreshed === 5, `${thal?.imported}/${thal?.refreshed}`);
  check('still only 5 records under Thaldris', loadAddonEventRecords(keyForGuid(GUID_THAL)).length === 5);
  check('roster still 2 heroes (no dupes)', listBibles().length === 2, String(listBibles().length));
}

// === 4. declineGuids opt-out ===============================================
console.log('\ncommitImportAll (declineGuids opts a hero out)');
{
  reset();
  const plan = planImport(LUA);
  const result = commitImportAll(plan, { includeLegacy: false, declineGuids: [GUID_THAL] });
  check('Thaldris skipped (declined)', !result.characters.find((c) => c.guid === GUID_THAL));
  check('Thaldris bible NOT created', !findBibleByCharacterGuid(GUID_THAL));
  check('Grukmar still imported', !!result.characters.find((c) => c.guid === GUID_GRUK));
  check('roster has 1 hero', listBibles().length === 1, String(listBibles().length));
}

// === 5. Already-bound hero updates in place ================================
console.log('\ncommitImportAll (pre-bound hero updates, no duplicate stub)');
{
  reset();
  // Pre-seed an authored hero bound to Thaldris's GUID.
  const now = 1700000000000;
  saveBible({
    name: 'Thaldris the Elder', race: 'Night Elf', class: 'Druid', faction: 'Alliance',
    backstory: 'An authored hero.', beliefs: ['x'], motivations: ['y'], voice: 'calm',
    characterGuid: GUID_THAL, createdAt: now, updatedAt: now,
  });
  const plan = planImport(LUA);
  const result = commitImportAll(plan, { includeLegacy: false });
  const thal = result.characters.find((c) => c.guid === GUID_THAL);
  check('Thaldris routed to existing bible', thal?.key === String(now), `${thal?.key} vs ${now}`);
  check('Thaldris NOT re-created (created=false)', thal?.created === false);
  check('Thaldris not flagged needsSetup', thal?.needsSetup === false);
  check('5 records under existing Thaldris key', loadAddonEventRecords(String(now)).length === 5);
  // Grukmar still becomes a fresh draft alongside.
  check('Grukmar minted as new draft', result.characters.find((c) => c.guid === GUID_GRUK)?.created === true);
  check('roster has 2 heroes total', listBibles().length === 2, String(listBibles().length));
}

// === report =================================================================
console.log(`\n${failures.length === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failed:', failures.join(', '));
  process.exit(1);
}
