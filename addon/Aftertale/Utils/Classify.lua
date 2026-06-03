-- Aftertale -- character classification (pure, dependency-free)
--
-- Why this is its own module: classify() is the one piece of character-detection
-- logic with real branching, an external roster that drifts (allied races), and
-- a narrative consequence (which voice the chronicle uses). Keeping it free of
-- any WoW API call means it can be loaded and asserted by tools/classify-smoke.lua
-- with no game stubs -- so the decision table below has authoritative test
-- coverage instead of a copy that silently drifts from the addon.
--
-- Loaded before Aftertale.lua (see the .toc files); attaches NS.classify,
-- NS.ALLIED_RACES, and NS.ALLIED_FRESH_CEILING for the rest of the addon.
--
-- Four lanes (see classify):
--   * brand-new      timePlayed <  60s, level == 1            -> birth voice
--   * allied-race    timePlayed <  60s, allied race, lvl<=20  -> heritage-start voice
--   * boosted        timePlayed <  60s, level  > 1 (else)     -> arrival-w/o-memory voice
--   * pre-existing   timePlayed >= 60s                        -> met-mid-journey voice
--
-- An allied race begins ABOVE level 1 by design (a level-10 heritage start),
-- NOT because the player paid to skip a journey -- so it is a genuine new
-- beginning, not a boost. A *boosted* allied race lands at the boost floor
-- (~70), so the lane is gated on a low starting level to keep the two apart.
-- (Hero classes -- Demon Hunter/8, Death Knight/10 -- and Dracthyr/58 share
-- this "fresh start above 1" shape but are out of scope; they currently fall
-- to "boosted" and trip the low-level safety-net warn in Aftertale.lua.)

local ADDON_NAME, NS = ...
NS = NS or {}

-- The full allied-race roster, keyed by clientFileString (the second return
-- of UnitRace, locale-independent). raceID in the comment for cross-checking.
-- Verified against worldofwarcraft.blizzard.com/en-us/game/races and
-- warcraft.wiki.gg/wiki/RaceId. There is no clean "is this an allied race?"
-- API, so this set is the source of truth -- update it here if Blizzard ships
-- a new one. Dracthyr (52/70) is intentionally absent: it starts at level 58,
-- not 10, so it does not fit the allied heritage-start shape.
local ALLIED_RACES = {
  -- Alliance
  VoidElf            = true, -- 29
  LightforgedDraenei = true, -- 30
  KulTiran           = true, -- 32
  DarkIronDwarf      = true, -- 34
  Mechagnome         = true, -- 37
  -- Horde
  Nightborne         = true, -- 27
  HighmountainTauren = true, -- 28
  ZandalariTroll     = true, -- 31
  Vulpera            = true, -- 35
  MagharOrc          = true, -- 36
  -- Both factions (The War Within); same clientFileString for raceID 84 & 85
  EarthenDwarf       = true,
  -- Both factions (Midnight). Token follows Blizzard's PascalCase convention
  -- but postdates the wiki's API table -- confirm in-game with
  --   /dump select(2, UnitRace("player"))   on a Haranir (expect "Haranir").
  Haranir            = true,
}

-- A character whose played time is under this and whose level is at/under the
-- ceiling looks freshly created rather than boosted (boosts land at ~70).
local ALLIED_FRESH_CEILING = 20

-- classify(timePlayedSec, level, raceFile) -> classification, reason
-- Pure: takes scalars only (raceFile is the clientFileString string), no API.
local function classify(timePlayedSec, level, raceFile)
  local t = timePlayedSec or 0
  local lvl = level or 0
  if t >= 60 then
    return "pre-existing", string.format("timePlayedSec=%s, level=%d", tostring(timePlayedSec), lvl)
  end
  -- t < 60: meeting this character at the very start of its played time --
  -- i.e. freshly created (or freshly boosted).
  if lvl == 1 then
    return "brand-new", string.format("timePlayedSec=%s, level=1", tostring(timePlayedSec))
  end
  if raceFile and ALLIED_RACES[raceFile] and lvl <= ALLIED_FRESH_CEILING then
    return "allied-race", string.format(
      "timePlayedSec=%s, level=%d, race=%s (allied heritage start)",
      tostring(timePlayedSec), lvl, raceFile)
  end
  if lvl > 1 then
    return "boosted", string.format("timePlayedSec=%s, level=%d", tostring(timePlayedSec), lvl)
  end
  return "pre-existing", string.format("timePlayedSec=%s, level=%d", tostring(timePlayedSec), lvl)
end

NS.ALLIED_RACES = ALLIED_RACES
NS.ALLIED_FRESH_CEILING = ALLIED_FRESH_CEILING
NS.classify = classify

-- Return the module table too, so a standalone test harness can capture the
-- exports without relying on the addon vararg (NS) being threaded in.
return NS
