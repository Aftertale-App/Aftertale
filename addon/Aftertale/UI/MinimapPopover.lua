-- UI/MinimapPopover.lua -- the addon's front door.
--
-- "Presence, not prose." Clicking the minimap button opens this: a single
-- two-column panel. Left = the player's live 3D model with the violet halo
-- and gold Cinzel name. Right = the live session, lightly stated. Two
-- buttons at the bottom for the only verbs the player has on the addon:
-- HOLD THIS MOMENT, PAUSE THE WATCH.
--
-- The popover does not display chronicle prose. It does not link out to
-- the web companion. It does not advertise anything. It is the artifact
-- making itself known -- nothing more.
--
-- Blizzard addon policy: no in-game CTAs to external paid services, no
-- promotional language. This file is silent about aftertale.gg by design.

local ADDON_NAME, NS = ...
local S = NS.Style

local W, H = 560, 360

------------------------------------------------------------------------
-- Voice copy
--
-- The artifact thinks; it does not address the player. "Remembered." not
-- "I noticed." Short, archaic, slightly stranger than necessary.
------------------------------------------------------------------------

local C = {
  sectionKicker = "Tonight's Vigil",
  beatsLabel    = "Beats remembered",
  heldLabel     = "Held in memory",
  watchLabel    = "The watch began",
  pausedLine    = "The watch is paused.",
  holdBtn       = "Hold this moment",
  pauseBtn      = "Pause the watch",
  resumeBtn     = "Resume the watch",
  heldPulse     = "Held.",
  pausedPulse   = "Sealed for now.",
  resumedPulse  = "The vigil resumes.",
}

------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------

-- "1h 8m" / "8m" / "just now"
local function formatDuration(secs)
  secs = math.max(0, math.floor(secs or 0))
  if secs < 60 then return "just now" end
  local mins = math.floor(secs / 60)
  if mins < 60 then return mins .. "m" end
  local hrs = math.floor(mins / 60)
  local rem = mins - hrs * 60
  if rem == 0 then return hrs .. "h" end
  return hrs .. "h " .. rem .. "m"
end

local function currentPlace()
  local zone = GetZoneText and GetZoneText() or ""
  local sub  = GetSubZoneText and GetSubZoneText() or ""
  if sub ~= "" and sub ~= zone then return zone .. "  —  " .. sub end
  return zone ~= "" and zone or "The road"
end

local function hourMinute()
  local h, m = "", ""
  if date then
    h = date("%H") or ""
    m = date("%M") or ""
  end
  if h ~= "" then return h .. ":" .. m end
  return ""
end

------------------------------------------------------------------------
-- Brief text pulse (Option B feedback: a button press surfaces a quiet
-- one-line confirmation in the right column for ~1.4s, then returns).
------------------------------------------------------------------------

-- An invisible ticker frame that drives the pulse fade. FontStrings can't
-- own OnUpdate scripts -- only Frames can. Built lazily on first pulse.
local pulseTicker

local function showPulse(panel, text, color)
  if not panel.pulse then return end
  panel.pulse:SetText(text or "")
  if color then panel.pulse:SetTextColor(color[1], color[2], color[3], 1) end
  panel.pulse:SetAlpha(1)
  panel.pulse:Show()

  pulseTicker = pulseTicker or CreateFrame("Frame")
  pulseTicker._t = 0
  pulseTicker._fs = panel.pulse
  pulseTicker:SetScript("OnUpdate", function(self, dt)
    self._t = (self._t or 0) + dt
    if self._t < 0.9 then return end -- hold full alpha briefly
    local a = math.max(0, 1 - (self._t - 0.9) / 0.5)
    if self._fs then self._fs:SetAlpha(a) end
    if a <= 0 then
      if self._fs then self._fs:Hide() end
      self._fs = nil
      self:SetScript("OnUpdate", nil)
    end
  end)
end

------------------------------------------------------------------------
-- The frame, lazily built.
------------------------------------------------------------------------

local popover

local function buildLeftPortrait(parent, x, y, w, h)
  -- The brand 9-slice frame wraps the portrait. cornerSize 28 gives the gold
  -- star a visible-but-not-dominant footprint; padding 0 lets the model fill
  -- the inner area right up to the gold edge.
  local frame = S.CreateFramedPanel(parent, { cornerSize = 28, padding = 0 })
  frame:SetSize(w, h)
  frame:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)

  -- Soft violet halo behind the frame -- adds to the frame's own inner glow,
  -- and is the element we dim when the watch is paused.
  local halo = parent:CreateTexture(nil, "BACKGROUND")
  halo:SetColorTexture(S.rgba("accent", 0.12))
  halo:SetPoint("TOPLEFT", frame, "TOPLEFT", -10, 10)
  halo:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 10, -10)
  frame.halo = halo

  -- The live PlayerModel. Anchored to frame.content (the framed-panel inner
  -- child) so it never overlaps the gold edge. Hidden until popover opens
  -- -- PlayerModel is relatively heavy; only render when visible.
  local model = CreateFrame("PlayerModel", nil, frame.content)
  model:SetAllPoints(frame.content)
  local bg = frame.content:CreateTexture(nil, "BACKGROUND", nil, 1)
  bg:SetAllPoints(model)
  bg:SetColorTexture(0.04, 0.02, 0.08, 1)
  frame.model = model

  return frame
end

local function refreshModel(panel, opts)
  local m = panel.portrait.model
  if not m then return end
  pcall(m.ClearModel, m)
  pcall(m.SetUnit, m, "player")
  if m.SetPortraitZoom then pcall(m.SetPortraitZoom, m, 0.7) end
  if m.SetCamDistanceScale then pcall(m.SetCamDistanceScale, m, 1.0) end
  if m.RefreshUnit then pcall(m.RefreshUnit, m) end
  -- When paused, dim the model + halo slightly so the eye sees the state.
  local dim = (opts and opts.paused) and 0.55 or 1
  m:SetAlpha(dim)
  if panel.portrait.halo then
    local r, g, b = S.rgba("accent")
    panel.portrait.halo:SetColorTexture(r, g, b, (opts and opts.paused) and 0.07 or 0.18)
  end
end

local function refreshNameBlock(panel)
  local rec = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
  local id = rec and rec.identity
  local name    = (id and id.name)    or (UnitName    and UnitName("player"))    or "Hero"
  local race    = (id and id.race)    or (UnitRace    and UnitRace("player"))    or ""
  local class   = (id and id.class)   or (UnitClass   and UnitClass("player"))   or ""
  local faction = (id and id.faction) or (UnitFactionGroup and UnitFactionGroup("player")) or ""
  panel.heroName:SetText(name)
  local parts = {}
  if race    ~= "" then table.insert(parts, race)    end
  if class   ~= "" then table.insert(parts, class)   end
  if faction ~= "" then table.insert(parts, faction) end
  panel.heroMeta:SetText(S.Kicker(table.concat(parts, "  —  ")))
end

local function refreshSessionColumn(panel)
  local s = NS.session or {}
  local started = s.startedAt or time()
  local secs = (time and time() or 0) - started
  panel.placeLine:SetText(currentPlace() .. (hourMinute() ~= "" and ("  —  " .. hourMinute()) or ""))
  panel.beats:SetText(C.beatsLabel  .. ":  " .. (s.events or 0))
  panel.held:SetText (C.heldLabel   .. ":  " .. (s.held   or 0))
  -- "The watch began just now." vs "The watch began 8m ago." -- the "ago"
  -- suffix only reads right when there's a duration in front of it.
  local dur = formatDuration(secs)
  local watchText = (dur == "just now")
    and (C.watchLabel .. " just now.")
    or  (C.watchLabel .. "  " .. dur .. " ago.")
  panel.watch:SetText(watchText)
end

local function refreshButtons(panel)
  local paused = NS.IsPaused and NS.IsPaused() or false
  panel.pauseBtn.label:SetText(paused and C.resumeBtn or C.pauseBtn)
  -- Hold-this-moment is greyed while paused (the moment is yours, but the
  -- watch isn't recording for the chronicle).
  if paused then
    panel.holdBtn:Disable()
    panel.holdBtn.label:SetTextColor(S.rgba("fgFaint"))
    panel.pausedLine:Show()
  else
    panel.holdBtn:Enable()
    panel.holdBtn.label:SetTextColor(S.rgba("goldBright"))
    panel.pausedLine:Hide()
  end
end

local function refreshAll(panel)
  refreshNameBlock(panel)
  refreshSessionColumn(panel)
  refreshButtons(panel)
  refreshModel(panel, { paused = NS.IsPaused and NS.IsPaused() })
end

------------------------------------------------------------------------
-- A simple flat button -- the popover only has two of them, so it
-- doesn't earn its own Style helper yet.
------------------------------------------------------------------------

local function makeButton(parent, w, h, text)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(w, h)
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(b)
  bg:SetColorTexture(S.rgba("inset"))
  b.bg = bg
  local border = {}
  local function edge(point, opx, opy, w_, h_)
    local t = b:CreateTexture(nil, "BORDER")
    t:SetColorTexture(S.rgba("border", 0.55))
    t:SetPoint(point, b, point, opx or 0, opy or 0)
    if w_ then t:SetWidth(w_) end
    if h_ then t:SetHeight(h_) end
    return t
  end
  edge("TOPLEFT", 0, 0); edge("TOPRIGHT", 0, 0)
  local top = b:CreateTexture(nil, "BORDER")
  top:SetColorTexture(S.rgba("border", 0.55))
  top:SetPoint("TOPLEFT"); top:SetPoint("TOPRIGHT"); top:SetHeight(1)
  local bot = b:CreateTexture(nil, "BORDER")
  bot:SetColorTexture(S.rgba("border", 0.55))
  bot:SetPoint("BOTTOMLEFT"); bot:SetPoint("BOTTOMRIGHT"); bot:SetHeight(1)
  local left = b:CreateTexture(nil, "BORDER")
  left:SetColorTexture(S.rgba("border", 0.55))
  left:SetPoint("TOPLEFT"); left:SetPoint("BOTTOMLEFT"); left:SetWidth(1)
  local right = b:CreateTexture(nil, "BORDER")
  right:SetColorTexture(S.rgba("border", 0.55))
  right:SetPoint("TOPRIGHT"); right:SetPoint("BOTTOMRIGHT"); right:SetWidth(1)
  border.top, border.bot, border.left, border.right = top, bot, left, right
  b.border = border

  local label = b:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(label, 13, "")
  label:SetPoint("CENTER")
  label:SetText(S.Kicker(text or ""))
  label:SetTextColor(S.rgba("goldBright"))
  b.label = label

  b:SetScript("OnEnter", function() bg:SetColorTexture(S.rgba("accent", 0.10)) end)
  b:SetScript("OnLeave", function() bg:SetColorTexture(S.rgba("inset")) end)
  return b
end

------------------------------------------------------------------------
-- Build the popover frame (once, lazily).
------------------------------------------------------------------------

local function build()
  if popover then return popover end

  popover = S.CreatePanel(UIParent, { fill = "bg", border = "border", borderAlpha = 0.7 })
  popover:SetSize(W, H)
  popover:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  popover:SetFrameStrata("DIALOG")
  popover:EnableMouse(true)
  popover:SetMovable(true)
  popover:RegisterForDrag("LeftButton")
  popover:SetScript("OnDragStart", popover.StartMoving)
  popover:SetScript("OnDragStop", popover.StopMovingOrSizing)
  popover:Hide()

  _G["AftertaleMinimapPopover"] = popover
  table.insert(UISpecialFrames, "AftertaleMinimapPopover") -- ESC closes

  -- Close button (Latin-1-safe glyph; see ChronicleBook for the tofu story).
  local close = CreateFrame("Button", nil, popover)
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", popover, "TOPRIGHT", -10, -10)
  local x = close:CreateFontString(nil, "OVERLAY")
  x:SetFont((GameFontNormalLarge or GameFontNormal):GetFont(), 18, "")
  x:SetPoint("CENTER")
  x:SetText("\195\151") -- ×
  x:SetTextColor(S.rgba("fgMuted"))
  close:SetScript("OnEnter", function() x:SetTextColor(S.rgba("goldBright")) end)
  close:SetScript("OnLeave", function() x:SetTextColor(S.rgba("fgMuted")) end)
  close:SetScript("OnClick", function() popover:Hide() end)

  -- LEFT COLUMN: 60% width. Portrait + halo + hero name + caps subtitle.
  local PAD = 18
  local LEFT_W  = math.floor(W * 0.60) - PAD - 8
  local RIGHT_W = W - LEFT_W - PAD * 2 - 16
  local PORT_H  = 240

  popover.portrait = buildLeftPortrait(popover, PAD, -PAD, LEFT_W, PORT_H)

  popover.heroName = S.AddHeading(popover, "", 26)
  popover.heroName:SetPoint("TOPLEFT", popover.portrait, "BOTTOMLEFT", 0, -10)
  popover.heroName:SetWidth(LEFT_W)
  popover.heroName:SetJustifyH("CENTER")

  popover.heroMeta = S.AddKicker(popover, "")
  popover.heroMeta:SetPoint("TOPLEFT", popover.heroName, "BOTTOMLEFT", 0, -6)
  popover.heroMeta:SetWidth(LEFT_W)
  popover.heroMeta:SetJustifyH("CENTER")
  popover.heroMeta:SetTextColor(S.rgba("accent"))

  -- RIGHT COLUMN: kicker + live session lines + a divider + the pulse line.
  local rightX = PAD + LEFT_W + 16
  local rightTopY = -PAD - 6

  local sectKicker = S.AddKicker(popover, C.sectionKicker)
  sectKicker:SetPoint("TOPLEFT", popover, "TOPLEFT", rightX, rightTopY)
  sectKicker:SetWidth(RIGHT_W)
  sectKicker:SetJustifyH("LEFT")
  sectKicker:SetTextColor(S.rgba("accent"))

  local place = S.AddBody(popover, "", 15)
  place:SetPoint("TOPLEFT", sectKicker, "BOTTOMLEFT", 0, -10)
  place:SetWidth(RIGHT_W)
  place:SetJustifyH("LEFT")
  popover.placeLine = place

  -- Thin violet rule
  local rule = S.CreateRule(popover, "accent", 0.35)
  rule:SetPoint("TOPLEFT", place, "BOTTOMLEFT", 0, -14)
  rule:SetWidth(RIGHT_W)

  popover.beats = S.AddBody(popover, "", 14)
  popover.beats:SetPoint("TOPLEFT", rule, "BOTTOMLEFT", 0, -14)
  popover.beats:SetWidth(RIGHT_W)

  popover.held = S.AddBody(popover, "", 14)
  popover.held:SetPoint("TOPLEFT", popover.beats, "BOTTOMLEFT", 0, -6)
  popover.held:SetWidth(RIGHT_W)

  popover.watch = S.AddMuted(popover, "", 12)
  popover.watch:SetPoint("TOPLEFT", popover.held, "BOTTOMLEFT", 0, -10)
  popover.watch:SetWidth(RIGHT_W)

  -- "The watch is paused." line, only shown when paused.
  popover.pausedLine = S.AddBody(popover, C.pausedLine, 13)
  popover.pausedLine:SetPoint("TOPLEFT", popover.watch, "BOTTOMLEFT", 0, -10)
  popover.pausedLine:SetWidth(RIGHT_W)
  popover.pausedLine:SetTextColor(S.rgba("accent"))
  popover.pausedLine:Hide()

  -- Pulse line: the brief "Held." / "Sealed for now." feedback. Lives in
  -- the same column but on its own anchor so it never collides.
  popover.pulse = popover:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(popover.pulse, 14, "")
  popover.pulse:SetPoint("BOTTOMLEFT", popover, "BOTTOMLEFT", rightX, 78)
  popover.pulse:SetWidth(RIGHT_W)
  popover.pulse:SetJustifyH("LEFT")
  popover.pulse:Hide()

  -- BUTTONS, anchored to the bottom of the right column.
  local BTN_H = 32
  popover.holdBtn = makeButton(popover, RIGHT_W, BTN_H, C.holdBtn)
  popover.holdBtn:SetPoint("BOTTOMLEFT", popover, "BOTTOMLEFT", rightX, PAD + BTN_H + 8)
  popover.holdBtn:SetScript("OnClick", function()
    if NS.MarkHeldMoment then NS.MarkHeldMoment() end
    refreshSessionColumn(popover)
    showPulse(popover, S.Kicker(C.heldPulse), { S.rgba("accent") })
  end)

  popover.pauseBtn = makeButton(popover, RIGHT_W, BTN_H, C.pauseBtn)
  popover.pauseBtn:SetPoint("BOTTOMLEFT", popover, "BOTTOMLEFT", rightX, PAD)
  popover.pauseBtn:SetScript("OnClick", function()
    local nowPaused = not (NS.IsPaused and NS.IsPaused())
    if NS.SetPaused then NS.SetPaused(nowPaused) end
    refreshAll(popover)
    showPulse(popover, S.Kicker(nowPaused and C.pausedPulse or C.resumedPulse),
              { S.rgba(nowPaused and "fgMuted" or "accent") })
  end)

  return popover
end

------------------------------------------------------------------------
-- Public API
------------------------------------------------------------------------

NS.OpenPopover = function()
  local p = build()
  if p:IsShown() then p:Hide(); return end
  refreshAll(p)
  p:Show()
end

NS.RefreshPopover = function()
  if popover and popover:IsShown() then refreshAll(popover) end
end

-- Live updates: refresh the popover columns if a narrative event fires
-- while it's open.
if NS.On then
  for _, evt in ipairs({
    "QUEST_ACCEPTED", "QUEST_TURNED_IN", "PLAYER_LEVEL_UP",
    "ZONE_CHANGED_NEW_AREA", "PLAYER_DEAD", "ACHIEVEMENT_EARNED",
  }) do
    NS.On(evt, function() if popover and popover:IsShown() then refreshSessionColumn(popover) end end)
  end
end
