-- GOLDEN FIXTURE — schema 4 (the format this addon build writes going forward):
-- per-event `v` writer-version stamp + a `meta.capabilities` manifest. Proves
-- the forward path (explicit version stamps) rather than shape-sniffing.
-- See docs/addon-sv-format.md.

AftertaleDB = {
["schemaVersion"] = 4,
["currentSessionId"] = "sess-4-0001",
["meta"] = {
["characterName"] = "Thaldris",
["realm"] = "Earthen Ring",
["version"] = "0.6.0",
["build"] = 120005,
["project"] = "Retail",
["schemaVersion"] = 4,
["capabilities"] = {
["identity"] = 2,
["events"] = 4,
["professions"] = 1,
["wealth"] = 1,
["duels"] = 1,
["pvp"] = 0,
},
},
["characters"] = {
["Player-100-AAAA0001"] = {
["sightings"] = 5,
["classification"] = "pre-existing",
["onboardingState"] = "pending",
["identity"] = {
["guid"] = "Player-100-AAAA0001",
["name"] = "Thaldris",
["realm"] = "Earthen Ring",
["class"] = "Druid",
["classFile"] = "DRUID",
["race"] = "Night Elf",
["raceFile"] = "NightElf",
["sex"] = 3,
["faction"] = "Alliance",
},
["firstSeen"] = {
["timestamp"] = 1780000000,
["iso"] = "2026-06-08T12:00:00",
["level"] = 11,
["zoneText"] = "Teldrassil",
["timePlayedSec"] = 9000,
},
["lastSeen"] = {
["timestamp"] = 1780003600,
["iso"] = "2026-06-08T13:00:00",
["level"] = 12,
["zoneText"] = "Darkshore",
},
},
},
["events"] = {
{
["char"] = "Player-100-AAAA0001",
["charName"] = "Thaldris",
["id"] = "s4-0001",
["session"] = "sess-4-0001",
["v"] = 4,
["ts"] = "2026-06-08T12:14:00",
["event"] = "QUEST_TURNED_IN",
["args"] = { "3091" },
["enrichment"] = { ["level"] = 11, ["zoneText"] = "Teldrassil", ["questTitle"] = "The Balance of Nature" },
},
{
["char"] = "Player-100-AAAA0001",
["charName"] = "Thaldris",
["id"] = "s4-0002",
["session"] = "sess-4-0001",
["v"] = 4,
["ts"] = "2026-06-08T12:38:00",
["event"] = "PLAYER_LEVEL_UP",
["args"] = { "12" },
["enrichment"] = { ["level"] = 12, ["zoneText"] = "Darkshore" },
},
},
}
