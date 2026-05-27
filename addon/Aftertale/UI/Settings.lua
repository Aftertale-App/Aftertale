-- Settings.lua -- the /aftertale config panel.
--
-- Parchment-letter aesthetic matching StoryCard. Checkboxes toggle the
-- user-facing features; users who want the addon silent can turn
-- everything off here. Attribution to YUI-Dialogue lives at the bottom.

local ADDON_NAME, NS = ...

local PANEL_WIDTH  = 520
local PANEL_HEIGHT = 480
local SLICE_MARGIN = 80
local SHADOW_OFFSET = 16

------------------------------------------------------------------------
-- 9-slice parchment frame helper -- mirrors YUI's DUIGenericTitledFrame:
-- GenericFrame-Tiled-Large.png with 80px slice margins keeps corner
-- detail crisp at any size; the 16px shadow offset is applied by
-- expanding the background slightly past the frame's hit area.
------------------------------------------------------------------------

local function applyParchmentBackground(parent, slice, shadow)
  slice  = slice  or SLICE_MARGIN
  shadow = shadow or SHADOW_OFFSET
  local bg = parent:CreateTexture(nil, "BACKGROUND")
  bg:SetTexture(NS.ADDON_PATH .. "\\Art\\GenericFrame.png")
  bg:SetPoint("TOPLEFT",     parent, "TOPLEFT",     -shadow,  shadow)
  bg:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT",  shadow, -shadow)
  -- SetTextureSliceMargins is Dragonflight+ (Retail). pcall for Classic.
  pcall(bg.SetTextureSliceMargins, bg, slice, slice, slice, slice)
  if bg.SetTextureSliceMode and Enum and Enum.UITextureSliceMode then
    pcall(bg.SetTextureSliceMode, bg, Enum.UITextureSliceMode.Tiled)
  end
  return bg
end

------------------------------------------------------------------------
-- Custom parchment-toned button -- warm brown backdrop, gold serif text,
-- hover glow, press animation. Replaces UIPanelButtonTemplate's red.
------------------------------------------------------------------------

local function makeParchmentButton(parent, label, width, height)
  local btn = CreateFrame("Button", nil, parent)
  btn:SetSize(width or 160, height or 30)

  local bg = btn:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(btn)
  bg:SetColorTexture(0.18, 0.11, 0.06, 0.85)

  local function edge(p1, p2)
    local t = btn:CreateTexture(nil, "BORDER")
    t:SetColorTexture(0.78, 0.62, 0.32, 0.9)
    t:SetPoint(p1, btn, p1)
    t:SetPoint(p2, btn, p2)
    return t
  end
  local top    = edge("TOPLEFT",    "TOPRIGHT");    top:SetHeight(1)
  local bottom = edge("BOTTOMLEFT", "BOTTOMRIGHT"); bottom:SetHeight(1)
  local left   = edge("TOPLEFT",    "BOTTOMLEFT");  left:SetWidth(1)
  local right  = edge("TOPRIGHT",   "BOTTOMRIGHT"); right:SetWidth(1)

  local text = btn:CreateFontString(nil, "OVERLAY")
  local f = GameFontNormalLarge:GetFont()
  text:SetFont(f, 14, "")
  text:SetPoint("CENTER", btn, "CENTER", 0, 0)
  text:SetText(label)
  text:SetTextColor(0.90, 0.78, 0.48, 1)
  btn.text = text

  btn:SetScript("OnEnter", function() bg:SetColorTexture(0.28, 0.19, 0.10, 0.92); text:SetTextColor(1, 0.92, 0.65, 1) end)
  btn:SetScript("OnLeave", function() bg:SetColorTexture(0.18, 0.11, 0.06, 0.85); text:SetTextColor(0.90, 0.78, 0.48, 1) end)
  btn:SetScript("OnMouseDown", function() text:SetPoint("CENTER", btn, "CENTER", 1, -1) end)
  btn:SetScript("OnMouseUp",   function() text:SetPoint("CENTER", btn, "CENTER", 0,  0) end)

  return btn
end

local function makeCheckbox(parent, label, getter, setter)
  local cb = CreateFrame("CheckButton", nil, parent, "InterfaceOptionsCheckButtonTemplate")
  cb.Text:SetText(label)
  cb.Text:SetTextColor(0.18, 0.12, 0.06, 1)
  cb:SetChecked(getter())
  cb:SetScript("OnClick", function(self)
    setter(self:GetChecked() and true or false)
  end)
  return cb
end

local panel
local function buildPanel()
  if panel then return panel end

  panel = CreateFrame("Frame", "ChroniclesSettingsPanel", UIParent)
  panel:SetSize(PANEL_WIDTH, PANEL_HEIGHT)
  panel:SetPoint("CENTER", UIParent, "CENTER", 0, 40)
  panel:SetFrameStrata("DIALOG")
  panel:SetMovable(true)
  panel:EnableMouse(true)
  panel:RegisterForDrag("LeftButton")
  panel:SetScript("OnDragStart", panel.StartMoving)
  panel:SetScript("OnDragStop", panel.StopMovingOrSizing)
  panel:Hide()

  -- 9-slice parchment background (matches YUI's DUIGenericTitledFrame
  -- approach: 80px corner slices, 16px drop shadow extended past edges).
  applyParchmentBackground(panel)

  -- INSET: torn-paper edges of the 9-slice eat the outer ~50px on each
  -- side. All content must sit inside the safe interior.
  local INSET_X = 60
  local INSET_TOP = 56
  local INSET_BOTTOM = 56

  -- Title -- positioned INSIDE the parchment, just below the top edge.
  local title = panel:CreateFontString(nil, "OVERLAY")
  local titleFont = GameFontNormalLarge:GetFont()
  title:SetFont(titleFont, 20, "")
  title:SetPoint("TOP", panel, "TOP", 0, -INSET_TOP)
  title:SetText("Aftertale")
  title:SetTextColor(0.22, 0.13, 0.06, 1)
  title:SetShadowColor(0, 0, 0, 0.4)
  title:SetShadowOffset(1, -1)

  local sub = panel:CreateFontString(nil, "OVERLAY")
  local subFont = GameFontNormalLarge:GetFont()
  sub:SetFont(subFont, 12, "")
  sub:SetPoint("TOP", title, "BOTTOM", 0, -4)
  sub:SetText("S E T T I N G S")
  sub:SetTextColor(0.30, 0.18, 0.08, 1)

  -- Divider
  local div = panel:CreateTexture(nil, "OVERLAY")
  div:SetTexture(NS.ADDON_PATH .. "\\Art\\Divider.png")
  div:SetSize(PANEL_WIDTH - 2 * INSET_X - 20, 10)
  div:SetPoint("TOP", sub, "BOTTOM", 0, -10)
  div:SetVertexColor(1, 1, 1, 0.65)

  -- Close button -- INSIDE the parchment, just below the top edge,
  -- aligned with the title vertically.
  local close = makeParchmentButton(panel, "X", 28, 28)
  close:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -INSET_X, -INSET_TOP + 6)
  close:SetScript("OnClick", function() panel:Hide() end)

  -- Checkboxes (inset from the LEFT torn edge, plenty of right-side room)
  local cfg = NS.GetConfig()
  local y = -INSET_TOP - 60
  local function addRow(label, key)
    local cb = makeCheckbox(panel, label,
      function() return cfg[key] end,
      function(v) cfg[key] = v end)
    cb:SetPoint("TOPLEFT", panel, "TOPLEFT", INSET_X, y)
    -- Constrain label width so long lines wrap inside the safe area.
    if cb.Text then
      cb.Text:ClearAllPoints()
      cb.Text:SetPoint("LEFT", cb, "RIGHT", 4, 1)
      cb.Text:SetWidth(PANEL_WIDTH - 2 * INSET_X - 40)
      cb.Text:SetJustifyH("LEFT")
    end
    y = y - 34
    return cb
  end

  addRow("Show story cards on quest accept/turn-in", "showStoryCards")
  addRow("Show story cards on level-up",             "showLevelCards")
  addRow("Print session recap on logout",            "showSessionRecap")

  local cbMM = addRow("Show minimap button",         "showMinimapButton")
  cbMM:HookScript("OnClick", function(self)
    if NS.SetMinimapButtonVisible then
      NS.SetMinimapButtonVisible(self:GetChecked() and true or false)
    end
  end)

  addRow("Play UI sounds",                            "playSounds")

  -- Slider: story card duration
  y = y - 18
  local slider = CreateFrame("Slider", "ChroniclesDurationSlider", panel, "OptionsSliderTemplate")
  slider:SetPoint("TOPLEFT", panel, "TOPLEFT", INSET_X + 20, y)
  slider:SetWidth(PANEL_WIDTH - 2 * INSET_X - 40)
  slider:SetMinMaxValues(2, 10)
  slider:SetValueStep(0.5)
  slider:SetObeyStepOnDrag(true)
  slider:SetValue(cfg.storyCardDuration or 5)
  _G[slider:GetName() .. "Low"]:SetText("2s")
  _G[slider:GetName() .. "High"]:SetText("10s")
  _G[slider:GetName() .. "Text"]:SetText("Story card hold: " .. string.format("%.1fs", cfg.storyCardDuration or 5))
  slider:SetScript("OnValueChanged", function(self, v)
    cfg.storyCardDuration = math.floor(v * 2 + 0.5) / 2
    _G[self:GetName() .. "Text"]:SetText("Story card hold: " .. string.format("%.1fs", cfg.storyCardDuration))
  end)

  -- Preview button (custom parchment style, not Blizzard red)
  y = y - 60
  local preview = makeParchmentButton(panel, "Preview story card", 170, 30)
  preview:SetPoint("TOPLEFT", panel, "TOPLEFT", INSET_X + 20, y)
  preview:SetScript("OnClick", function()
    if NS.PreviewStoryCard then NS.PreviewStoryCard() end
  end)

  local openWeb = makeParchmentButton(panel, "Open chronicle URL", 170, 30)
  openWeb:SetPoint("LEFT", preview, "RIGHT", 20, 0)
  openWeb:SetScript("OnClick", function()
    if NS.minimapButton then
      NS.minimapButton:GetScript("OnClick")(NS.minimapButton, "LeftButton")
    end
  end)

  -- Footer / attribution -- INSIDE the parchment, above the bottom torn
  -- edge. Dark brown so it's legible against the gold parchment (the
  -- old |cFFC9A969 gold was invisible-on-gold).
  local footer = panel:CreateFontString(nil, "OVERLAY")
  local ff = GameFontNormalSmall:GetFont()
  footer:SetFont(ff, 10, "")
  footer:SetPoint("BOTTOM", panel, "BOTTOM", 0, INSET_BOTTOM - 20)
  footer:SetWidth(PANEL_WIDTH - 2 * INSET_X)
  footer:SetJustifyH("CENTER")
  footer:SetSpacing(2)
  footer:SetText(
    "|cFF5A3A1AParchment and sound assets adapted from|r " ..
    "|cFF6B3410YUI-Dialogue|r |cFF5A3A1Aby Peterodox, used with permission.|r"
  )

  return panel
end

NS.OpenSettings = function()
  local p = buildPanel()
  if p:IsShown() then p:Hide() else
    p:Show()
    NS.PlaySound("page-turn.mp3")
  end
end
