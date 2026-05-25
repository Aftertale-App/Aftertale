-- Settings.lua -- the /coa config panel.
--
-- Parchment-letter aesthetic matching StoryCard. Checkboxes toggle the
-- user-facing features; users who want the addon silent can turn
-- everything off here. Attribution to YUI-Dialogue lives at the bottom.

local ADDON_NAME, NS = ...

local PANEL_WIDTH  = 480
local PANEL_HEIGHT = 480

------------------------------------------------------------------------
-- Custom parchment-toned button -- replaces UIPanelButtonTemplate's
-- jarring red gradient with a warm brown backdrop + gold serif text +
-- hover glow that fits the letter aesthetic.
------------------------------------------------------------------------

local function makeParchmentButton(parent, label, width, height)
  local btn = CreateFrame("Button", nil, parent)
  btn:SetSize(width or 160, height or 30)

  -- Dark-brown backdrop using Blizzard's built-in flat texture
  local bg = btn:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(btn)
  bg:SetColorTexture(0.18, 0.11, 0.06, 0.85)

  -- Thin gold border (4 edges)
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

  -- Gold serif label
  local text = btn:CreateFontString(nil, "OVERLAY")
  local f = GameFontNormalLarge:GetFont()
  text:SetFont(f, 14, "")
  text:SetPoint("CENTER", btn, "CENTER", 0, 0)
  text:SetText(label)
  text:SetTextColor(0.90, 0.78, 0.48, 1)
  btn.text = text

  -- Hover glow
  btn:SetScript("OnEnter", function(self)
    bg:SetColorTexture(0.28, 0.19, 0.10, 0.92)
    text:SetTextColor(1, 0.92, 0.65, 1)
  end)
  btn:SetScript("OnLeave", function(self)
    bg:SetColorTexture(0.18, 0.11, 0.06, 0.85)
    text:SetTextColor(0.90, 0.78, 0.48, 1)
  end)
  btn:SetScript("OnMouseDown", function(self)
    text:SetPoint("CENTER", btn, "CENTER", 1, -1)
  end)
  btn:SetScript("OnMouseUp", function(self)
    text:SetPoint("CENTER", btn, "CENTER", 0, 0)
  end)

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

  -- Parchment background -- clip to the OPAQUE BODY band of the source
  -- (1024x2048 image has decorative scroll caps and a torn-paper element
  -- in its lower half that we don't want stretched into the panel).
  local bg = panel:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(panel)
  bg:SetTexture(NS.ADDON_PATH .. "\\Art\\Parchment.png")
  bg:SetTexCoord(0.06, 0.94, 0.10, 0.55)

  -- Vignette edges
  local vig = panel:CreateTexture(nil, "BORDER")
  vig:SetAllPoints(panel)
  vig:SetTexture(NS.ADDON_PATH .. "\\Art\\ScreenVignette.png")
  vig:SetVertexColor(0, 0, 0, 0.5)

  -- Title
  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOP", panel, "TOP", 0, -24)
  title:SetText("|cFF3A2616Chronicles of Azeroth|r")
  local sub = panel:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  sub:SetPoint("TOP", title, "BOTTOM", 0, -4)
  sub:SetText("|cFF7A5A33-- settings --|r")

  -- Divider
  local div = panel:CreateTexture(nil, "OVERLAY")
  div:SetTexture(NS.ADDON_PATH .. "\\Art\\Divider.png")
  div:SetSize(400, 10)
  div:SetPoint("TOP", sub, "BOTTOM", 0, -8)
  div:SetVertexColor(1, 1, 1, 0.6)

  -- Close button (YUI's CloseButton.png -- warm brown X that matches parchment)
  local close = CreateFrame("Button", nil, panel)
  close:SetSize(28, 28)
  close:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -10, -10)
  local cx = close:CreateTexture(nil, "ARTWORK")
  cx:SetAllPoints(close)
  cx:SetTexture(NS.ADDON_PATH .. "\\Art\\CloseButton.png")
  cx:SetTexCoord(0, 0.5, 0, 0.5)
  close:SetScript("OnEnter", function() cx:SetTexCoord(0.5, 1, 0, 0.5); cx:SetVertexColor(1.1, 1.0, 0.8, 1) end)
  close:SetScript("OnLeave", function() cx:SetTexCoord(0, 0.5, 0, 0.5); cx:SetVertexColor(1, 1, 1, 1) end)
  close:SetScript("OnClick", function() panel:Hide() end)

  -- Checkboxes
  local cfg = NS.GetConfig()
  local y = -90
  local function addRow(label, key)
    local cb = makeCheckbox(panel, label,
      function() return cfg[key] end,
      function(v) cfg[key] = v end)
    cb:SetPoint("TOPLEFT", panel, "TOPLEFT", 40, y)
    y = y - 32
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
  y = y - 16
  local slider = CreateFrame("Slider", "ChroniclesDurationSlider", panel, "OptionsSliderTemplate")
  slider:SetPoint("TOPLEFT", panel, "TOPLEFT", 60, y)
  slider:SetWidth(320)
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
  preview:SetPoint("TOPLEFT", panel, "TOPLEFT", 60, y)
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

  -- Footer / attribution -- sits INSIDE the parchment, above the bottom edge
  local footer = panel:CreateFontString(nil, "OVERLAY")
  local ff = GameFontNormalSmall:GetFont()
  footer:SetFont(ff, 10, "")
  footer:SetPoint("BOTTOM", panel, "BOTTOM", 0, 22)
  footer:SetWidth(PANEL_WIDTH - 80)
  footer:SetJustifyH("CENTER")
  footer:SetSpacing(2)
  footer:SetText(
    "|cFF7A5A33Parchment and sound assets adapted from|r " ..
    "|cFFC9A969YUI-Dialogue|r |cFF7A5A33by Peterodox, used with permission.|r"
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
