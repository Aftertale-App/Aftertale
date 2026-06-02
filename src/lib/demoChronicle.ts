// ============================================================================
// The Magnus demo chronicle.
//
// Mobile is reader-first (see the mobile design thesis): a brand-new visitor
// with no account and no hero should land on a REAL, populated chronicle they
// can read in two seconds — then be invited to sign in and start their own.
// This is that content: Magnus Brunn's early road, authored as a handful of
// HistoryEntry rows so ChronicleReader's buildChapters() groups them into a
// readable multi-chapter saga (it chapters on zone changes).
//
// Held entirely in memory and passed to ChronicleReader via its `demoBible`
// prop — never written to the roster or synced to the cloud, so it can't
// pollute a real player's data.
// ============================================================================

import type { CharacterBible } from '../types';
import { PRESET_CHARACTERS } from './presetCharacters';

const magnusPreset = PRESET_CHARACTERS.find((p) => p.id === 'magnus-brunn')!;

// Deterministic timeline. A fixed base (not Date.now()) so the demo reads the
// same on every load. The final zone block is clustered inside one ~9h session
// window so the reader's default "Latest session" view shows Loch Modan, while
// "Full saga" shows the whole road from Coldridge.
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const BASE = Date.UTC(2026, 4, 18, 19, 0, 0); // 2026-05-18 19:00 UTC

interface DemoEntry {
  offset: number; // ms from BASE
  text: string;
  zone: string;
  level: number;
  title?: string;
}

const DEMO_ENTRIES: DemoEntry[] = [
  // ── Coldridge Valley — the first steps ────────────────────────────────────
  {
    offset: 0,
    title: 'Stone Does Not Run',
    zone: 'Coldridge Valley',
    level: 1,
    text: "The troggs came up through the snow again, and Magnus did what his uncle Brogan taught him: he planted his feet and let them break against the shield instead of the village behind it. \"Stone doesnae run,\" he muttered, and held.",
  },
  {
    offset: 12 * MIN,
    zone: 'Coldridge Valley',
    level: 3,
    text: 'Grelin Whitebeard set him loose on the Rockjaw burrowers fouling the valley. Grim, tunneling work — but every one put down was one fewer at someone\'s door come nightfall.',
  },
  {
    offset: 40 * MIN,
    zone: 'Coldridge Valley',
    level: 5,
    text: 'By the time the pass to Kharanos opened, the axe sat easier in his hands. Not lighter. Easier. There is a difference, and Magnus had begun to learn it.',
  },
  // ── Dun Morogh — the road widens ──────────────────────────────────────────
  {
    offset: 1 * DAY,
    title: 'The Long Walk to Kharanos',
    zone: 'Dun Morogh',
    level: 6,
    text: 'Kharanos smelled of coal-smoke and frying trout. Magnus drank one ale, listened to two arguments, and took a contract on the frostmane trolls harrying the western reach.',
  },
  {
    offset: 1 * DAY + 35 * MIN,
    zone: 'Dun Morogh',
    level: 7,
    text: 'The frostmane fought like cornered things, which is to say honestly. He gave them honest answers. Still — he carved no names into stone he did not have to.',
  },
  {
    offset: 1 * DAY + 90 * MIN,
    zone: 'Dun Morogh',
    level: 8,
    text: 'A boy in Kharanos asked how he stayed brave. Magnus told him the truth: bravery is just the breath before the choice, and the choice is the part that matters. The boy looked disappointed. Good.',
  },
  // ── Loch Modan — the latest session ───────────────────────────────────────
  {
    offset: 9 * DAY,
    title: 'The Dam and the Dark',
    zone: 'Loch Modan',
    level: 9,
    text: 'The road bent east to Thelsamar, where the troggs and the Stonesplinter had grown bold enough to threaten the great dam itself. Magnus signed on without much ceremony. Ceremony, he\'d found, mostly gets people killed.',
  },
  {
    offset: 9 * DAY + 22 * MIN,
    zone: 'Loch Modan',
    level: 10,
    text: 'He cleared the Stonesplinter from the southern ridge one ledge at a time — patient, unhurried, holding each line until it was safe to take the next. A younger warrior called it slow. Magnus called it alive.',
  },
  {
    offset: 9 * DAY + 70 * MIN,
    zone: 'Loch Modan',
    level: 11,
    text: 'At dusk he stood on the dam and watched the loch go to copper and then to black. Fewer names carved into stone today than yesterday. He let himself count that as a victory, and then he let it go.',
  },
];

/**
 * The in-memory demo bible. Spreads the canonical Magnus preset (voice, beliefs,
 * backstory) and grafts on current in-world state + an authored history so the
 * Chronicle reader has real chapters to render.
 */
export function getMagnusDemoBible(): CharacterBible {
  return {
    ...magnusPreset.bible,
    level: 11,
    currentZone: 'Loch Modan',
    history: DEMO_ENTRIES.map((e, i) => ({
      id: `demo_magnus_${i}`,
      timestamp: BASE + e.offset,
      text: e.text,
      zone: e.zone,
      level: e.level,
      title: e.title,
    })),
  };
}
