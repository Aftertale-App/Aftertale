// ============================================================================
// WoW race / class / faction tables.
//
// Era: modern WoW (Dragonflight / War Within roster). All 13 classes including
// Monk, Demon Hunter, Evoker. Allied races included. We're NOT trying to
// validate every expansion's rules — this is "enough to roll a coherent
// character," not a Blizzard recruiter.
// ============================================================================

export const WOW_ERA = 'modern' as const;

export type Faction = 'Alliance' | 'Horde';

export const FACTIONS: readonly Faction[] = ['Alliance', 'Horde'];

export const CLASSES = [
  'Warrior',
  'Paladin',
  'Hunter',
  'Rogue',
  'Priest',
  'Death Knight',
  'Shaman',
  'Mage',
  'Warlock',
  'Monk',
  'Druid',
  'Demon Hunter',
  'Evoker',
] as const;

export type WowClass = (typeof CLASSES)[number];

interface RaceDef {
  name: string;
  faction: Faction | 'Both';
  homelands: readonly string[];  // suggestions, not enforced
  classes: readonly WowClass[];  // allowed classes (modern WoW roster)
}

// Death Knight is allowed on every race per modern rules.
// Demon Hunter is Night Elf / Blood Elf only.
// Evoker is Dracthyr only.
// Druid is restricted to specific races. Monk is broad but not universal.

export const RACES: readonly RaceDef[] = [
  // ---------- Alliance ----------
  {
    name: 'Human',
    faction: 'Alliance',
    homelands: ['Stormwind', 'Lordaeron', 'Westfall', 'Hillsbrad'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Dwarf',
    faction: 'Alliance',
    homelands: ['Ironforge', 'Khaz Modan', 'Aerie Peak'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Night Elf',
    faction: 'Alliance',
    homelands: ['Darnassus', 'Teldrassil', 'Ashenvale', 'Val\u2019sharah'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Monk', 'Druid', 'Demon Hunter'],
  },
  {
    name: 'Gnome',
    faction: 'Alliance',
    homelands: ['Gnomeregan', 'Ironforge'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Draenei',
    faction: 'Alliance',
    homelands: ['The Exodar', 'Azuremyst Isle', 'Argus'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Monk'],
  },
  {
    name: 'Worgen',
    faction: 'Alliance',
    homelands: ['Gilneas'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Druid'],
  },
  {
    name: 'Void Elf',
    faction: 'Alliance',
    homelands: ['Telogrus Rift'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Lightforged Draenei',
    faction: 'Alliance',
    homelands: ['The Vindicaar', 'Argus'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Priest', 'Death Knight', 'Mage'],
  },
  {
    name: 'Dark Iron Dwarf',
    faction: 'Alliance',
    homelands: ['Shadowforge City', 'Blackrock Depths'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Kul Tiran',
    faction: 'Alliance',
    homelands: ['Boralus', 'Drustvar', 'Stormsong Valley'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Monk', 'Druid'],
  },
  {
    name: 'Mechagnome',
    faction: 'Alliance',
    homelands: ['Mechagon Island'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk'],
  },

  // ---------- Horde ----------
  {
    name: 'Orc',
    faction: 'Horde',
    homelands: ['Orgrimmar', 'Durotar', 'Draenor', 'Nagrand'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Death Knight', 'Shaman', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Undead',
    faction: 'Horde',
    homelands: ['Undercity', 'Tirisfal Glades', 'Brill'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Tauren',
    faction: 'Horde',
    homelands: ['Thunder Bluff', 'Mulgore', 'Bloodhoof Village'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Monk', 'Druid'],
  },
  {
    name: 'Troll',
    faction: 'Horde',
    homelands: ['Sen\u2019jin Village', 'Echo Isles', 'Zandalar'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Warlock', 'Monk', 'Druid'],
  },
  {
    name: 'Blood Elf',
    faction: 'Horde',
    homelands: ['Silvermoon City', 'Eversong Woods', 'Quel\u2019Thalas'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk', 'Demon Hunter'],
  },
  {
    name: 'Goblin',
    faction: 'Horde',
    homelands: ['Kezan', 'Bilgewater Harbor', 'Azshara'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Warlock'],
  },
  {
    name: 'Nightborne',
    faction: 'Horde',
    homelands: ['Suramar'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Mage', 'Warlock', 'Monk'],
  },
  {
    name: 'Highmountain Tauren',
    faction: 'Horde',
    homelands: ['Highmountain', 'Thunder Totem'],
    classes: ['Warrior', 'Hunter', 'Death Knight', 'Shaman', 'Monk', 'Druid'],
  },
  {
    name: "Mag'har Orc",
    faction: 'Horde',
    homelands: ['Draenor', 'Frostfire Ridge', 'Nagrand'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Monk'],
  },
  {
    name: 'Zandalari Troll',
    faction: 'Horde',
    homelands: ['Zuldazar', 'Dazar\u2019alor'],
    classes: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Monk', 'Druid'],
  },
  {
    name: 'Vulpera',
    faction: 'Horde',
    homelands: ['Vol\u2019dun', 'Caravan'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Death Knight', 'Shaman', 'Mage', 'Warlock', 'Monk'],
  },

  // ---------- Both factions ----------
  {
    name: 'Pandaren',
    faction: 'Both',
    homelands: ['Wandering Isle', 'Pandaria', 'Jade Forest', 'Valley of the Four Winds'],
    classes: ['Warrior', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Monk'],
  },
  {
    name: 'Dracthyr',
    faction: 'Both',
    homelands: ['The Forbidden Reach', 'Dragon Isles'],
    classes: ['Evoker'],
  },
];

export function racesForFaction(faction: Faction): RaceDef[] {
  return RACES.filter((r) => r.faction === faction || r.faction === 'Both');
}

export function classesForRace(raceName: string): readonly WowClass[] {
  const race = RACES.find((r) => r.name === raceName);
  return race ? race.classes : [];
}

export function homelandsForRace(raceName: string): readonly string[] {
  const race = RACES.find((r) => r.name === raceName);
  return race ? race.homelands : [];
}

export function isValidCombo(faction: Faction, raceName: string, className: string): boolean {
  const race = RACES.find((r) => r.name === raceName);
  if (!race) return false;
  if (race.faction !== 'Both' && race.faction !== faction) return false;
  return (race.classes as readonly string[]).includes(className);
}
