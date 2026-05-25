-- SessionRecap.lua -- closing flourish printed at logout.
--
-- One elegant chat line that gives the session a sense of completion.
-- This is the cheapest, highest-emotional-payoff feature in the lineup --
-- it makes the addon feel like it was paying attention the whole time.

local ADDON_NAME, NS = ...

local CLOSING_LINES = {
  "Your chronicle grows.",
  "The pages turn.",
  "There will be more tomorrow.",
  "Rest well. The story keeps.",
  "Until next we ride.",
  "Set the pen down, friend. It will be here in the morning.",
  "The ink is dry. The road is not.",
  "Another day, another verse.",
}

NS.On("PLAYER_LOGOUT", function()
  local cfg = NS.GetConfig()
  if not cfg.showSessionRecap then return end

  local s = NS.session
  if s.events == 0 then return end

  local rec = NS.GetCurrentCharacter()
  local name = (rec and rec.identity and rec.identity.name) or UnitName("player") or "the traveler"
  local zone = s.lastZone or (GetZoneText and GetZoneText()) or "the road"

  local parts = {}
  if s.quests       > 0 then table.insert(parts, s.quests .. " errand" .. (s.quests == 1 and "" or "s") .. " answered") end
  if s.levelsGained > 0 then table.insert(parts, s.levelsGained .. " new chapter" .. (s.levelsGained == 1 and "" or "s")) end
  if s.npcs         > 0 then table.insert(parts, s.npcs .. " soul" .. (s.npcs == 1 and "" or "s") .. " met") end
  if #parts == 0 then
    table.insert(parts, s.events .. " moments captured")
  end

  local summary = table.concat(parts, ", ")
  local closing = CLOSING_LINES[math.random(1, #CLOSING_LINES)]

  -- Print over multiple lines for a "letter" feel in chat.
  print(NS.CHAT_TAG .. " |cFFC9A969-- the day's record --|r")
  print(string.format(
    "  |cFFE8D5A6Today in %s: %s, last seen in %s.|r",
    name, summary, zone
  ))
  print("  |cFFC9A969" .. closing .. "|r")
end)
