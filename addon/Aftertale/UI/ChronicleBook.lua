-- UI/ChronicleBook.lua -- the in-game reader.
--
-- Two-pane book opened from the minimap button / slash command. Left pane is a
-- scrollable list of narrative beats (quests, level-ups, zones, deaths, …);
-- right pane shows the selected beat. A beat reads one of two ways:
--   * Chronicler's chapter -- enriched prose round-tripped from aftertale.gg
--     (db.enriched[EntryID]).
--   * Scribe's note -- a clean placeholder for a beat not yet enriched,
--     pointing the player at the chronicler. (NS.Templates.Narrate is no longer
--     shown here -- a note should read as a note, not as fake prose.)
--
-- Visual system: flat + modern on NS.Style (the addon's index.css) -- deep
-- violet ground, gold Cinzel headings, violet accents. No leather/parchment/
-- polaroid (the old Peterodox album art is retired). Works on every flavor.

local ADDON_NAME, NS = ...
local S = NS.Style

local FRAME_W = 798
local FRAME_H = 505

-- Flat two-pane layout: header band across the top, list + detail below.
--   pad | left pane | gap | right pane | pad
local PAD       = 16
local HEADER_H  = 70
local GAP       = 16
local LEFT_PAGE  = { x = PAD,                 y = -HEADER_H, w = 360, h = FRAME_H - HEADER_H - PAD }
local RIGHT_PAGE = { x = PAD + 360 + GAP,     y = -HEADER_H, w = 390, h = FRAME_H - HEADER_H - PAD }

local book          -- cached top-level frame
local entryButtons  -- pooled left-pane row buttons
local currentList   -- row descriptors currently shown
local selectedIdx

-- Kicker (letter-spaced caps). Prefer the shared Style/Scribe helper.
local function formatKicker(s)
  if S and S.Kicker then return S.Kicker(s) end
  if NS.Scribe and NS.Scribe.Kicker then return NS.Scribe.Kicker(s) end
  return (s or ""):upper()
end

-- hh:mm out of an ISO timestamp for the scribe-note "Westfall · 09:42" line.
local function shortTime(ts)
  if not ts or ts == "" then return nil end
  local hh, mm = ts:match("T(%d%d):(%d%d)")
  if hh then return hh .. ":" .. mm end
  return ts
end

-- Body for an unenriched beat: "place · time" header + a one-line deed.
local function buildScribesNoteBody(entry, charName)
  local enr = entry.enrichment or {}
  local resolveZone = NS.Templates and NS.Templates.ResolveZone
  local place = (resolveZone and resolveZone(enr)) or enr.zoneText or "an unnamed place"
  local time  = shortTime(entry.ts)
  local header = time and (place .. "  ·  " .. time) or place

  local deed = NS.Templates and NS.Templates.Preview and NS.Templates.Preview(entry, charName) or ""
  if deed == "" then deed = entry.event or "" end
  if not deed:find("[%.%!%?]$") then deed = deed .. "." end
  return header .. "\n\n" .. deed
end

------------------------------------------------------------------------
-- Data: collect narrative beats, newest-first, grouped into zone "chapters".
------------------------------------------------------------------------

local function zoneOf(ev)
  local resolver = NS.Templates and NS.Templates.ResolveZone
  if resolver and ev.enrichment then
    local name = resolver(ev.enrichment)
    if name then return name end
  end
  return (ev.enrichment and ev.enrichment.zoneText) or "Unknown Lands"
end

local function collectRows()
  local db = NS.GetDB and NS.GetDB() or AftertaleDB
  if not db or not db.events then return {} end

  local oldestFirst = {}
  for i, ev in ipairs(db.events) do
    if NS.Templates.IsNarrativeEntry(ev) then
      table.insert(oldestFirst, { entry = ev, idx = i })
    end
  end
  table.sort(oldestFirst, function(a, b) return (a.entry.t or 0) < (b.entry.t or 0) end)

  local chapters = {}
  local curZone, curChap = nil, nil
  for _, item in ipairs(oldestFirst) do
    local z = zoneOf(item.entry)
    if z ~= curZone then
      curChap = { zone = z, events = {}, index = #chapters + 1 }
      table.insert(chapters, curChap)
      curZone = z
    end
    table.insert(curChap.events, item)
  end

  local rows = {}
  if db.bible and db.bible ~= "" then
    table.insert(rows, { kind = "bible" })
  end
  for c = #chapters, 1, -1 do
    local ch = chapters[c]
    table.insert(rows, { kind = "chapter", index = ch.index, zone = ch.zone, count = #ch.events })
    for e = #ch.events, 1, -1 do
      local item = ch.events[e]
      table.insert(rows, {
        kind = "event", entry = item.entry, idx = item.idx,
        chapterIndex = ch.index, chapterZone = ch.zone,
      })
    end
  end
  return rows
end

local function getNarrationFor(entry)
  local db = NS.GetDB and NS.GetDB() or AftertaleDB
  local enriched = db and db.enriched
  local id = NS.Templates.EntryID(entry)
  if enriched and enriched[id] then return enriched[id], true end
  local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
  local name = (char and char.identity and char.identity.name) or "the traveler"
  return NS.Templates.Narrate(entry, name), false
end

------------------------------------------------------------------------
-- Right pane: the selected beat, rendered flat on the detail panel.
------------------------------------------------------------------------

local function buildRightPage(parent)
  local page = S.CreatePanel(parent, { fill = "inset", border = "border", borderAlpha = 0.45 })
  page:SetSize(RIGHT_PAGE.w, RIGHT_PAGE.h)
  page:SetPoint("TOPLEFT", parent, "TOPLEFT", RIGHT_PAGE.x, RIGHT_PAGE.y)

  local INNER = 22
  local width = RIGHT_PAGE.w - INNER * 2

  -- kicker (chapter label / SCRIBE'S NOTE) — violet caps
  local kicker = S.AddKicker(page, "")
  kicker:SetPoint("TOPLEFT", page, "TOPLEFT", INNER, -INNER)
  kicker:SetWidth(width)
  kicker:SetJustifyH("LEFT")
  page.kicker = kicker

  -- title — gold Cinzel
  local title = S.AddHeading(page, "", 21)
  title:SetPoint("TOPLEFT", kicker, "BOTTOMLEFT", 0, -8)
  title:SetWidth(width)
  title:SetJustifyH("LEFT")
  title:SetWordWrap(true)
  page.title = title

  -- thin violet rule under the title
  local rule = S.CreateRule(page, "accent", 0.35)
  rule:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -12)
  rule:SetWidth(width)
  page.rule = rule

  -- body — readable fg text
  local body = S.AddBody(page, "", 14)
  body:SetPoint("TOPLEFT", rule, "BOTTOMLEFT", 0, -14)
  body:SetWidth(width)
  body:SetPoint("BOTTOM", page, "BOTTOM", 0, 44)
  page.body = body

  -- footer — muted, pinned to the bottom
  local footer = S.AddMuted(page, "", 12)
  footer:SetPoint("BOTTOMLEFT", page, "BOTTOMLEFT", INNER, 16)
  footer:SetWidth(width)
  footer:SetJustifyH("LEFT")
  page.footer = footer

  -- empty / no-selection state, centered
  local empty = S.AddMuted(page, "", 13)
  empty:SetPoint("CENTER", page, "CENTER", 0, 0)
  empty:SetWidth(width - 20)
  empty:SetJustifyH("CENTER")
  empty:SetText((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.rightPageEmpty)
    or "Choose a beat from the journal to read it.")
  page.empty = empty

  -- ----- Hero Card overlay (shown only when the Hero's Truth row is selected)
  -- The landing-page "Meet the Hero" card, ported to in-client surfaces:
  -- live PlayerModel portrait inside a panel with a violet halo, a giant gold
  -- Cinzel hero name (reuses page.title), a letter-spaced caps subtitle, and
  -- the bible body below. Rounded corners + soft blur are 9-slice work for
  -- later — these are the in-client pieces that don't need designed art.
  local card = {}

  -- Portrait area: a thin-bordered panel framing the live player model.
  -- Sized for chest-up framing inside the right pane.
  local portFrame = S.CreatePanel(page, { fill = "inset", border = "border", borderAlpha = 0.6 })
  portFrame:SetSize(width, 260)
  portFrame:SetPoint("TOPLEFT", page, "TOPLEFT", INNER, -(INNER + 22))
  portFrame:Hide()
  card.portFrame = portFrame

  -- Violet halo: a low-alpha violet panel anchored ~6px larger than the
  -- portrait frame on every side. Reads as a tint zone behind the card —
  -- the cheap stand-in for the landing page's soft glow until 9-slice ships.
  local halo = page:CreateTexture(nil, "BACKGROUND")
  halo:SetColorTexture(S.rgba("accent", 0.18))
  halo:SetPoint("TOPLEFT", portFrame, "TOPLEFT", -8, 8)
  halo:SetPoint("BOTTOMRIGHT", portFrame, "BOTTOMRIGHT", 8, -8)
  halo:Hide()
  card.halo = halo

  -- The live PlayerModel: the addon's headline trick — your actual character
  -- breathing in the panel, not a stamped image. Lives inside portFrame so
  -- it inherits the framing.
  local model = CreateFrame("PlayerModel", nil, portFrame)
  model:SetPoint("TOPLEFT", portFrame, "TOPLEFT", 2, -2)
  model:SetPoint("BOTTOMRIGHT", portFrame, "BOTTOMRIGHT", -2, 2)
  -- Black background showing through if the model fails to load on this flavor.
  local modelBg = portFrame:CreateTexture(nil, "BACKGROUND", nil, 1)
  modelBg:SetAllPoints(model)
  modelBg:SetColorTexture(0.04, 0.02, 0.08, 1)
  card.model = model

  -- Subtitle below the hero name: race · class · faction, letter-spaced caps.
  -- (Cinzel has no italic, so we use the same kicker treatment as the landing,
  -- which is how the landing actually renders "FORGESWORN · IRON-BOUND".)
  local subtitle = S.AddKicker(page, "")
  subtitle:Hide()
  card.subtitle = subtitle

  -- A warm-amber wash at the bottom of the page that mimics the landing
  -- card's purple→amber gradient under the portrait. Solid color w/ vertex
  -- gradient: transparent at top, low-alpha amber at the bottom.
  local wash = page:CreateTexture(nil, "BACKGROUND", nil, 2)
  wash:SetColorTexture(1, 1, 1, 1)
  wash:SetGradient("VERTICAL",
    CreateColor and CreateColor(0.545, 0.384, 0.251, 0.18) or { r = 0.545, g = 0.384, b = 0.251, a = 0.18 },
    CreateColor and CreateColor(0.102, 0.055, 0.180, 0)   or { r = 0.102, g = 0.055, b = 0.180, a = 0    })
  wash:SetPoint("BOTTOMLEFT", page, "BOTTOMLEFT", 1, 1)
  wash:SetPoint("BOTTOMRIGHT", page, "BOTTOMRIGHT", -1, 1)
  wash:SetHeight(140)
  wash:Hide()
  card.wash = wash

  page.card = card
  return page
end

-- Show/hide the hero-card-only widgets in one call.
local function setHeroCardShown(page, shown)
  local c = page.card
  if not c then return end
  if shown then
    c.portFrame:Show(); c.halo:Show(); c.subtitle:Show(); c.wash:Show()
  else
    c.portFrame:Hide(); c.halo:Hide(); c.subtitle:Hide(); c.wash:Hide()
  end
end

local function clearDetail(page)
  page.kicker:SetText("")
  page.title:SetText("")
  page.body:SetText("")
  page.footer:SetText("")
  page.rule:Hide()
end

-- Default (non-card) anchors for the title/rule/body. The hero-card render
-- relocates them below the portrait; everything else uses these. Re-applying
-- the same SetPoint cycle on every render is cheap and reliable.
local function applyDefaultAnchors(page)
  local INNER = 22
  local width = page:GetWidth() - INNER * 2
  page.title:ClearAllPoints()
  page.title:SetPoint("TOPLEFT", page.kicker, "BOTTOMLEFT", 0, -8)
  page.title:SetWidth(width)
  page.title:SetJustifyH("LEFT")
  page.rule:ClearAllPoints()
  page.rule:SetPoint("TOPLEFT", page.title, "BOTTOMLEFT", 0, -12)
  page.rule:SetWidth(width)
  page.body:ClearAllPoints()
  page.body:SetPoint("TOPLEFT", page.rule, "BOTTOMLEFT", 0, -14)
  page.body:SetWidth(width)
  page.body:SetPoint("BOTTOM", page, "BOTTOM", 0, 44)
  page.body:SetJustifyH("LEFT")
end

local function renderEntry(page, row)
  if not row or not row.kind then
    clearDetail(page)
    setHeroCardShown(page, false)
    if NS.Scribe and NS.Scribe.Voice then page.empty:SetText(NS.Scribe.Voice.rightPageEmpty) end
    page.empty:Show()
    return
  end
  page.empty:Hide()
  page.rule:Show()
  -- default kicker tint is violet (AddKicker sets it); chapter/bible override.
  page.kicker:SetTextColor(S.rgba("accent"))

  if row.kind == "bible" then
    -- Hero Card layout: portrait halo + live PlayerModel up top, hero name
    -- below as the title, letter-spaced subtitle, then the bible body. This
    -- is the in-client port of the landing's "Meet the Hero" exhibit.
    local db = NS.GetDB and NS.GetDB() or AftertaleDB
    local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
    local name = (char and char.identity and char.identity.name) or (UnitName and UnitName("player")) or "the traveler"
    local race    = (char and char.identity and char.identity.race) or (UnitRace and UnitRace("player")) or ""
    local class   = (char and char.identity and char.identity.class) or (UnitClass and UnitClass("player")) or ""
    local faction = (char and char.identity and char.identity.faction) or (UnitFactionGroup and UnitFactionGroup("player")) or ""
    local parts = {}
    if race    ~= "" then table.insert(parts, race) end
    if class   ~= "" then table.insert(parts, class) end
    if faction ~= "" then table.insert(parts, faction) end
    local subtitle = table.concat(parts, "  ·  ")

    -- Show the card, hide the standard top-of-page rule (subtitle does that work).
    setHeroCardShown(page, true)
    page.rule:Hide()

    -- Live player model on the portrait frame. SetPortraitZoom isn't on
    -- Vanilla, so we degrade to default framing on flavors that lack it.
    local m = page.card.model
    if m then
      pcall(m.ClearModel, m)
      pcall(m.SetUnit, m, "player")
      if m.SetPortraitZoom then pcall(m.SetPortraitZoom, m, 0.7) end
      if m.SetCamDistanceScale then pcall(m.SetCamDistanceScale, m, 1.0) end
      if m.RefreshUnit then pcall(m.RefreshUnit, m) end
    end

    -- Kicker stays violet ("THE HERO'S TRUTH"); title sits BELOW the portrait.
    page.kicker:SetText(formatKicker((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.bibleKicker) or "The Hero's Truth"))
    page.kicker:SetTextColor(S.rgba("accent"))

    -- Anchor title under the portrait, big and centered to feel like the card.
    local INNER = 22
    local width = page:GetWidth() - INNER * 2
    page.title:ClearAllPoints()
    page.title:SetPoint("TOPLEFT", page.card.portFrame, "BOTTOMLEFT", 0, -14)
    page.title:SetWidth(width)
    page.title:SetJustifyH("CENTER")
    page.title:SetText(name)

    -- Subtitle: letter-spaced caps below the hero name.
    page.card.subtitle:SetText(formatKicker(subtitle))
    page.card.subtitle:ClearAllPoints()
    page.card.subtitle:SetPoint("TOPLEFT", page.title, "BOTTOMLEFT", 0, -8)
    page.card.subtitle:SetWidth(width)
    page.card.subtitle:SetJustifyH("CENTER")
    page.card.subtitle:SetTextColor(S.rgba("accent"))

    -- Body: the bible prose, anchored below the subtitle.
    page.body:ClearAllPoints()
    page.body:SetPoint("TOPLEFT", page.card.subtitle, "BOTTOMLEFT", 0, -14)
    page.body:SetWidth(width)
    page.body:SetPoint("BOTTOM", page, "BOTTOM", 0, 20)
    page.body:SetJustifyH("CENTER")
    local body = db.bible or ""
    if body == "" then
      body = (NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.bibleEmpty)
        or "No bible yet. Roll your hero at aftertale.gg, then drop the AftertaleRestore.lua file into your SavedVariables folder."
    end
    page.body:SetText(body)
    page.footer:SetText("")
    return
  end

  -- Non-bible rows: regular anchors, no card.
  setHeroCardShown(page, false)
  applyDefaultAnchors(page)

  if row.kind == "chapter" then
    page.kicker:SetText(formatKicker("Chapter " .. (row.index or "")))
    page.kicker:SetTextColor(S.rgba("goldDeep"))
    page.title:SetText(row.zone or "Unknown Lands")
    page.body:SetText((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.chapterSummary
                       and NS.Scribe.Voice.chapterSummary(row.count, row.zone))
                   or string.format("This chapter holds %d beat%s from %s.\n\nChoose one from the journal to read it.",
                        row.count, row.count == 1 and "" or "s", row.zone or "an unknown place"))
    page.footer:SetText("")
    return
  end

  -- event beat
  local entry = row.entry
  local enr  = entry.enrichment or {}
  local args = entry.args or {}
  local title
  if entry.event == "QUEST_ACCEPTED" or entry.event == "QUEST_TURNED_IN" then
    title = enr.questTitle or (args[2] and ("Quest #" .. tostring(args[2]))) or "An unnamed quest"
  elseif entry.event == "PLAYER_LEVEL_UP" then
    local lvl = enr.level or args[1]
    title = lvl and ("Level " .. tostring(lvl)) or "A new level"
  elseif entry.event == "ZONE_CHANGED_NEW_AREA" then
    title = enr.zoneText or "A new place"
  elseif entry.event == "PLAYER_DEAD" then
    title = "A death in " .. (enr.zoneText or "the field")
  elseif entry.event == "ACHIEVEMENT_EARNED" then
    title = enr.achievementName or "An achievement"
  else
    title = entry.event
  end
  page.title:SetText(title)

  local narration, isEnriched = getNarrationFor(entry)
  if isEnriched then
    local kickerText = row.chapterIndex
      and ("Chapter " .. row.chapterIndex .. "   " .. (row.chapterZone or ""))
      or "A Chapter in the Chronicle"
    page.kicker:SetText(formatKicker(kickerText))
    page.kicker:SetTextColor(S.rgba("goldDeep"))
    page.body:SetText(narration)
    local zone = enr.zoneText or "the road"
    local ts   = entry.ts or ""
    local lvl  = (enr.level or (entry.event == "PLAYER_LEVEL_UP" and args[1])) or nil
    local parts = { zone }
    if lvl then table.insert(parts, "level " .. lvl) end
    if ts ~= "" then table.insert(parts, ts) end
    page.footer:SetText(table.concat(parts, "   ·   "))
  else
    -- Scribe's note: violet kicker, clearly a placeholder, points at the chronicler.
    page.kicker:SetText(formatKicker((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.noteKicker) or "Scribe's Note"))
    -- (kicker already violet)
    page.body:SetText(buildScribesNoteBody(entry, nil))
    page.footer:SetText((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.noteFooter)
      or "The chronicler awaits at aftertale.gg.")
  end
end

------------------------------------------------------------------------
-- Left pane: scrollable beat list.
------------------------------------------------------------------------

local ROW_HEIGHT_EVENT  = 30
local ROW_HEIGHT_HEADER = 24
local ROW_HEIGHT_BIBLE  = 36

local function styleRowAsBible(row)
  -- No ✦ here: U+2726 isn't in WoW's default font and tofus. The label
  -- carries the row; the icon stays empty until we ship a star texture.
  row.icon:SetText("")
  row.icon:SetTextColor(S.rgba("accent"))
  row.label:SetText(formatKicker("The Hero's Truth"))
  S.UseDisplayFont(row.label, 11, "")
  row.label:SetTextColor(S.rgba("goldBright"))
  row.meta:SetText("")
end

local function styleRowAsChapter(row, chapter)
  row.icon:SetText("")
  S.UseDisplayFont(row.label, 11, "")
  row.label:SetText(formatKicker("Chapter " .. (chapter.index or "") .. "   " .. (chapter.zone or "")))
  row.label:SetTextColor(S.rgba("goldDeep"))
  row.meta:SetText(tostring(chapter.count))
  row.meta:SetTextColor(S.rgba("fgFaint"))
end

local function styleRowAsEvent(row, entry)
  row.icon:SetText("")
  local fbody = (GameFontHighlight or GameFontNormal):GetFont()
  row.label:SetFont(fbody, 13, "")
  row.label:SetText(NS.Templates.Preview(entry, nil))
  -- enriched beats read brighter; un-enriched (scribe notes) sit muted.
  local _, isEnriched = getNarrationFor(entry)
  row.label:SetTextColor(S.rgba(isEnriched and "fg" or "fgMuted"))
  local lvl = entry.enrichment and entry.enrichment.level
  if not lvl and entry.event == "PLAYER_LEVEL_UP" and entry.args then lvl = entry.args[1] end
  row.meta:SetText(lvl and ("lvl " .. lvl) or "")
  row.meta:SetTextColor(S.rgba("fgFaint"))
end

local function buildEntryRow(parent)
  local row = CreateFrame("Button", nil, parent)
  row:SetSize(360, ROW_HEIGHT_EVENT)

  local hl = row:CreateTexture(nil, "BACKGROUND")
  hl:SetAllPoints(row)
  hl:SetColorTexture(S.rgba("accent", 0)) -- alpha animated on hover/select
  row.hl = hl

  -- Default font, not Cinzel — the icon holds decorative glyphs (✦) that
  -- Cinzel lacks (would render as tofu).
  local icon = row:CreateFontString(nil, "OVERLAY")
  icon:SetFont((GameFontNormalLarge or GameFontNormal):GetFont(), 14, "")
  icon:SetPoint("LEFT", row, "LEFT", 8, 0)
  icon:SetWidth(16)
  icon:SetJustifyH("CENTER")
  row.icon = icon

  local label = row:CreateFontString(nil, "OVERLAY")
  local fbody = (GameFontHighlight or GameFontNormal):GetFont()
  label:SetFont(fbody, 13, "")
  label:SetPoint("LEFT", icon, "RIGHT", 6, 0)
  label:SetPoint("RIGHT", row, "RIGHT", -46, 0)
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  row.label = label

  local meta = row:CreateFontString(nil, "OVERLAY")
  local fmeta = (GameFontDisable or GameFontNormalSmall):GetFont()
  meta:SetFont(fmeta, 11, "")
  meta:SetPoint("RIGHT", row, "RIGHT", -10, 0)
  row.meta = meta

  row:SetScript("OnEnter", function()
    if row._selected or not row._clickable then return end
    hl:SetColorTexture(S.rgba("accent", 0.12))
  end)
  row:SetScript("OnLeave", function()
    if row._selected then return end
    hl:SetColorTexture(S.rgba("accent", 0))
  end)
  return row
end

local function refreshList()
  if not book then return end
  currentList = collectRows()
  entryButtons = entryButtons or {}
  local scrollChild = book.scrollChild

  local y = -2
  for i, row in ipairs(currentList) do
    local rowFrame = entryButtons[i]
    if not rowFrame then
      rowFrame = buildEntryRow(scrollChild)
      entryButtons[i] = rowFrame
    end
    rowFrame:Show()
    rowFrame:ClearAllPoints()
    rowFrame:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 4, y)
    rowFrame:SetPoint("TOPRIGHT", scrollChild, "TOPRIGHT", -4, y)

    local h = ROW_HEIGHT_EVENT
    if row.kind == "bible" then
      h = ROW_HEIGHT_BIBLE; rowFrame:SetHeight(h); styleRowAsBible(rowFrame); rowFrame._clickable = true
    elseif row.kind == "chapter" then
      h = ROW_HEIGHT_HEADER; rowFrame:SetHeight(h); styleRowAsChapter(rowFrame, row); rowFrame._clickable = true
    else
      h = ROW_HEIGHT_EVENT; rowFrame:SetHeight(h); styleRowAsEvent(rowFrame, row.entry); rowFrame._clickable = true
    end

    rowFrame._selected = (i == selectedIdx)
    rowFrame.hl:SetColorTexture(S.rgba("accent", rowFrame._selected and 0.22 or 0))

    local rowIndex = i
    rowFrame:SetScript("OnClick", function()
      selectedIdx = rowIndex
      renderEntry(book.rightPage, currentList[rowIndex])
      if PlaySound and SOUNDKIT then pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_SELECT) end
      refreshList()
    end)

    y = y - h - 2
  end

  for i = #currentList + 1, #entryButtons do entryButtons[i]:Hide() end
  scrollChild:SetHeight(math.max(1, -y + 4))
  if book.updateThumb then book.updateThumb() end

  if not selectedIdx then
    local fallback
    for i, row in ipairs(currentList) do if row.kind == "event" then fallback = i; break end end
    if not fallback then
      for i, row in ipairs(currentList) do if row.kind == "bible" then fallback = i; break end end
    end
    selectedIdx = fallback
    if selectedIdx then renderEntry(book.rightPage, currentList[selectedIdx]) end
  end

  if #currentList == 0 then
    renderEntry(book.rightPage, nil)
    book.emptyHint:Show()
  else
    book.emptyHint:Hide()
  end
end

------------------------------------------------------------------------
-- Build the book frame (once, cached).
------------------------------------------------------------------------

local function buildBook()
  if book then return book end

  book = S.CreatePanel(UIParent, { fill = "bg", border = "border", borderAlpha = 0.7 })
  book:SetSize(FRAME_W, FRAME_H)
  book:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  book:SetFrameStrata("DIALOG")
  book:SetMovable(true)
  book:EnableMouse(true)
  book:RegisterForDrag("LeftButton")
  book:SetScript("OnDragStart", book.StartMoving)
  book:SetScript("OnDragStop", book.StopMovingOrSizing)
  book:Hide()

  -- Close on ESC, like a standard panel. UISpecialFrames resolves the frame
  -- by global name, so expose it under one.
  _G["AftertaleBookFrame"] = book
  table.insert(UISpecialFrames, "AftertaleBookFrame")

  -- Header band: kicker + title, with a violet rule beneath.
  local kicker = S.AddKicker(book, "Aftertale")
  kicker:SetPoint("TOPLEFT", book, "TOPLEFT", PAD + 4, -16)

  local title = S.AddHeading(book, "The Chronicle", 24)
  title:SetPoint("TOPLEFT", kicker, "BOTTOMLEFT", 0, -4)
  book.title = title

  local headRule = S.CreateRule(book, "accent", 0.4)
  headRule:SetPoint("TOPLEFT", book, "TOPLEFT", PAD, -(HEADER_H - 8))
  headRule:SetPoint("TOPRIGHT", book, "TOPRIGHT", -PAD, -(HEADER_H - 8))

  -- Close button: a styled "✕". Rendered in the DEFAULT font, not Cinzel —
  -- Cinzel has no ✕ glyph and falls back to a tofu box.
  local close = CreateFrame("Button", nil, book)
  close:SetSize(26, 26)
  close:SetPoint("TOPRIGHT", book, "TOPRIGHT", -12, -12)
  local x = close:CreateFontString(nil, "OVERLAY")
  x:SetFont((GameFontNormalLarge or GameFontNormal):GetFont(), 20, "")
  x:SetPoint("CENTER")
  x:SetText("\195\151") -- × U+00D7, Latin-1 (renders in Friz; ✕/U+2715 tofus)
  x:SetTextColor(S.rgba("fgMuted"))
  close:SetScript("OnEnter", function() x:SetTextColor(S.rgba("goldBright")) end)
  close:SetScript("OnLeave", function() x:SetTextColor(S.rgba("fgMuted")) end)
  close:SetScript("OnClick", function()
    book:Hide()
    if PlaySound and SOUNDKIT then pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_CLOSE) end
  end)

  -- Left pane: an inset panel holding the scroll list.
  local leftPage = S.CreatePanel(book, { fill = "inset", border = "border", borderAlpha = 0.45 })
  leftPage:SetSize(LEFT_PAGE.w, LEFT_PAGE.h)
  leftPage:SetPoint("TOPLEFT", book, "TOPLEFT", LEFT_PAGE.x, LEFT_PAGE.y)
  book.leftPage = leftPage

  local LIST_PAD = 12
  local scroll = CreateFrame("ScrollFrame", nil, leftPage)
  scroll:SetPoint("TOPLEFT", leftPage, "TOPLEFT", LIST_PAD, -LIST_PAD)
  scroll:SetPoint("BOTTOMRIGHT", leftPage, "BOTTOMRIGHT", -(LIST_PAD + 8), LIST_PAD)
  scroll:EnableMouseWheel(true)
  book.scroll = scroll

  local scrollChild = CreateFrame("Frame", nil, scroll)
  scrollChild:SetSize(LEFT_PAGE.w - 2 * LIST_PAD - 8, 10)
  scroll:SetScrollChild(scrollChild)
  book.scrollChild = scrollChild

  -- Thin custom scrollbar (gold thumb on a faint track).
  local track = leftPage:CreateTexture(nil, "ARTWORK")
  track:SetPoint("TOPRIGHT", leftPage, "TOPRIGHT", -6, -LIST_PAD)
  track:SetPoint("BOTTOMRIGHT", leftPage, "BOTTOMRIGHT", -6, LIST_PAD)
  track:SetWidth(3)
  track:SetColorTexture(S.rgba("goldDeep", 0.3))

  local thumb = leftPage:CreateTexture(nil, "OVERLAY")
  thumb:SetWidth(3)
  thumb:SetHeight(40)
  thumb:SetPoint("TOP", track, "TOP", 0, 0)
  thumb:SetColorTexture(S.rgba("gold", 0.8))

  local function updateThumb()
    local childH, viewH, trackH = scrollChild:GetHeight(), scroll:GetHeight(), track:GetHeight()
    if childH <= viewH + 1 then track:Hide(); thumb:Hide(); return end
    track:Show(); thumb:Show()
    local thumbH = math.max(20, trackH * (viewH / childH))
    thumb:SetHeight(thumbH)
    local maxScroll = childH - viewH
    local pos = (maxScroll > 0) and ((scroll:GetVerticalScroll() or 0) / maxScroll) or 0
    thumb:ClearAllPoints()
    thumb:SetPoint("TOP", track, "TOP", 0, -(trackH - thumbH) * pos)
  end
  book.updateThumb = updateThumb
  scroll:SetScript("OnVerticalScroll", updateThumb)
  scroll:SetScript("OnSizeChanged", updateThumb)
  scroll:SetScript("OnMouseWheel", function(self, delta)
    local s = self:GetVerticalScroll() or 0
    local maxS = math.max(0, scrollChild:GetHeight() - self:GetHeight())
    self:SetVerticalScroll(math.max(0, math.min(maxS, s - delta * 38)))
  end)

  -- Right pane (detail).
  book.rightPage = buildRightPage(book)

  -- Empty hint, centered over the left pane when there are no beats.
  local hint = S.AddMuted(book, "", 13)
  hint:SetPoint("CENTER", leftPage, "CENTER", 0, 0)
  hint:SetWidth(LEFT_PAGE.w - 48)
  hint:SetJustifyH("CENTER")
  hint:SetText((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.bookEmpty)
    or "I have nothing to note yet.\n\nGo play, hero. Take a quest. Cross a border.\nI will be watching, quill in hand.")
  hint:Hide()
  book.emptyHint = hint

  return book
end

------------------------------------------------------------------------
-- Public API
------------------------------------------------------------------------

NS.OpenBook = function()
  local b = buildBook()
  if b:IsShown() then b:Hide(); return end
  refreshList()
  b:Show()
  if PlaySound and SOUNDKIT then pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_OPEN) end
  if NS.PlaySound then NS.PlaySound("page-turn.mp3") end
end

NS.RefreshBook = function()
  if book and book:IsShown() then refreshList() end
end

-- Live updates: refresh the list if a new narrative beat lands while open.
if NS.On then
  for _, evt in ipairs({
    "QUEST_ACCEPTED", "QUEST_TURNED_IN", "PLAYER_LEVEL_UP",
    "ZONE_CHANGED_NEW_AREA", "PLAYER_DEAD", "ACHIEVEMENT_EARNED",
  }) do
    NS.On(evt, function() if book and book:IsShown() then refreshList() end end)
  end
end
