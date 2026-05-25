-- Settings.lua -- the /coa config panel.
--
-- Parchment-letter aesthetic matching StoryCard. Checkboxes toggle the
-- user-facing features; users who want the addon silent can turn
-- everything off here. Attribution to YUI-Dialogue lives at the bottom.

local ADDON_NAME, NS = ...

local PANEL_WIDTH  = 480
local PANEL_HEIGHT = 480

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

  -- Parchment background
  local bg = panel:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(panel)
  bg:SetTexture(NS.ADDON_PATH .. "\\Art\\Parchment.png")
  bg:SetTexCoord(0.03, 0.97, 0.03, 0.97)

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

  -- Close button (use Blizzard's UIPanelCloseButton template -- the YUI
  -- close-button asset is here for the visual catalog but Blizzard's
  -- built-in works fine and avoids needing to size/scale a PNG cleanly).
  local close = CreateFrame("Button", nil, panel, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -6, -6)
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

  -- Preview button
  y = y - 60
  local preview = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  preview:SetSize(160, 28)
  preview:SetPoint("TOPLEFT", panel, "TOPLEFT", 60, y)
  preview:SetText("Preview story card")
  preview:SetScript("OnClick", function()
    if NS.PreviewStoryCard then NS.PreviewStoryCard() end
  end)

  local openWeb = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  openWeb:SetSize(160, 28)
  openWeb:SetPoint("LEFT", preview, "RIGHT", 16, 0)
  openWeb:SetText("Open chronicle URL")
  openWeb:SetScript("OnClick", function()
    if NS.minimapButton then
      NS.minimapButton:GetScript("OnClick")(NS.minimapButton, "LeftButton")
    end
  end)

  -- Footer / attribution
  local footer = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  footer:SetPoint("BOTTOM", panel, "BOTTOM", 0, 18)
  footer:SetWidth(PANEL_WIDTH - 60)
  footer:SetJustifyH("CENTER")
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
