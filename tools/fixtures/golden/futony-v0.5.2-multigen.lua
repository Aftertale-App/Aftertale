-- GOLDEN FIXTURE — derived from a real Aftertale.lua captured across addon
-- versions (meta.version 0.5.2). Trimmed for size; every distinct shape from
-- the real file is preserved. See docs/addon-sv-format.md.
--
-- It deliberately holds THREE event generations at once:
--   ERA 1 (oldest)  : no char / id / session / v  -> Garygidney's pre-tagging play
--   ERA 2 (middle)  : char + charName + id, no session/v
--   ERA 3 (newest)  : char + charName + id + session (still pre-`v` stamp)
-- plus a `characters` registry with NESTED `identity` (the shape that broke the
-- importer when it was read flat), and a legacy `marked` presence entry.
--
-- DO NOT "tidy" this into a uniform shape — the whole point is that it matches
-- what the addon actually wrote over time. A clean fixture hides real bugs.

AftertaleDB = {
["schemaVersion"] = 3,
["currentSessionId"] = "sess-newest-0001",
["meta"] = {
["characterName"] = "Emberfox",
["realm"] = "Earthen Ring",
["version"] = "0.5.2",
["build"] = 120005,
["project"] = "Retail",
},
["characters"] = {
["Player-100-0EE57324"] = {
["sightings"] = 1,
["classification"] = "pre-existing",
["classificationReason"] = "timePlayedSec=12922, level=7",
["onboardingState"] = "pending",
["identity"] = {
["guid"] = "Player-100-0EE57324",
["name"] = "Garygidney",
["realm"] = "Earthen Ring",
["class"] = "Warrior",
["classFile"] = "WARRIOR",
["race"] = "Dwarf",
["raceFile"] = "Dwarf",
["sex"] = 2,
["faction"] = "Alliance",
},
["firstSeen"] = {
["timestamp"] = 1779924404,
["iso"] = "2026-05-27T16:26:44",
["level"] = 7,
["zoneText"] = "",
["timePlayedSec"] = 12922,
},
},
["Player-100-0EE645A6"] = {
["sightings"] = 3,
["classification"] = "boosted",
["onboardingState"] = "pending",
["identity"] = {
["guid"] = "Player-100-0EE645A6",
["name"] = "Emberfox",
["realm"] = "Earthen Ring",
["class"] = "Shaman",
["classFile"] = "SHAMAN",
["race"] = "Vulpera",
["raceFile"] = "Vulpera",
["sex"] = 2,
["faction"] = "Horde",
},
["firstSeen"] = {
["timestamp"] = 1780496314,
["iso"] = "2026-06-03T07:18:34",
["level"] = 10,
["zoneText"] = "",
["timePlayedSec"] = 2,
},
["lastSeen"] = {
["timestamp"] = 1780497291,
["iso"] = "2026-06-03T07:34:51",
["level"] = 10,
["zoneText"] = "Durotar",
["subzoneText"] = "Bladefist Bay",
},
},
["Player-100-0EE5AAB1"] = {
["sightings"] = 30,
["classification"] = "brand-new",
["onboardingState"] = "pending",
["identity"] = {
["guid"] = "Player-100-0EE5AAB1",
["name"] = "Futony",
["realm"] = "Earthen Ring",
["class"] = "Rogue",
["classFile"] = "ROGUE",
["race"] = "Orc",
["raceFile"] = "Orc",
["sex"] = 2,
["faction"] = "Horde",
},
["firstSeen"] = {
["timestamp"] = 1779942175,
["iso"] = "2026-05-27T21:22:55",
["level"] = 1,
["zoneText"] = "",
["timePlayedSec"] = 3,
},
["lastSeen"] = {
["timestamp"] = 1780372413,
["iso"] = "2026-06-01T20:53:33",
["level"] = 11,
["zoneText"] = "",
},
},
},
["events"] = {
-- ERA 1: oldest, untagged (no char/id/session/v). Garygidney's Alliance path.
{
["ts"] = "2026-05-27T16:30:00",
["event"] = "ZONE_CHANGED_NEW_AREA",
["enrichment"] = { ["zoneText"] = "Northshire" },
},
{
["ts"] = "2026-05-27T17:10:00",
["event"] = "ZONE_CHANGED_NEW_AREA",
["enrichment"] = { ["zoneText"] = "Elwynn Forest" },
},
{
["ts"] = "2026-05-27T18:05:00",
["event"] = "ZONE_CHANGED_NEW_AREA",
["enrichment"] = { ["zoneText"] = "Loch Modan" },
},
-- ERA 2: middle, char-tagged with id, but no session and no v. Futony, Durotar.
{
["char"] = "Player-100-0EE5AAB1",
["charName"] = "Futony",
["id"] = "mid-0001",
["ts"] = "2026-06-01T16:42:25",
["event"] = "ZONE_CHANGED",
["args"] = {},
["enrichment"] = { ["level"] = 8, ["zoneText"] = "Durotar", ["subzoneText"] = "Razor Hill" },
},
{
["char"] = "Player-100-0EE5AAB1",
["charName"] = "Futony",
["id"] = "mid-0002",
["ts"] = "2026-06-01T16:44:03",
["event"] = "QUEST_TURNED_IN",
["args"] = { "801" },
["enrichment"] = { ["level"] = 8, ["zoneText"] = "Durotar", ["questTitle"] = "Lazy Peons" },
},
-- ERA 3: newest, fully tagged with session id (still pre-`v`). Futony + Emberfox.
{
["char"] = "Player-100-0EE5AAB1",
["charName"] = "Futony",
["id"] = "new-0001",
["session"] = "sess-newest-0001",
["ts"] = "2026-06-01T20:50:00",
["event"] = "PLAYER_LEVEL_UP",
["args"] = { "11" },
["enrichment"] = { ["level"] = 11, ["zoneText"] = "Northern Barrens" },
},
{
["char"] = "Player-100-0EE5AAB1",
["charName"] = "Futony",
["id"] = "new-0002",
["session"] = "sess-newest-0001",
["ts"] = "2026-06-01T20:53:00",
["event"] = "PLAYER_LOGOUT",
["args"] = {},
["enrichment"] = { ["level"] = 11, ["zoneText"] = "Northern Barrens" },
},
{
["char"] = "Player-100-0EE645A6",
["charName"] = "Emberfox",
["id"] = "new-0003",
["session"] = "sess-newest-0002",
["ts"] = "2026-06-03T07:34:00",
["event"] = "QUEST_TURNED_IN",
["args"] = { "123" },
["enrichment"] = { ["level"] = 10, ["zoneText"] = "Durotar", ["questTitle"] = "A Rough Start" },
},
},
["marked"] = {
{ ["ts"] = "2026-06-01T15:42:03" },
{ ["ts"] = "2026-06-02T00:51:13Z", ["zone"] = "Northern Barrens", ["subzone"] = "", ["player"] = "Futony", ["t"] = 66730.95 },
},
}
