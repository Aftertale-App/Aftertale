// ===========================================================================
// Golden-fixture test for the addon SavedVariables canonical layer.
//   npx vite-node tools/test-golden-fixtures.mjs
//
// Runs the canonical normalization (src/lib/addonSchema.ts) + both registry
// readers against REAL-SHAPED captures in tools/fixtures/golden/, one per addon
// era. This is the test that would have caught the "Alliance Unknown Adventurer"
// bug: the fixtures match what the addon actually writes (nested `identity`,
// mixed event generations), not a tidied-up shape.
//
// Policy: every addon schema change adds a golden file here + a case below.
// See docs/addon-sv-format.md.
// ===========================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// --- minimal browser polyfills (before app modules load) --------------------
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

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { parseSavedVariables } = await import(join(root, 'src/lib/luaSavedVariables.ts'));
const {
  getAftertaleDb, normalizeCharacters, readCapabilities, eventWriterVersion,
  CANONICAL_SCHEMA_VERSION,
} = await import(join(root, 'src/lib/addonSchema.ts'));
const { planImport } = await import(join(root, 'src/lib/addonIngest.ts'));
const { ingestCharactersFromParsed } = await import(join(root, 'src/lib/characterIngest.ts'));

// --- tiny assert harness ----------------------------------------------------
let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const load = (file) => readFileSync(join(here, 'fixtures/golden', file), 'utf8');
const byName = (chars, name) => chars.find((c) => (c.identity?.name ?? c.name) === name);

// ===========================================================================
console.log(`\ncanonical layer (CANONICAL_SCHEMA_VERSION=${CANONICAL_SCHEMA_VERSION})`);
check('CANONICAL_SCHEMA_VERSION is a positive int', Number.isInteger(CANONICAL_SCHEMA_VERSION) && CANONICAL_SCHEMA_VERSION > 0);

// ===========================================================================
console.log('\nfutony-v0.5.2-multigen.lua — 3 schema eras in one file');
{
  const content = load('futony-v0.5.2-multigen.lua');
  const parsed = parseSavedVariables(content);
  const db = getAftertaleDb(parsed);
  const canon = normalizeCharacters(db);

  // --- identity resolves from nested `identity` (the bug's blast radius) ----
  const futony = byName(canon, 'Futony');
  check('Futony present in registry', !!futony);
  check('Futony faction = Horde', futony?.identity.faction === 'Horde', `got ${futony?.identity.faction}`);
  check('Futony race = Orc', futony?.identity.race === 'Orc', `got ${futony?.identity.race}`);
  check('Futony class = Rogue', futony?.identity.class === 'Rogue', `got ${futony?.identity.class}`);
  check('Futony identityShape = nested', futony?.identityShape === 'nested');

  const ember = byName(canon, 'Emberfox');
  check('Emberfox = Horde Vulpera Shaman',
    ember?.identity.faction === 'Horde' && ember?.identity.race === 'Vulpera' && ember?.identity.class === 'Shaman',
    JSON.stringify(ember?.identity));

  const gary = byName(canon, 'Garygidney');
  check('Garygidney = Alliance Dwarf Warrior',
    gary?.identity.faction === 'Alliance' && gary?.identity.race === 'Dwarf' && gary?.identity.class === 'Warrior',
    JSON.stringify(gary?.identity));

  // --- planImport (event-bucketed) sees only char-tagged toons --------------
  const plan = planImport(content);
  const pFutony = plan.characters.find((c) => c.name === 'Futony');
  check('planImport: Futony = Horde Orc Rogue',
    pFutony?.faction === 'Horde' && pFutony?.wowRace === 'Orc' && pFutony?.wowClass === 'Rogue',
    JSON.stringify(pFutony));
  check('planImport: Emberfox bucketed', plan.characters.some((c) => c.name === 'Emberfox'));
  check('planImport: Garygidney NOT bucketed (legacy-only, no tagged events)',
    !plan.characters.some((c) => c.name === 'Garygidney'));

  // --- era distribution: the 3 untagged ERA-1 events are legacy -------------
  check('planImport: 3 legacy (untagged) events', plan.legacyEventCount === 3, `got ${plan.legacyEventCount}`);
  const tagged = plan.rawEvents.filter((e) => e.char);
  check('planImport: tagged events all carry a charName', tagged.every((e) => e.charName));
  const withSession = plan.rawEvents.filter((e) => e.sessionId);
  check('planImport: some events have session ids (ERA 3)', withSession.length >= 2, `got ${withSession.length}`);

  // --- ingestCharactersFromParsed sees ALL registry toons (incl. legacy) ----
  const ci = ingestCharactersFromParsed(parsed);
  check('characterIngest: all 3 registry characters', ci.characters.length === 3, `got ${ci.characters.length}`);
  const ciGary = byName(ci.characters, 'Garygidney');
  check('characterIngest: Garygidney identity intact (Alliance Dwarf Warrior)',
    ciGary?.identity.faction === 'Alliance' && ciGary?.identity.race === 'Dwarf' && ciGary?.identity.class === 'Warrior');

  // --- capabilities: old file has none; events carry no `v` stamp -----------
  const caps = readCapabilities(db);
  check('capabilities: fileSchemaVersion = 3', caps.fileSchemaVersion === 3, `got ${caps.fileSchemaVersion}`);
  check('capabilities: no manifest on a pre-schema-4 file', Object.keys(caps.features).length === 0);
  const rawEventObjs = Array.isArray(db.events) ? db.events : [];
  check('events: no `v` stamp on legacy events', rawEventObjs.every((e) => eventWriterVersion(e) === null));
}

// ===========================================================================
console.log('\nthaldris-v0.6.0-schema4.lua — forward path (v stamp + capabilities)');
{
  const content = load('thaldris-v0.6.0-schema4.lua');
  const parsed = parseSavedVariables(content);
  const db = getAftertaleDb(parsed);

  const caps = readCapabilities(db);
  check('capabilities: fileSchemaVersion = 4', caps.fileSchemaVersion === 4, `got ${caps.fileSchemaVersion}`);
  check('capabilities: events feature = 4', caps.features.events === 4, JSON.stringify(caps.features));
  check('capabilities: pvp feature present and 0 (Tier B not built)', caps.features.pvp === 0);
  check('capabilities: professions feature = 1', caps.features.professions === 1);

  const events = Array.isArray(db.events) ? db.events : [];
  check('events: all carry v=4 writer stamp', events.length > 0 && events.every((e) => eventWriterVersion(e) === 4));

  const canon = normalizeCharacters(db);
  const thal = byName(canon, 'Thaldris');
  check('Thaldris = Alliance Night Elf Druid',
    thal?.identity.faction === 'Alliance' && thal?.identity.race === 'Night Elf' && thal?.identity.class === 'Druid',
    JSON.stringify(thal?.identity));
}

// ===========================================================================
console.log('');
if (failures.length === 0) {
  console.log(`✅ PASS — ${pass} checks passed, 0 failed`);
  process.exit(0);
} else {
  console.log(`❌ FAIL — ${failures.length} failed, ${pass} passed`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exit(1);
}
