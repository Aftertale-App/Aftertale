#!/usr/bin/env lua
-- Aftertale -- classification smoke test
--
-- Loads the REAL addon module (addon/Aftertale/Utils/Classify.lua) and asserts
-- the character-classification decision table, so the allied-race lane and the
-- boosted/brand-new/pre-existing boundaries can't silently regress. Because
-- Classify.lua is pure (no WoW API), we load it directly with no game stubs.
--
-- Run:  lua tools/classify-smoke.lua      (from the repo root)
-- Exit: 0 all pass, 1 any failure (so it can gate a push).

local HERE = arg[0]:gsub("[^/\\]*$", "")
local MODULE = HERE .. "../addon/Aftertale/Utils/Classify.lua"

local chunk, loadErr = loadfile(MODULE)
assert(chunk, "could not load Classify.lua: " .. tostring(loadErr))
-- Mimic the WoW addon loader: chunk(addonName, namespaceTable) -> NS.
local NS = chunk("Aftertale", {})
assert(type(NS) == "table" and type(NS.classify) == "function",
  "Classify.lua did not export NS.classify")

local classify = NS.classify

local pass, fail = 0, 0
local function check(desc, got, want)
  if got == want then
    pass = pass + 1
  else
    fail = fail + 1
    io.write(string.format("  FAIL: %s\n    expected %q, got %q\n", desc, tostring(want), tostring(got)))
  end
end

-- (timePlayedSec, level, raceFile) -> expected classification
local CASES = {
  -- brand-new: fresh + level 1, any race
  { "level-1 Human, fresh",          0,     1,  "Human",        "brand-new" },
  { "level-1 Orc, 3s played",        3,     1,  "Orc",          "brand-new" },

  -- allied-race: fresh + allied race at its level-10 heritage start
  { "Vulpera lvl 10, fresh",         2,     10, "Vulpera",      "allied-race" },
  { "Nightborne lvl 12, fresh",      8,     12, "Nightborne",   "allied-race" },
  { "EarthenDwarf lvl 10, fresh",    2,     10, "EarthenDwarf", "allied-race" },
  { "Haranir lvl 10, fresh",         2,     10, "Haranir",      "allied-race" },
  { "DarkIronDwarf at ceiling(20)",  5,     20, "DarkIronDwarf","allied-race" },

  -- boosted: fresh but high level (the boost floor), incl. a boosted allied race
  { "Human boosted to 70",           4,     70, "Human",        "boosted" },
  { "Vulpera BOOSTED to 70",         4,     70, "Vulpera",      "boosted" },
  { "allied race past ceiling (21)", 4,     21, "Vulpera",      "boosted" },

  -- boosted (safety-net territory): fresh, low level, but NOT an allied race.
  -- A standard race can't really be freshly created above 1, and a hero class
  -- (DH/8, DK/10) lands here -- both correctly fall to boosted and trip the
  -- low-level warn in Aftertale.lua. Dracthyr (58) is excluded by design.
  { "non-allied lvl 8 (DH-like)",    2,     8,  "NightElf",     "boosted" },
  { "Dracthyr lvl 58, fresh",        2,     58, "Dracthyr",     "boosted" },

  -- pre-existing: real play time, regardless of level/race
  { "Dwarf lvl 7, 12922s played",    12922, 7,  "Dwarf",        "pre-existing" },
  { "Vulpera lvl 11, 3600s played",  3600,  11, "Vulpera",      "pre-existing" },
  { "exactly 60s played",            60,    5,  "Orc",          "pre-existing" },

  -- nil-safety: missing args must not throw. Degenerate (level defaults to 0)
  -- falls to pre-existing -- the least-dramatic default, so we never falsely
  -- announce a "birth" when character data failed to read.
  { "nil everything",                nil,   nil, nil,           "pre-existing" },
}

io.write("classify() decision table:\n")
for _, c in ipairs(CASES) do
  local desc, t, lvl, race, want = c[1], c[2], c[3], c[4], c[5]
  local got = classify(t, lvl, race)
  check(desc, got, want)
end

-- Roster completeness: exactly the 12 allied races we expect -- nothing missing,
-- nothing stray. Guards against an accidental deletion or typo'd token.
local EXPECTED_ALLIED = {
  "VoidElf", "LightforgedDraenei", "KulTiran", "DarkIronDwarf", "Mechagnome",
  "Nightborne", "HighmountainTauren", "ZandalariTroll", "Vulpera", "MagharOrc",
  "EarthenDwarf", "Haranir",
}
io.write("allied-race roster:\n")
for _, token in ipairs(EXPECTED_ALLIED) do
  check("roster contains " .. token, NS.ALLIED_RACES[token] == true, true)
end
local count = 0
for _ in pairs(NS.ALLIED_RACES) do count = count + 1 end
check("roster size is exactly " .. #EXPECTED_ALLIED, count, #EXPECTED_ALLIED)
check("ALLIED_FRESH_CEILING == 20", NS.ALLIED_FRESH_CEILING, 20)

io.write(string.format("\n%d passed, %d failed\n", pass, fail))
os.exit(fail == 0 and 0 or 1)
