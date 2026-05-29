-- Lore/Templates.lua -- the narrator template engine.
--
-- Maps raw events (QUEST_ACCEPTED, QUEST_TURNED_IN, PLAYER_LEVEL_UP,
-- ZONE_CHANGED_NEW_AREA) into a paragraph of flavor text. Supports
-- {name}, {npc}, {quest}, {zone}, {level} substitution.
--
-- TIER A fallback. When the player has run the web companion and
-- pasted enriched paragraphs via /aftertale sync, those override these
-- templates per-entry (matched by stable EntryID).

local ADDON_NAME, NS = ...
NS.Templates = NS.Templates or {}
local T = NS.Templates

T.QUEST_ACCEPTED = {
  "The parchment from {npc} weighs heavy in {name}'s satchel.",
  "{name} accepts the work {npc} has asked of them. {zone} grows longer with every errand.",
  "{npc} asked. {name} did not say no.",
  "'{quest}' -- the words press in like a promise.",
  "{name} folds the request away and turns toward the road.",
  "{npc} watches {name} go, then returns to their own quiet trouble.",
  "There is always more to be done. {npc} has just proven it again.",
  "Steel sharpens on errands like this. {name} accepts and moves on.",
  "Another thread to pull at, given freely by {npc}.",
  "{name} marks the work in their book of debts owed and owing.",
  "{npc} called {name} by name. Few enough do, in {zone}.",
  "The way {npc} said it left no room for refusal -- not really.",
  "{name} listens twice, asks once, and takes the task.",
  "It is not the size of the work that decides. {name} agrees.",
  "{npc} extends a worn hand. {name} clasps it. The agreement is plain.",
}

T.QUEST_TURNED_IN = {
  "{name} sets the burden down. {npc} nods, content.",
  "Done. {npc} reaches into a worn pouch.",
  "'{quest}' is finished. {npc} owes {name} a debt they may never speak of.",
  "{npc} looks {name} over once. The work shows.",
  "{name} returns. {npc} is glad of it -- gladder than they say.",
  "Another knot loosened. {npc} thanks {name} in their own way.",
  "{name} carries the news back. {npc} hears it without surprise.",
  "The reward changes hands. So does something quieter.",
  "{npc} did not expect to see {name} again. It pleases them to be wrong.",
  "{name} sets down the proof. {npc} examines it, then nods.",
  "Done is done. {npc} says little; the silence says enough.",
  "{name} stands a little taller, walking out of {zone}'s shadow.",
  "{npc} clears a place at their table that wasn't there before.",
  "It was {name}'s to finish, and {name} finished it.",
}

T.PLAYER_LEVEL_UP = {
  "Chapter {level}. {zone} witnessed the change.",
  "{name} crosses into level {level} beneath {zone}'s sky.",
  "Something old wakes in {name}. Level {level} now -- the weight of it is real.",
  "{name} feels every battle settle into bone. Level {level}.",
  "Level {level}. {zone} is smaller now than it was an hour ago.",
  "The road has taught {name} something it could not say aloud. Level {level}.",
  "Level {level}. A line crossed that {name} cannot recross.",
  "{name} reaches level {level}. The world tilts a degree in their favor.",
  "Level {level}. {name} feels the boundary of their old self give way.",
  "What {name} could not do yesterday, {name} will do tomorrow. Level {level}.",
  "The moon over {zone} sees a different {name} than it did at dawn. Level {level}.",
}

T.ZONE_CHANGED_NEW_AREA = {
  "{name} crosses into {zone}. The air tastes different here.",
  "{zone} opens before {name} -- new ground, new weather, new names to learn.",
  "The road delivers {name} to {zone} without ceremony.",
  "{name} steps over the boundary into {zone}. The map redraws itself.",
  "{zone}. {name} has been told of it; now {name} sees it.",
  "{name} sets foot in {zone} for what may be the first time, or the hundredth.",
  "There is a way {zone} smells that {name} will remember.",
  "{zone} welcomes {name} the way places do -- without comment.",
}

T.PLAYER_DEAD = {
  "{name} falls in {zone}. The wind does not stop for them.",
  "Death finds {name} in {zone}. Death will be patient enough to be answered.",
  "{name} learns the shape of {zone} the hard way.",
  "It was not the day {name} thought it would be. {zone} closes over them.",
  "{name}'s knees go. {zone} watches without comment.",
  "Down. {name} is down, and {zone} is colder than it was a moment ago.",
  "{name} pays a tax to {zone} they did not know was owed.",
  "There are places one does not stand for long. {name} found one in {zone}.",
  "{name} dies. The story is not finished; it merely turns a page.",
  "Something hit harder than {name} expected. {zone} keeps the lesson.",
}

T.ACHIEVEMENT_EARNED = {
  "{name} has done it -- '{achievement}' is theirs by right.",
  "'{achievement}'. A small word on a long road. {name} carries it now.",
  "Few enough will ever say they earned '{achievement}'. {name} is one.",
  "{name} unlocks '{achievement}'. Some doors only open after you've walked far enough.",
  "'{achievement}' -- spoken plainly by {name}, who has the right to say it.",
  "It is not nothing, '{achievement}'. {name} feels the weight of it settle.",
  "{name} stands a little taller. '{achievement}' will live on the back of every story they tell tonight.",
  "A line drawn under {name}'s name: '{achievement}'.",
}

T.ENCOUNTER_END = {
  "{encounter} falls. {name} stands in the quiet that comes after.",
  "The encounter with {encounter} ends; {name} draws breath and counts the cost.",
  "{name} sees {encounter} broken at last. {zone} is changed by it.",
  "What {encounter} demanded of {name}, {name} paid in full.",
  "{encounter} is finished. The room cools. {name} sheathes a weapon that still hums.",
  "The fight against {encounter} concludes the way fights do -- abruptly, then silence.",
  "{name} walks out of the encounter with {encounter} carrying news worth telling.",
  "{encounter} did not give ground easily. {name} took it anyway.",
}

T.BOSS_KILL = {
  "{name} stands over {encounter}. The story of this place gains a new ending.",
  "{encounter} falls to {name}. {zone} will remember.",
  "Down. {encounter} is down, and {name} is still standing.",
  "{name} ends {encounter}'s reign. Whatever held this place in fear, holds it no longer.",
  "{encounter} -- defeated. The kind of victory that earns a name in songs.",
  "{name} closes the chapter on {encounter}. Few do; fewer live to say so.",
  "The last blow lands. {encounter} is no more. {name} breathes again.",
  "{encounter} meets {name} and finds {name} the harder of the two.",
}

T.LOOT_OPENED = {
  "{name} kneels and lifts {loot} from the wreckage.",
  "Among the spoils: {loot}. {name} pockets what matters.",
  "{name} finds {loot} where the fight ended.",
  "The body yields {loot}. {name} takes it without ceremony.",
  "{name} pulls {loot} from the grim pile and stands.",
  "Worth pausing for: {loot}. {name} adds it to the pack.",
  "{name} brushes the dust off and reads the make of {loot}.",
  "Something gleams in the wreck -- {loot}. {name} claims it.",
}

------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------

local function pick(pool, seed)
  if not pool or #pool == 0 then return "" end
  local idx = (math.abs(seed or 0) % #pool) + 1
  return pool[idx]
end

local function sub(s, vars)
  return (s:gsub("{(%w+)}", function(k) return vars[k] or ("{" .. k .. "}") end))
end

local function hashEntry(entry)
  local s = (entry.event or "") .. "|" .. (entry.ts or "") .. "|" .. tostring(entry.t or 0)
  local h = 0
  for i = 1, #s do h = (h * 31 + s:byte(i)) % 2147483647 end
  return h
end

-- Stable identifier so enriched paragraphs from the web companion can
-- round-trip cleanly. Format: EVENT:ISO_TS:keyArg
function T.EntryID(entry)
  local kind = entry.event or "EVENT"
  local ts   = entry.ts or "0"
  local key  = ""
  if entry.args and entry.args[1] ~= nil then key = tostring(entry.args[1]) end
  return kind .. ":" .. ts .. ":" .. key
end

-- Resolvers walk a fallback chain so we always show real names:
--   1. enrichment.* captured live at event time (best)
--   2. live client APIs (C_QuestLog / GetAchievementInfo / C_Map)
--   3. baked DB2 lookups under NS.DB2 (always present, even offline)
--   4. a graceful placeholder
--
-- All resolvers are safe to call on any flavor: missing globals just
-- skip that tier.
local function resolveQuestTitle(enr, args)
  if enr.questTitle and enr.questTitle ~= "" then return enr.questTitle end
  local qid = args[2]
  if qid then
    if C_QuestLog and C_QuestLog.GetTitleForQuestID then
      local ok, title = pcall(C_QuestLog.GetTitleForQuestID, qid)
      if ok and title and title ~= "" then return title end
    end
    if QuestUtils_GetQuestName then -- retail fallback
      local ok, title = pcall(QuestUtils_GetQuestName, qid)
      if ok and title and title ~= "" then return title end
    end
    return "Quest #" .. tostring(qid)
  end
  return nil
end

local function resolveAchievementName(enr, args)
  if enr.achievementName and enr.achievementName ~= "" then
    return enr.achievementName
  end
  local aid = args[1]
  if aid then
    if GetAchievementInfo then
      local ok, _, name = pcall(GetAchievementInfo, aid)
      if ok and name and name ~= "" then return name end
    end
    local baked = NS.DB2 and NS.DB2.Achievement and NS.DB2.Achievement[aid]
    if baked then return baked end
    return "Achievement #" .. tostring(aid)
  end
  return nil
end

local function resolveZone(enr)
  if enr.zoneText and enr.zoneText ~= "" then return enr.zoneText end
  local mid = enr.mapID or enr.uiMapID
  if mid then
    if C_Map and C_Map.GetMapInfo then
      local ok, info = pcall(C_Map.GetMapInfo, mid)
      if ok and info and info.name and info.name ~= "" then return info.name end
    end
    local baked = NS.DB2 and NS.DB2.UiMap and NS.DB2.UiMap[mid]
    if baked then return baked end
  end
  return nil
end

local function resolveEncounter(enr, args)
  if enr.encounterName and enr.encounterName ~= "" then return enr.encounterName end
  -- args layout for ENCOUNTER_END / BOSS_KILL: [1]=encounterID, [2]=encounterName
  if args and args[2] and tostring(args[2]) ~= "" then return tostring(args[2]) end
  if args and args[1] then return "encounter #" .. tostring(args[1]) end
  return nil
end

-- WoW item quality enum: 0 Poor, 1 Common, 2 Uncommon, 3 Rare, 4 Epic,
-- 5 Legendary. Default floor is 2 (uncommon+) to match the web companion.
local LOOT_MIN_QUALITY_DEFAULT = 2

-- Strips a WoW item link like "|cffffffff|Hitem:2589::|h[Linen Cloth]|h|r"
-- down to "Linen Cloth". Falls back to the bare name field if the link
-- isn't parseable.
local function lootDisplay(item)
  if not item then return nil end
  if type(item.link) == "string" then
    local bracketed = item.link:match("%[(.-)%]")
    if bracketed and bracketed ~= "" then return bracketed end
  end
  if type(item.name) == "string" and item.name ~= "" then return item.name end
  return nil
end

local function pickLootItems(enr, minQuality)
  if not enr or type(enr.loot) ~= "table" then return {} end
  minQuality = minQuality or LOOT_MIN_QUALITY_DEFAULT
  local kept = {}
  for _, item in ipairs(enr.loot) do
    local q = tonumber(item and item.quality)
    if not q or q >= minQuality then
      local name = lootDisplay(item)
      if name then table.insert(kept, name) end
    end
  end
  return kept
end

local function resolveLoot(enr, minQuality)
  local items = pickLootItems(enr, minQuality)
  if #items == 0 then return nil end
  if #items == 1 then return items[1] end
  if #items == 2 then return items[1] .. " and " .. items[2] end
  -- 3+: oxford-comma-ish, cap at the first 3 to keep the line readable.
  local head = items[1] .. ", " .. items[2] .. ", and " .. items[3]
  if #items > 3 then
    head = head .. " (and " .. tostring(#items - 3) .. " more)"
  end
  return head
end

T.ResolveQuestTitle      = resolveQuestTitle
T.ResolveAchievementName = resolveAchievementName
T.ResolveZone            = resolveZone
T.ResolveEncounter       = resolveEncounter
T.ResolveLoot            = resolveLoot
T.LOOT_MIN_QUALITY       = LOOT_MIN_QUALITY_DEFAULT

function T.Narrate(entry, charName)
  local pool = T[entry.event]
  local enr  = entry.enrichment or {}
  local args = entry.args or {}
  local lvlFallback = enr.level
  if not lvlFallback and entry.event == "PLAYER_LEVEL_UP" then
    lvlFallback = args[1]
  end
  local vars = {
    name        = charName or "the traveler",
    npc         = (enr.npc and enr.npc.name) or "an old face",
    quest       = resolveQuestTitle(enr, args) or "the matter at hand",
    zone        = resolveZone(enr) or "the road",
    level       = tostring(lvlFallback or "?"),
    achievement = resolveAchievementName(enr, args) or "a quiet honor",
    encounter   = resolveEncounter(enr, args) or "the foe",
    loot        = resolveLoot(enr) or "something worth keeping",
  }
  if not pool then
    return string.format("%s in %s. (%s)", vars.name, vars.zone, entry.event)
  end
  local line = sub(pick(pool, hashEntry(entry)), vars)
  line = line:gsub("^%l", string.upper)
  line = line:gsub("(%.%s+)(%l)", function(sep, ch) return sep .. ch:upper() end)
  return line
end

-- Brief one-line preview for the left-page entry list. Keeps the list
-- scannable without overwhelming each row.
--
-- When enrichment hasn't resolved a name (no quest title, no zone, etc.),
-- we fall back to a scribe-voiced phrase from Lore/Scribe.lua instead of
-- the brittle "Accepted: a quest". The scribe notes what happened without
-- claiming to know its name yet -- that's truer to the round-trip story.
function T.Preview(entry, charName)
  local enr  = entry.enrichment or {}
  local args = entry.args or {}
  local e = entry.event or ""
  local Scribe = NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.previewFallback

  if e == "QUEST_ACCEPTED" then
    local title = resolveQuestTitle(enr, args)
    if title then return "Accepted: " .. title end
    return (Scribe and Scribe.QUEST_ACCEPTED) or "Accepted a task"
  elseif e == "QUEST_TURNED_IN" then
    local title = resolveQuestTitle(enr, args)
    if title then return "Finished: " .. title end
    return (Scribe and Scribe.QUEST_TURNED_IN) or "Made good on a task"
  elseif e == "PLAYER_LEVEL_UP" then
    local lvl = enr.level or args[1]
    if lvl then return "Reached level " .. tostring(lvl) end
    return "Grew stronger"
  elseif e == "ZONE_CHANGED_NEW_AREA" then
    local zone = resolveZone(enr)
    if zone then return "Entered " .. zone end
    return (Scribe and Scribe.ZONE_CHANGED_NEW_AREA) or "Crossed into new ground"
  elseif e == "PLAYER_DEAD" then
    local zone = resolveZone(enr)
    if zone then return "Fell in " .. zone end
    return (Scribe and Scribe.PLAYER_DEAD) or "Fell in the field"
  elseif e == "ACHIEVEMENT_EARNED" then
    local name = resolveAchievementName(enr, args)
    if name then return "Earned: " .. name end
    return (Scribe and Scribe.ACHIEVEMENT_EARNED) or "Earned a quiet honor"
  elseif e == "ENCOUNTER_END" then
    local name = resolveEncounter(enr, args)
    if name then return "Encounter: " .. name end
    return (Scribe and Scribe.ENCOUNTER_END) or "Saw a hard fight to its end"
  elseif e == "BOSS_KILL" then
    local name = resolveEncounter(enr, args)
    if name then return "Defeated: " .. name end
    return (Scribe and Scribe.BOSS_KILL) or "Put down a great foe"
  elseif e == "LOOT_OPENED" then
    local items = pickLootItems(enr)
    if #items == 0 then return (Scribe and Scribe.LOOT_OPENED) or "Pocketed something" end
    if #items == 1 then return "Found: " .. items[1] end
    return "Found: " .. items[1] .. " (+" .. tostring(#items - 1) .. " more)"
  end
  return e
end

function T.IsNarrativeEvent(eventName)
  return eventName == "QUEST_ACCEPTED"
      or eventName == "QUEST_TURNED_IN"
      or eventName == "PLAYER_LEVEL_UP"
      or eventName == "ZONE_CHANGED_NEW_AREA"
      or eventName == "PLAYER_DEAD"
      or eventName == "ACHIEVEMENT_EARNED"
      or eventName == "ENCOUNTER_END"
      or eventName == "BOSS_KILL"
      or eventName == "LOOT_OPENED"
end

-- Per-entry narrative check. Wraps IsNarrativeEvent and applies any
-- entry-level filtering the book needs. Today the only entry-level rule
-- is the loot quality floor (LOOT_OPENED with no items at or above
-- LOOT_MIN_QUALITY_DEFAULT is skipped). Callers that don't want any
-- entry-level filtering can still call IsNarrativeEvent(entry.event).
function T.IsNarrativeEntry(entry)
  if not entry or not entry.event then return false end
  if not T.IsNarrativeEvent(entry.event) then return false end
  if entry.event == "LOOT_OPENED" then
    return #pickLootItems(entry.enrichment) > 0
  end
  return true
end

-- Chapter label: "Chapter III -- Westfall" derived from grouping by
-- zone or by level-5 bands. Caller decides the grouping strategy.
function T.ChapterLabel(index, zoneText)
  local roman = { "I","II","III","IV","V","VI","VII","VIII","IX","X",
                  "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX",
                  "XXI","XXII","XXIII","XXIV","XXV","XXVI","XXVII","XXVIII","XXIX","XXX" }
  local r = roman[index] or tostring(index)
  if zoneText and zoneText ~= "" then
    return "Chapter " .. r .. " -- " .. zoneText
  end
  return "Chapter " .. r
end
