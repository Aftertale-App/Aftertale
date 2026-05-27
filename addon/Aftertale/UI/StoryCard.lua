-- StoryCard.lua -- the marquee user-facing UX.
--
-- A parchment-letter card fades in at top-center on QUEST_ACCEPTED,
-- QUEST_TURNED_IN, and PLAYER_LEVEL_UP. Holds 5s (configurable), fades
-- out, click to dismiss. Pure cosmetic; no protected APIs touched.
--
-- Inspired by YUI-Dialogue (Peterodox) -- parchment + sound assets used
-- with permission. See ATTRIBUTION.md.

local ADDON_NAME, NS = ...

local CARD_WIDTH  = 480
local CARD_HEIGHT = 160
local FADE_IN     = 0.45
local FADE_OUT    = 1.2
local SLICE_MARGIN  = 60  -- smaller than Settings (80) so corners fit in 160-tall card
local SHADOW_OFFSET = 14
local INSET_X       = 50  -- keep text well clear of torn-paper edges
local INSET_TOP     = 20
local INSET_BOTTOM  = 20

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
-- Frame construction (lazy -- created on first emit)
------------------------------------------------------------------------

local card
local function buildCard()
  if card then return card end

  card = CreateFrame("Frame", "ChroniclesStoryCard", UIParent)
  card:SetSize(CARD_WIDTH, CARD_HEIGHT)
  card:SetPoint("TOP", UIParent, "TOP", 0, -120)
  card:SetFrameStrata("HIGH")
  card:SetMovable(true)
  card:EnableMouse(true)
  card:RegisterForDrag("LeftButton")
  card:SetScript("OnDragStart", card.StartMoving)
  card:SetScript("OnDragStop", card.StopMovingOrSizing)
  card:Hide()
  card:SetAlpha(0)

  -- 9-slice parchment background. Mirrors YUI's DUIGenericTitledFrame:
  -- GenericFrame.png with corner slices kept crisp, body region tiled,
  -- background extended past frame bounds for a soft drop shadow.
  local bg = card:CreateTexture(nil, "BACKGROUND")
  bg:SetTexture(NS.ADDON_PATH .. "\\Art\\GenericFrame.png")
  bg:SetPoint("TOPLEFT",     card, "TOPLEFT",     -SHADOW_OFFSET,  SHADOW_OFFSET)
  bg:SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT",  SHADOW_OFFSET, -SHADOW_OFFSET)
  pcall(bg.SetTextureSliceMargins, bg, SLICE_MARGIN, SLICE_MARGIN, SLICE_MARGIN, SLICE_MARGIN)
  if bg.SetTextureSliceMode and Enum and Enum.UITextureSliceMode then
    pcall(bg.SetTextureSliceMode, bg, Enum.UITextureSliceMode.Tiled)
  end

  -- Header label -- a small all-caps "kicker" set tight to the divider,
  -- like the chapter heading in a printed book. Dark brown ink, letter-
  -- spaced via spaces, brighter than the old red-brown sub-label.
  local header = card:CreateFontString(nil, "OVERLAY")
  local headerFont = GameFontNormalLarge:GetFont()
  header:SetFont(headerFont, 13, "")
  header:SetPoint("TOP", card, "TOP", 0, -INSET_TOP)
  header:SetTextColor(0.30, 0.18, 0.08, 1)
  header:SetText("A  C H A P T E R   I N   T H E   C H R O N I C L E")
  card.header = header

  -- Divider line under header (subtle, sized to safe interior)
  local divider = card:CreateTexture(nil, "OVERLAY")
  divider:SetTexture(NS.ADDON_PATH .. "\\Art\\Divider.png")
  divider:SetSize(CARD_WIDTH - 2 * INSET_X - 30, 8)
  divider:SetPoint("TOP", header, "BOTTOM", 0, -4)
  divider:SetVertexColor(1, 1, 1, 0.55)

  -- Body text -- the narrator line. Anchored to a SAFE interior rect so
  -- it never overflows the torn-paper edges left/right.
  local body = card:CreateFontString(nil, "OVERLAY")
  body:SetFont(STANDARD_TEXT_FONT, 16, "")
  if GameFontNormalLarge then
    local f = GameFontNormalLarge:GetFont()
    if f then body:SetFont(f, 16, "") end
  end
  body:SetPoint("TOPLEFT",     card, "TOPLEFT",      INSET_X,        -(INSET_TOP + 30))
  body:SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT", -INSET_X,         INSET_BOTTOM)
  body:SetJustifyH("CENTER")
  body:SetJustifyV("MIDDLE")
  body:SetTextColor(0.18, 0.12, 0.06, 1)
  body:SetSpacing(3)
  body:SetWordWrap(true)
  card.body = body

  -- Click-to-dismiss
  card:SetScript("OnMouseUp", function(self, button)
    if button == "RightButton" or button == "LeftButton" then
      card:DismissNow()
    end
  end)

  -- Fade state machine
  card.state = "hidden"
  card.t = 0
  card.holdFor = 5.0
  card:SetScript("OnUpdate", function(self, elapsed)
    self.t = self.t + elapsed
    if self.state == "fadein" then
      local a = math.min(1, self.t / FADE_IN)
      self:SetAlpha(a)
      if a >= 1 then self.state = "hold"; self.t = 0 end
    elseif self.state == "hold" then
      if self.t >= self.holdFor then self.state = "fadeout"; self.t = 0 end
    elseif self.state == "fadeout" then
      local a = math.max(0, 1 - self.t / FADE_OUT)
      self:SetAlpha(a)
      if a <= 0 then
        self:Hide()
        self.state = "hidden"
        self:SetScript("OnUpdate", nil)
      end
    end
  end)

  -- Convert a kicker like "a new errand" or coloured "-- a new chapter --"
  -- into the letter-spaced small-caps heading style. Idempotent.
  local function formatKicker(s)
    if not s or s == "" then return "" end
    -- Strip Blizzard colour codes and surrounding dashes the older callers used.
    s = s:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
    s = s:gsub("^%s*%-+%s*", ""):gsub("%s*%-+%s*$", "")
    s = s:gsub("^%s+", ""):gsub("%s+$", "")
    s = s:upper()
    -- Letter-space: insert a space between each character; double-space between words.
    local out = {}
    for word in s:gmatch("%S+") do
      local letters = {}
      for ch in word:gmatch(".") do table.insert(letters, ch) end
      table.insert(out, table.concat(letters, " "))
    end
    return table.concat(out, "   ")
  end

  function card:Present(headerText, bodyText, holdFor)
    self.header:SetText(formatKicker(headerText))
    self.body:SetText(bodyText)
    self.holdFor = holdFor or 5.0
    self.state = "fadein"
    self.t = 0
    self:SetAlpha(0)
    self:Show()
    -- Re-attach OnUpdate (cleared after each cycle to save cycles)
    self:SetScript("OnUpdate", function(s, el)
      s.t = s.t + el
      if s.state == "fadein" then
        local a = math.min(1, s.t / FADE_IN)
        s:SetAlpha(a)
        if a >= 1 then s.state = "hold"; s.t = 0 end
      elseif s.state == "hold" then
        if s.t >= s.holdFor then s.state = "fadeout"; s.t = 0 end
      elseif s.state == "fadeout" then
        local a = math.max(0, 1 - s.t / FADE_OUT)
        s:SetAlpha(a)
        if a <= 0 then s:Hide(); s.state = "hidden"; s:SetScript("OnUpdate", nil) end
      end
    end)
    NS.PlaySound("paper-collect.mp3")
  end

  function card:DismissNow()
    if self.state == "hidden" then return end
    self.state = "fadeout"
    self.t = 0
  end

  return card
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
  -- NPC name: best-effort from the most recent gossip/quest target
  local npc = (UnitName and UnitName("npc")) or (UnitName and UnitName("target")) or "a stranger"
  local ctx = buildContext({ quest = title, npc = npc })
  buildCard():Present(
    "|cFFC9A969-- a new errand --|r",
    substitute(pick(QUEST_TEMPLATES), ctx),
    cfg.storyCardDuration
  )
end)

NS.On("QUEST_TURNED_IN", function(questID, xpReward, moneyReward)
  local cfg = NS.GetConfig()
  if not cfg.showStoryCards then return end
  local title = (C_QuestLog and C_QuestLog.GetTitleForQuestID and questID and C_QuestLog.GetTitleForQuestID(questID)) or "the work"
  local npc = (UnitName and UnitName("npc")) or "the one who asked"
  local ctx = buildContext({ quest = title, npc = npc })
  buildCard():Present(
    "|cFFC9A969-- a debt repaid --|r",
    substitute(pick(TURNIN_TEMPLATES), ctx),
    cfg.storyCardDuration
  )
end)

NS.On("PLAYER_LEVEL_UP", function(newLevel)
  local cfg = NS.GetConfig()
  if not cfg.showLevelCards then return end
  local ctx = buildContext({ level = newLevel or UnitLevel("player") or "?" })
  buildCard():Present(
    "|cFFC9A969-- a new chapter --|r",
    substitute(pick(LEVEL_TEMPLATES), ctx),
    (cfg.storyCardDuration or 5) + 1.0
  )
end)

-- Debug entry point so users can preview the card via /aftertale preview
NS.PreviewStoryCard = function()
  local ctx = buildContext({ quest = "a sample errand", npc = "the storyteller" })
  buildCard():Present(
    "|cFFC9A969-- a chapter in the chronicle --|r",
    substitute(pick(QUEST_TEMPLATES), ctx),
    5.0
  )
end
