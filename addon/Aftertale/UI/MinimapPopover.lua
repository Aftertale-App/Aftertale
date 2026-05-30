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

-- Outer popover sized so popover.content (the framed-panel inset child) is
-- roughly the original 560x360 working area after the frame thickness +
-- padding (cornerSize 36 + padding 10 = 46px on each side).
local W, H = 620, 432

------------------------------------------------------------------------
-- Voice copy
--
-- The artifact thinks; it does not address the player. "Remembered." not
-- "I noticed." Short, archaic, slightly stranger than necessary.
------------------------------------------------------------------------

local C = {
  sectionKicker = "Tonight's Watch",
  emptyState    = "The watch has just begun. Play on -- every quest, every level, every hard-won death becomes part of your tale.",
  payoff        = "Your tale, written  \195\151  aftertale.gg",
  pausedLine    = "The watch is paused.",
  holdBtn       = "Hold this moment",
  pauseBtn      = "Pause the watch",
  resumeBtn     = "Resume the watch",
  heldPulse     = "Held.",
  pausedPulse   = "Sealed for now.",
  resumedPulse  = "The watch resumes.",
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
  -- Simple inset panel for the portrait. The brand 9-slice frame wraps the
  -- whole popover (built in build()); the portrait just gets a thin-bordered
  -- container for the 3D model. Halo behind it is the paused-state dimmer.
  local frame = S.CreatePanel(parent, { fill = "inset", border = "border", borderAlpha = 0.28 })
  frame:SetSize(w, h)
  frame:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)

  -- A soft violet bloom behind the portrait. Kept tight (5px) and low-alpha so
  -- it reads as a halo, not a second frame competing with the gold 9-slice.
  local halo = parent:CreateTexture(nil, "BACKGROUND")
  halo:SetColorTexture(S.rgba("accent", 0.10))
  halo:SetPoint("TOPLEFT", frame, "TOPLEFT", -5, 5)
  halo:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 5, -5)
  frame.halo = halo

  -- Live PlayerModel filling the panel interior. PlayerModel is relatively
  -- heavy to draw -- only render when the popover is visible.
  local model = CreateFrame("PlayerModel", nil, frame)
  model:SetPoint("TOPLEFT", frame, "TOPLEFT", 2, -2)
  model:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -2, 2)
  local bg = frame:CreateTexture(nil, "BACKGROUND", nil, 1)
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
    panel.portrait.halo:SetColorTexture(r, g, b, (opts and opts.paused) and 0.05 or 0.12)
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

-- The curated stat set, in story-significance order. Only non-zero rows are
-- shown, and we cap the visible count so the sheet stays a digest, not a log.
local STAT_CAP = 5
local function gatherStats(s)
  local all = {
    { label = "Quests taken",      n = s.quests       or 0 },
    { label = "Levels earned",     n = s.levelsGained or 0 },
    { label = "Places discovered", n = s.zones        or 0 },
    { label = "Deaths braved",     n = s.deaths       or 0 },
    { label = "Moments held",      n = s.held         or 0 },
    { label = "Feats earned",      n = s.feats        or 0 },
  }
  local shown = {}
  for _, st in ipairs(all) do
    if st.n > 0 then table.insert(shown, st) end
    if #shown >= STAT_CAP then break end
  end
  return shown
end

local function refreshSessionColumn(panel)
  local s = NS.session or {}
  panel.placeLine:SetText(currentPlace() .. (hourMinute() ~= "" and ("  —  " .. hourMinute()) or ""))

  local stats = gatherStats(s)
  local rows = panel.statRows
  for i, row in ipairs(rows) do
    local st = stats[i]
    if st then
      row.label:SetText(st.label)
      row.value:SetText(tostring(st.n))
      row:ClearAllPoints()
      if i == 1 then
        row:SetPoint("TOPLEFT", panel.statRule, "BOTTOMLEFT", 0, -14)
      else
        row:SetPoint("TOPLEFT", rows[i - 1], "BOTTOMLEFT", 0, -7)
      end
      row:Show()
    else
      row:Hide()
    end
  end

  -- Empty state: when nothing has been captured yet, the cryptic "0 / 0" is
  -- replaced by one plain-language line that says what the watch is doing.
  if #stats == 0 then panel.emptyState:Show() else panel.emptyState:Hide() end
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

local function makeButton(parent, w, h, text, primary)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(w, h)

  -- Primary (the default verb) reads heavier: lifted fill + faint gold wash +
  -- a brighter border. Secondary stays a quiet recessed well.
  local baseFill = primary and "panel" or "inset"
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(b)
  bg:SetColorTexture(S.rgba(baseFill))
  b.bg = bg

  if primary then
    local wash = b:CreateTexture(nil, "BACKGROUND", nil, 1)
    wash:SetAllPoints(b)
    wash:SetColorTexture(S.rgba("gold", 0.08))
  end

  local borderAlpha = primary and 0.9 or 0.4
  local function edge(p1, p2, vertical)
    local t = b:CreateTexture(nil, "BORDER")
    t:SetColorTexture(S.rgba("border", borderAlpha))
    t:SetPoint(p1); t:SetPoint(p2)
    if vertical then t:SetWidth(1) else t:SetHeight(1) end
    return t
  end
  edge("TOPLEFT", "TOPRIGHT", false)
  edge("BOTTOMLEFT", "BOTTOMRIGHT", false)
  edge("TOPLEFT", "BOTTOMLEFT", true)
  edge("TOPRIGHT", "BOTTOMRIGHT", true)

  local label = b:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(label, 13, "")
  label:SetPoint("CENTER")
  label:SetText(S.Kicker(text or ""))
  label:SetTextColor(S.rgba(primary and "goldBright" or "gold"))
  b.label = label

  local hoverR, hoverG, hoverB, hoverA = S.rgba(primary and "gold" or "accent", primary and 0.16 or 0.10)
  b:SetScript("OnEnter", function() bg:SetColorTexture(hoverR, hoverG, hoverB, hoverA) end)
  b:SetScript("OnLeave", function() bg:SetColorTexture(S.rgba(baseFill)) end)
  return b
end

------------------------------------------------------------------------
-- A single stat-sheet row: a left-aligned label and a right-aligned gold
-- count, both on one baseline. The popover builds a fixed pool of these and
-- shows/repositions only the non-zero ones on refresh.
------------------------------------------------------------------------

local function makeStatRow(parent, w)
  local row = CreateFrame("Frame", nil, parent)
  row:SetSize(w, 20)

  local label = S.AddBody(row, "", 14)
  label:SetPoint("LEFT", row, "LEFT", 0, 0)
  label:SetJustifyH("LEFT")
  row.label = label

  local value = row:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(value, 16, "")
  value:SetPoint("RIGHT", row, "RIGHT", 0, 0)
  value:SetJustifyH("RIGHT")
  value:SetTextColor(S.rgba("goldBright"))
  row.value = value

  row:Hide()
  return row
end

------------------------------------------------------------------------
-- Build the popover frame (once, lazily).
------------------------------------------------------------------------

local function build()
  if popover then return popover end

  -- The whole popover is wrapped in the brand 9-slice frame. cornerSize 36
  -- gives the gold star sigils a meaningful presence on the outer corners;
  -- padding 10 keeps content from crowding the gold filigree. popover.content
  -- (the framed-panel inset child) is where every child anchors.
  popover = S.CreateFramedPanel(UIParent, { cornerSize = 36, padding = 10 })
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

  local C_AREA = popover.content -- shorthand; everything below anchors here

  -- Close button -- inside the frame, top-right of the content area, so it
  -- doesn't sit on top of the gold corner sigil.
  local close = CreateFrame("Button", nil, C_AREA)
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", C_AREA, "TOPRIGHT", -2, -2)
  local x = close:CreateFontString(nil, "OVERLAY")
  x:SetFont((GameFontNormalLarge or GameFontNormal):GetFont(), 18, "")
  x:SetPoint("CENTER")
  x:SetText("\195\151") -- ×
  x:SetTextColor(S.rgba("fgMuted"))
  close:SetScript("OnEnter", function() x:SetTextColor(S.rgba("goldBright")) end)
  close:SetScript("OnLeave", function() x:SetTextColor(S.rgba("fgMuted")) end)
  close:SetScript("OnClick", function() popover:Hide() end)

  -- LEFT COLUMN: 60% of the CONTENT area. Portrait + hero name + caps subtitle.
  local PAD = 12
  local cw = C_AREA:GetWidth() > 0 and C_AREA:GetWidth() or (W - 92) -- 92 = frame inset both sides
  local LEFT_W  = math.floor(cw * 0.60) - PAD - 4
  local RIGHT_W = cw - LEFT_W - PAD * 2 - 12
  local PORT_H  = 240

  popover.portrait = buildLeftPortrait(C_AREA, PAD, -PAD, LEFT_W, PORT_H)

  popover.heroName = S.AddHeading(C_AREA, "", 26)
  popover.heroName:SetPoint("TOPLEFT", popover.portrait, "BOTTOMLEFT", 0, -10)
  popover.heroName:SetWidth(LEFT_W)
  popover.heroName:SetJustifyH("CENTER")

  popover.heroMeta = S.AddKicker(C_AREA, "")
  popover.heroMeta:SetPoint("TOPLEFT", popover.heroName, "BOTTOMLEFT", 0, -6)
  popover.heroMeta:SetWidth(LEFT_W)
  popover.heroMeta:SetJustifyH("CENTER")
  popover.heroMeta:SetTextColor(S.rgba("accent"))

  -- RIGHT COLUMN: kicker + live session lines + divider + pulse.
  local rightX = PAD + LEFT_W + 12
  -- Nudge the right block down a touch so it reads as vertically centred
  -- between the frame top and the two bottom buttons (less mid-column void).
  local rightTopY = -PAD - 20

  local sectKicker = S.AddKicker(C_AREA, C.sectionKicker)
  sectKicker:SetPoint("TOPLEFT", C_AREA, "TOPLEFT", rightX, rightTopY)
  sectKicker:SetWidth(RIGHT_W)
  sectKicker:SetJustifyH("LEFT")
  sectKicker:SetTextColor(S.rgba("accent"))

  -- The column's title: zone + time, gold Cinzel display so it anchors the
  -- right side the way the hero name anchors the left (no default-font clash).
  local place = S.AddHeading(C_AREA, "", 18)
  place:SetPoint("TOPLEFT", sectKicker, "BOTTOMLEFT", 0, -10)
  place:SetWidth(RIGHT_W)
  place:SetJustifyH("LEFT")
  popover.placeLine = place

  local rule = S.CreateRule(C_AREA, "accent", 0.35)
  rule:SetPoint("TOPLEFT", place, "BOTTOMLEFT", 0, -14)
  rule:SetWidth(RIGHT_W)
  popover.statRule = rule

  -- Stat-sheet rows: a fixed pool, populated top-down with only the non-zero
  -- categories on refresh (see gatherStats / refreshSessionColumn).
  popover.statRows = {}
  for i = 1, STAT_CAP do
    popover.statRows[i] = makeStatRow(C_AREA, RIGHT_W)
  end

  -- Empty state: shown in place of the rows when nothing has been captured.
  popover.emptyState = S.AddBody(C_AREA, C.emptyState, 13)
  popover.emptyState:SetPoint("TOPLEFT", rule, "BOTTOMLEFT", 0, -14)
  popover.emptyState:SetWidth(RIGHT_W)
  popover.emptyState:SetTextColor(S.rgba("fgMuted"))
  popover.emptyState:Hide()

  -- The payoff line: where the captured story actually becomes prose. Quiet,
  -- always present, sitting just above the buttons. Names aftertale.gg as a
  -- feature, not a CTA -- the watch records here, the chronicle is read there.
  popover.payoff = S.AddKicker(C_AREA, C.payoff)
  popover.payoff:SetPoint("BOTTOMLEFT", C_AREA, "BOTTOMLEFT", rightX, 96)
  popover.payoff:SetWidth(RIGHT_W)
  popover.payoff:SetJustifyH("LEFT")
  popover.payoff:SetTextColor(S.rgba("accent"))

  popover.pausedLine = S.AddBody(C_AREA, C.pausedLine, 13)
  popover.pausedLine:SetPoint("BOTTOMLEFT", C_AREA, "BOTTOMLEFT", rightX, 140)
  popover.pausedLine:SetWidth(RIGHT_W)
  popover.pausedLine:SetTextColor(S.rgba("accent"))
  popover.pausedLine:Hide()

  -- Pulse line: the brief "Held." / "Sealed for now." feedback. Lives in
  -- the same column but on its own anchor so it never collides.
  popover.pulse = C_AREA:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(popover.pulse, 14, "")
  popover.pulse:SetPoint("BOTTOMLEFT", C_AREA, "BOTTOMLEFT", rightX, 118)
  popover.pulse:SetWidth(RIGHT_W)
  popover.pulse:SetJustifyH("LEFT")
  popover.pulse:Hide()

  -- BUTTONS, anchored to the bottom of the right column.
  local BTN_H = 34
  popover.holdBtn = makeButton(C_AREA, RIGHT_W, BTN_H, C.holdBtn, true)
  popover.holdBtn:SetPoint("BOTTOMLEFT", C_AREA, "BOTTOMLEFT", rightX, PAD + BTN_H + 8)
  popover.holdBtn:SetScript("OnClick", function()
    if NS.MarkHeldMoment then NS.MarkHeldMoment() end
    refreshSessionColumn(popover)
    showPulse(popover, S.Kicker(C.heldPulse), { S.rgba("accent") })
  end)

  popover.pauseBtn = makeButton(C_AREA, RIGHT_W, BTN_H, C.pauseBtn, false)
  popover.pauseBtn:SetPoint("BOTTOMLEFT", C_AREA, "BOTTOMLEFT", rightX, PAD)
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
