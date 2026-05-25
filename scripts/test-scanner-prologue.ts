// Smoke test: scanner on the real capture file, prologue generator with synthetic character.
import fs from 'node:fs';
import path from 'node:path';
import { scanSavedVariables } from '../src/lib/thirdPartyScanner';
import { buildProloguePrompt, parsePrologueResponse } from '../src/lib/prologueGenerator';
import type { IngestedCharacter } from '../src/lib/characterIngest';

const file = process.argv[2] ?? path.join(
  process.env.USERPROFILE ?? '.',
  '.copilot/session-state/b7129617-feb7-4581-965d-58cddfb1c65e/files/capture-02-retail.lua',
);
const content = fs.readFileSync(file, 'utf8');

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

// 1. Scan the capture file looking for Garygidney references
const scanResult = scanSavedVariables(
  [{ filename: path.basename(file), content }],
  { name: char.identity.name, realm: char.identity.realm, guid: char.guid },
);
console.log('Scan: findings='+scanResult.findings.length+' empty='+scanResult.emptyFiles.length+' errors='+scanResult.errors.length);
for (const f of scanResult.findings.slice(0, 4)) {
  console.log('  ['+f.confidence+'] '+f.source+': '+f.summary.slice(0, 140));
}

// 2. Test scanner with a synthetic Altoholic-shaped file
const fakeAlto = `
AltoholicDB = {
  global = {
    Characters = {
      ["EarthenRing.Alliance.Garygidney"] = {
        level = 12,
        class = "ROGUE",
        gold = 5234,
        professions = { Mining = 75, Engineering = 12 },
      },
      ["EarthenRing.Alliance.Otherperson"] = { level = 80 },
    },
  },
}
`;
const altoResult = scanSavedVariables(
  [{ filename: 'Altoholic.lua', content: fakeAlto }],
  { name: char.identity.name, realm: char.identity.realm },
);
console.log('\nAltoholic synthetic: findings='+altoResult.findings.length);
for (const f of altoResult.findings) console.log('  ['+f.confidence+'] '+f.source+': '+f.summary);

// 3. Build the prologue prompt and verify it renders
const prompt = buildProloguePrompt({
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
  seedAnswer: { question: 'What got you here?', text: 'I came north chasing the ones who burned my forge.' },
  intel: altoResult.findings.map((f) => ({ source: f.source, summary: f.summary })),
});
console.log('\n--- prompt preview (first 800 chars) ---');
console.log(prompt.slice(0, 800));
console.log('...\nprompt length: '+prompt.length+' chars');

// 4. Parse a synthetic LLM response
const fake = JSON.stringify({
  name: char.identity.name,
  race: char.identity.race,
  class: char.identity.class,
  faction: char.identity.faction,
  homeland: 'Ironforge',
  backstory: 'Born in the shadow of the great forge, Garygidney grew up to the clang of hammers. When raiders torched the family workshop, only the anvil survived. They carry the memory of it now, a debt unpaid in the cold ledgers of Thelsamar.',
  beliefs: ['Steel remembers', 'A debt unpaid is a debt doubled', 'Silence holds more truth than speech'],
  motivations: ['Find the raider Foreman Greel', 'Recover the family hammer', 'Prove worthy of the anvil'],
  fears: ['Becoming the thing they hunt'],
  flaws: ['Refuses help even when it would save them'],
  voice: 'Short sentences. Pauses where others would explain. Speaks of the forge as kin.',
  coreQuote: 'The anvil remembers. So do I.',
});
const bibleData = parsePrologueResponse(fake);
console.log('\nParsed bible OK. backstory length='+bibleData.backstory.length+' beliefs='+bibleData.beliefs.length);
console.log('Sample belief: '+bibleData.beliefs[0]);
console.log('\nAll smoke tests PASSED.');

