-- Settings.lua -- the /aftertale config panel.
--
-- Wears the same brand 9-slice frame as the minimap popover: gold filigree
-- on violet-dark, Cinzel headings, soft accent rules. No parchment, no
-- borrowed art -- Aftertale's own visual ID. Checkboxes toggle the
-- user-facing features; turn everything off here for a fully silent watch.

local ADDON_NAME, NS = ...
local S = NS.Style

local W, H = 540, 470

------------------------------------------------------------------------
-- Brand button -- mirrors the popover's verbs. Primary reads heavier
-- (lifted fill + faint gold wash + bright border); secondary is a quiet
-- recessed well. Gold Cinzel caps label, violet/gold hover.
------------------------------------------------------------------------

local function makeButton(parent, text, width, height, primary)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(width or 160, height or 30)

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
-- Checkbox -- Blizzard's neutral check art, brand body label.
------------------------------------------------------------------------

local function makeCheckbox(parent, label, getter, setter)
  local cb = CreateFrame("CheckButton", nil, parent, "InterfaceOptionsCheckButtonTemplate")
  cb.Text:SetText(label)
  cb.Text:SetTextColor(S.rgba("fg"))
  cb:SetChecked(getter())
  cb:SetScript("OnClick", function(self)
    setter(self:GetChecked() and true or false)
  end)
  return cb
end

local panel
local function buildPanel()
  if panel then return panel end

  -- The brand 9-slice frame. cornerSize 32 keeps the gold corner sigils
  -- present; padding 14 gives the content room off the filigree. panel.content
  -- (the inset child) is where everything anchors.
  panel = S.CreateFramedPanel(UIParent, { cornerSize = 32, padding = 14 })
  panel:SetSize(W, H)
  panel:SetPoint("CENTER", UIParent, "CENTER", 0, 40)
  panel:SetFrameStrata("DIALOG")
  panel:SetMovable(true)
  panel:EnableMouse(true)
  panel:RegisterForDrag("LeftButton")
  panel:SetScript("OnDragStart", panel.StartMoving)
  panel:SetScript("OnDragStop", panel.StopMovingOrSizing)
  panel:Hide()

  local C = panel.content
  local cw = C:GetWidth() > 0 and C:GetWidth() or (W - 92)

  -- Header: gold Cinzel title + violet kicker, the popover's voice.
  local kicker = S.AddKicker(C, "Settings")
  kicker:SetPoint("TOPLEFT", C, "TOPLEFT", 0, 0)

  local title = S.AddHeading(C, "Aftertale", 24)
  title:SetPoint("TOPLEFT", kicker, "BOTTOMLEFT", 0, -6)

  local rule = S.CreateRule(C, "accent", 0.35)
  rule:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -12)
  rule:SetWidth(cw)

  -- Close (×) -- quiet glyph, gold on hover. Same as the popover.
  local close = CreateFrame("Button", nil, panel)
  close:SetSize(28, 28)
  close:SetPoint("TOPRIGHT", C, "TOPRIGHT", 0, 2)
  local x = close:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(x, 18, "")
  x:SetPoint("CENTER")
  x:SetText("\195\151") -- ×
  x:SetTextColor(S.rgba("fgMuted"))
  close:SetScript("OnEnter", function() x:SetTextColor(S.rgba("goldBright")) end)
  close:SetScript("OnLeave", function() x:SetTextColor(S.rgba("fgMuted")) end)
  close:SetScript("OnClick", function() panel:Hide() end)

  -- Checkboxes
  local cfg = NS.GetConfig()
  local y = -54
  local function addRow(label, key)
    local cb = makeCheckbox(panel, label,
      function() return cfg[key] end,
      function(v) cfg[key] = v end)
    cb:SetPoint("TOPLEFT", C, "TOPLEFT", 0, y)
    if cb.Text then
      cb.Text:ClearAllPoints()
      cb.Text:SetPoint("LEFT", cb, "RIGHT", 4, 1)
      cb.Text:SetWidth(cw - 36)
      cb.Text:SetJustifyH("LEFT")
    end
    y = y - 36
    return cb
  end

  addRow("Whisper a chat note when a quest is taken or turned in", "showStoryCards")
  addRow("Whisper a chat note when you reach a new level",         "showLevelCards")
  addRow("Print the session recap on logout",                     "showSessionRecap")

  local cbMM = addRow("Show the minimap button",                  "showMinimapButton")
  cbMM:HookScript("OnClick", function(self)
    if NS.SetMinimapButtonVisible then
      NS.SetMinimapButtonVisible(self:GetChecked() and true or false)
    end
  end)

  addRow("Play UI sounds",                                        "playSounds")

  -- Action buttons, anchored to the bottom of the content area.
  local preview = makeButton(C, "Preview a chat note", 180, 32, false)
  preview:SetPoint("BOTTOMLEFT", C, "BOTTOMLEFT", 0, 0)
  preview:SetScript("OnClick", function()
    if NS.PreviewStoryCard then NS.PreviewStoryCard() end
  end)

  local openWeb = makeButton(C, "Open the chronicle", 180, 32, true)
  openWeb:SetPoint("LEFT", preview, "RIGHT", 16, 0)
  openWeb:SetScript("OnClick", function()
    if NS.minimapButton then
      NS.minimapButton:GetScript("OnClick")(NS.minimapButton, "LeftButton")
    end
  end)

  -- Footer: the value loop, stated plainly. The watch records here; the
  -- chronicle is read on aftertale.gg.
  local footer = S.AddMuted(C, "Aftertale quietly records this character's journey. Read the written chronicle at aftertale.gg.", 11)
  footer:SetPoint("BOTTOMLEFT", preview, "TOPLEFT", 0, 14)
  footer:SetWidth(cw)
  footer:SetJustifyH("LEFT")

  return panel
end

NS.OpenSettings = function()
  local p = buildPanel()
  if p:IsShown() then p:Hide() else p:Show() end
end
