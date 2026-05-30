-- StoryCard.lua -- the quiet narrator.
--
-- Aftertale notices the moments that matter (quests taken, debts repaid,
-- chapters reached) and whispers a single on-brand line into the chat frame.
-- No popups, no parchment, no protected APIs -- just a soft violet note that
-- the watch saw something. The full prose lives in the chronicle on
-- aftertale.gg; this is only a heartbeat that says "I noticed."

local ADDON_NAME, NS = ...

-- Aftertale violet (#b89eff). The brand accent, used for every narrator line.
local NARRATOR_COLOR = "|cffb89eff"

------------------------------------------------------------------------
-- Narrator templates -- pre-canned because we can't call an LLM in-game.
-- {name} {npc} {quest} {zone} {level} substitution.
------------------------------------------------------------------------

local QUEST_TEMPLATES = {
  "The parchment from {npc} weighs heavy in {name}'s satchel.",
  "{name} accepts {quest}. {npc} watches them go.",
  "{name} sets out for the work {npc} has asked of them.",
  "A new thread to pull at, given freely by {npc}.",
  "{npc} asked. {name} did not say no.",
  "'{quest}' -- the words press in like a promise.",
  "{name} folds the request away. {zone} grows longer with every errand.",
  "There is always more to be done. {npc} has just proven it again.",
  "{name} marks the work. {npc} will be remembered for asking.",
  "Steel sharpens on errands like this. {name} accepts and moves on.",
}

local TURNIN_TEMPLATES = {
  "{name} sets the burden down. {npc} nods, content.",
  "Done. {npc} reaches into a worn pouch.",
  "'{quest}' is finished. {npc} owes {name} a debt.",
  "{npc} looks {name} over once. The work shows.",
  "{name} returns. {npc} is glad of it.",
  "Another knot loosened. {npc} thanks them in their own way.",
  "{name} carries the news back. {npc} hears it without surprise.",
  "The reward changes hands. So does something quieter.",
}

local LEVEL_TEMPLATES = {
  "Chapter {level}. {zone} witnessed the change.",
  "{name} crosses into level {level} beneath {zone}'s sky.",
  "Something old wakes in {name}. Level {level} now.",
  "{name} feels the weight of every battle settle into bone. Level {level}.",
  "Level {level}. The road feels different from here.",
  "{name} stands taller in {zone}. The next chapter begins.",
  "Hard-won. {name} has reached level {level}.",
  "The chronicle gains a chapter. {name} is now level {level}.",
}

local function pick(list)
  return list[math.random(1, #list)]
end

local function substitute(template, ctx)
  return (template:gsub("{(%w+)}", function(key)
    local v = ctx[key]
    if v == nil or v == "" then return "..." end
    return tostring(v)
  end))
end

------------------------------------------------------------------------
-- The narrator: one violet line in the chat frame. The gold [Aftertale]
-- tag keeps it identifiable; the soft accent keeps it unmistakably ours.
------------------------------------------------------------------------

local function narrate(line)
  if not line or line == "" then return end
  local tag = NS.CHAT_TAG or "|cFFFFD700[Aftertale]|r"
  print(tag .. " " .. NARRATOR_COLOR .. line .. "|r")
end

------------------------------------------------------------------------
-- Context builder + signal handlers
------------------------------------------------------------------------

local function buildContext(extras)
  local rec = NS.GetCurrentCharacter()
  local ctx = {
    name = (rec and rec.identity and rec.identity.name) or UnitName("player") or "the traveler",
    zone = GetZoneText and GetZoneText() or "the road",
    level = UnitLevel and UnitLevel("player") or "?",
  }
  if extras then
    for k, v in pairs(extras) do ctx[k] = v end
  end
  return ctx
end

NS.On("QUEST_ACCEPTED", function(questLogIndex, questID)
  local cfg = NS.GetConfig()
  if not cfg.showStoryCards then return end
  local title = (C_QuestLog and C_QuestLog.GetTitleForQuestID and questID and C_QuestLog.GetTitleForQuestID(questID))
              or (GetQuestLogTitle and questLogIndex and (select(1, GetQuestLogTitle(questLogIndex))))
              or "the work"
  local npc = (UnitName and UnitName("npc")) or (UnitName and UnitName("target")) or "a stranger"
  local ctx = buildContext({ quest = title, npc = npc })
  narrate(substitute(pick(QUEST_TEMPLATES), ctx))
end)

NS.On("QUEST_TURNED_IN", function(questID, xpReward, moneyReward)
  local cfg = NS.GetConfig()
  if not cfg.showStoryCards then return end
  local title = (C_QuestLog and C_QuestLog.GetTitleForQuestID and questID and C_QuestLog.GetTitleForQuestID(questID)) or "the work"
  local npc = (UnitName and UnitName("npc")) or "the one who asked"
  local ctx = buildContext({ quest = title, npc = npc })
  narrate(substitute(pick(TURNIN_TEMPLATES), ctx))
end)

NS.On("PLAYER_LEVEL_UP", function(newLevel)
  local cfg = NS.GetConfig()
  if not cfg.showLevelCards then return end
  local ctx = buildContext({ level = newLevel or UnitLevel("player") or "?" })
  narrate(substitute(pick(LEVEL_TEMPLATES), ctx))
end)

-- Preview entry point so users can sample a narrator line via the settings
-- button or /aftertale preview.
NS.PreviewStoryCard = function()
  local ctx = buildContext({ quest = "a sample errand", npc = "the storyteller" })
  narrate(substitute(pick(QUEST_TEMPLATES), ctx))
end
