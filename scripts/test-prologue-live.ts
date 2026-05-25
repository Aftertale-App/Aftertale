/**
 * Prologue generator end-to-end dogfood. Real Gemini Flash call.
 *   npx tsx scripts/test-prologue-live.ts
 */

import { readFileSync, existsSync } from 'node:fs';

function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};

const { GeminiProvider } = await import('../src/providers/GeminiProvider');
const { generatePrologue } = await import('../src/lib/prologueGenerator');
const { loadRecentRecords } = await import('../src/lib/spendTracker');
import type { IngestedCharacter } from '../src/lib/characterIngest';

const apiKey = process.env.VITE_GEMINI_API_KEY;
if (!apiKey) { console.error('VITE_GEMINI_API_KEY missing'); process.exit(1); }

const provider = new GeminiProvider(apiKey);

const char: IngestedCharacter = {
  guid: 'Player-1234-ABCDEF00',
  identity: {
    name: 'Garygidney',
    realm: 'Earthen Ring',
    class: 'Rogue',
    race: 'Dwarf',
    sex: 2,
    faction: 'Alliance',
  },
  firstSeen: {
    timestamp: Math.floor(Date.now() / 1000),
    iso: new Date().toISOString(),
    level: 12,
    zoneText: 'Loch Modan',
    subzoneText: 'Thelsamar',
    timePlayedSec: 3600,
  },
  classification: 'pre-existing',
  classificationReason: 'timePlayedSec > 60',
  onboardingState: 'pending',
  onboardingPayloadVersion: 1,
  sightings: 1,
  announced: false,
};

console.log('Generating prologue for', char.identity.name, '...\n');
const result = await generatePrologue(
  {
    character: char,
    profile: {
      disposition: 'stoic',
      moralCompass: 'honorable',
      socialStyle: 'lone-wolf',
      drive: 'vengeance',
      flaw: 'prideful',
      chosenAt: Math.floor(Date.now() / 1000),
      source: 'wizard',
    },
    seedAnswer: {
      question: "What's the half-told story we're walking into?",
      text: "I came north chasing the ones who burned my forge. They took my hammer. That's all that matters.",
    },
    intel: [
      { source: 'Altoholic', summary: 'Altoholic knows EarthenRing.Alliance.Garygidney: level 12 Rogue, 52 gold, Mining 75 / Engineering 12.' },
    ],
  },
  provider,
);

console.log('--- BIBLE ---');
console.log('name:', result.bible.name);
console.log('race/class/faction:', result.bible.race, result.bible.class, result.bible.faction);
console.log('homeland:', result.bible.homeland);
console.log('level:', result.bible.level, '| zone:', result.bible.currentZone);
console.log('\nbackstory ('+result.bible.backstory.split(/\s+/).length+' words):');
console.log(result.bible.backstory);
console.log('\nbeliefs:'); for (const b of result.bible.beliefs) console.log('  -', b);
console.log('motivations:'); for (const m of result.bible.motivations) console.log('  -', m);
if (result.bible.fears) { console.log('fears:'); for (const f of result.bible.fears) console.log('  -', f); }
if (result.bible.flaws) { console.log('flaws:'); for (const f of result.bible.flaws) console.log('  -', f); }
console.log('voice:', result.bible.voice);
console.log('coreQuote:', result.bible.coreQuote);

console.log('\n--- METRICS ---');
console.log('latency:', Math.round(result.latencyMs)+'ms');
console.log('tokens:', result.inputTokens, 'in /', result.outputTokens, 'out');
const records = loadRecentRecords(1);
const mine = records.filter(r => r.task === 'bible-gen');
const cost = mine.reduce((s, r) => s + r.costUsd, 0);
console.log('spend tracker entries (bible-gen):', mine.length, '| cost: $'+cost.toFixed(6));

// Quality checks
const forbidden = ['perhaps','likely','possibly','might have','could have','destiny','chosen one','prophecy','ancient evil','called to adventure','wider world beckoned','heeded the call'];
const all = JSON.stringify(result.bible).toLowerCase();
const hits = forbidden.filter(w => all.includes(w));
console.log('forbidden-word hits:', hits.length === 0 ? 'NONE ✓' : hits.join(', '));
const backstoryWords = result.bible.backstory.split(/\s+/).length;
console.log('backstory in 150-320 range?', backstoryWords >= 150 && backstoryWords <= 320 ? 'YES ✓' : 'NO ('+backstoryWords+')');
