import fs from 'node:fs';
import { parseSavedVariables } from '../src/lib/luaSavedVariables';
import { ingestCharactersFromParsed } from '../src/lib/characterIngest';

const f = process.argv[2]!;
const content = fs.readFileSync(f, 'utf8');
const parsed = parseSavedVariables(content);
const { characters, warnings } = ingestCharactersFromParsed(parsed);

console.log('===== ADDON CHARACTERS =====');
console.log('warnings:', warnings);
for (const c of characters) {
  console.log('\n--- '+c.identity.name+' ('+c.guid+') ---');
  console.log('identity:', JSON.stringify(c.identity, null, 2));
  console.log('classification:', c.classification, '|', c.classificationReason);
  console.log('firstSeen:', JSON.stringify(c.firstSeen, null, 2));
  console.log('lastSeen:', JSON.stringify(c.lastSeen, null, 2));
  console.log('sightings:', c.sightings, '| onboarding:', c.onboardingState, '| announced:', c.announced);
}

// Also show what enrichment looks like in the event log
const db: any = (parsed as any).AftertaleDB;
if (db?.events) {
  console.log('\n===== EVENT LOG SUMMARY =====');
  console.log('total events:', db.events.length);
  const enriched = db.events.filter((e: any) => e && e.enrichment);
  console.log('events with enrichment:', enriched.length);
  // Show a few interesting enrichments
  const interesting = db.events.filter((e: any) => e?.enrichment && (e.enrichment.questTitle || e.enrichment.npc || e.enrichment.loot));
  console.log('quest/npc/loot enrichments:', interesting.length);
  for (const e of interesting.slice(0, 3)) {
    console.log('  '+e.event+':', JSON.stringify(e.enrichment));
  }
  // Last 3 events
  console.log('\nlast 3 events:');
  for (const e of db.events.slice(-3)) {
    console.log('  ['+e.ts+'] '+e.event+' enrichment='+JSON.stringify(e.enrichment ?? null));
  }
}
