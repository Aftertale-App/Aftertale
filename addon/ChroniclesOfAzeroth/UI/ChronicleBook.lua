-- UI/ChronicleBook.lua -- the Phase 1.7 hero feature.
--
-- A leather adventure-album frame that opens when the player clicks
-- the minimap button. Left page = scrollable list of narrative events
-- (quest accepts/turn-ins, level-ups, zone changes). Right page = the
-- selected entry rendered as a polaroid pinned to paper, with the
-- narrator paragraph as caption.
--
-- Narration source priority:
--   1. db.enriched[EntryID] -- paragraphs from the web companion,
--      imported via /coa sync.
--   2. NS.Templates.Narrate(entry) -- the always-works fallback.
--
-- Visual aesthetic: black leather album, polaroid cards w/ pushpins.
-- Adapted from Peterodox's retired Azeroth Adventure Album with
-- permission. See ATTRIBUTION.md.

local ADDON_NAME, NS = ...

local FRAME_W = 798
local FRAME_H = 505

-- Leather panel from JournalElements.png — the dark book chrome.
local BG_TEXCOORD = { 0, 0.51953125, 0, 0.6572265625 }

-- Parchment.png is a 1024x2048 atlas; this crop is the clean middle of
-- the scroll body (no torn edges) so it tiles as a flat page surface.
local PAGE_TEXCOORD = { 0.18, 0.82, 0.10, 0.42 }

-- Layout inside the book frame.
--   leather margin   | left page | spine | right page | leather margin
--        30          |    360    |  22   |     356    |      30
local LEFT_PAGE  = { x =  30, y = -55, w = 360, h = 405 }
local SPINE      = { x = 388, y = -55, w =  22, h = 405 }
local RIGHT_PAGE = { x = 412, y = -55, w = 356, h = 405 }

-- Polaroid card lives INSIDE the right page with comfortable margins so
-- the torn edges of CardPaper.tga don't get clipped by the page rect.
local CARD_INSET = { left = 14, top = 8, right = 14, bottom = 14 }

local book          -- cached top-level frame
local entryButtons  -- table of left-page row buttons (pooled)
local currentList   -- table of row descriptors currently shown
local selectedIdx

local function art(rel)
  return NS.ADDON_PATH .. "\\Art\\Album\\" .. rel
end

-- Letter-spaced small-caps heading helper. Used for chapter kickers and
-- section labels so they read as "chapter headings" instead of body text.
local function formatKicker(s)
  if not s or s == "" then return "" end
  s = s:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  s = s:gsub("^%s*%-+%s*", ""):gsub("%s*%-+%s*$", "")
  s = s:gsub("^%s+", ""):gsub("%s+$", "")
  s = s:upper()
  local out = {}
  for word in s:gmatch("%S+") do
    local letters = {}
    for ch in word:gmatch(".") do table.insert(letters, ch) end
    table.insert(out, table.concat(letters, " "))
  end
  return table.concat(out, "   ")
end

------------------------------------------------------------------------
-- Helpers: collect narrative events from db.events, newest-first.
------------------------------------------------------------------------

local function zoneOf(ev)
  local resolver = NS.Templates and NS.Templates.ResolveZone
  if resolver and ev.enrichment then
    local name = resolver(ev.enrichment)
    if name then return name end
  end
  return (ev.enrichment and ev.enrichment.zoneText) or "Unknown Lands"
end

-- Returns a flat row list newest-first, composed of three row kinds:
--   { kind = "bible" }                          (only when db.bible set)
--   { kind = "chapter", index, zone, count }    (header row above a run)
--   { kind = "event",   entry, idx }
--
-- Chapter numbers are assigned oldest -> newest, so the most recent visit
-- has the highest Roman numeral. Re-entries to a zone get their own
-- chapter ("Return to Westfall" idea, even if we don't render that yet).
local function collectRows()
  local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
  if not db or not db.events then return {} end

  local oldestFirst = {}
  for i, ev in ipairs(db.events) do
    if NS.Templates.IsNarrativeEntry(ev) then
      table.insert(oldestFirst, { entry = ev, idx = i })
    end
  end
  table.sort(oldestFirst, function(a, b) return (a.entry.t or 0) < (b.entry.t or 0) end)

  -- Walk oldest -> newest, group consecutive same-zone runs into chapters.
  -- Each "chapter" carries its own ordered event list.
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

  -- Render newest-first: iterate chapters in reverse, events within each
  -- chapter also newest-first.
  local rows = {}
  if db.bible and db.bible ~= "" then
    table.insert(rows, { kind = "bible" })
  end
  for c = #chapters, 1, -1 do
    local ch = chapters[c]
    table.insert(rows, {
      kind  = "chapter",
      index = ch.index,
      zone  = ch.zone,
      count = #ch.events,
    })
    for e = #ch.events, 1, -1 do
      local item = ch.events[e]
      table.insert(rows, {
        kind  = "event",
        entry = item.entry,
        idx   = item.idx,
        chapterIndex = ch.index,
        chapterZone  = ch.zone,
      })
    end
  end
  return rows
end

local function getNarrationFor(entry)
  local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
  local enriched = db and db.enriched
  local id = NS.Templates.EntryID(entry)
  if enriched and enriched[id] then return enriched[id], true end
  local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
  local name = (char and char.identity and char.identity.name) or "the traveler"
  return NS.Templates.Narrate(entry, name), false
end

------------------------------------------------------------------------
-- Right page: polaroid card showing the selected entry's narration.
------------------------------------------------------------------------

local function buildRightPage(parent)
  -- The right page itself: a parchment-textured panel inside the leather
  -- frame. The polaroid card lives INSIDE this with comfortable margins.
  local page = CreateFrame("Frame", nil, parent)
  page:SetSize(RIGHT_PAGE.w, RIGHT_PAGE.h)
  page:SetPoint("TOPLEFT", parent, "TOPLEFT", RIGHT_PAGE.x, RIGHT_PAGE.y)

  local parchment = page:CreateTexture(nil, "BACKGROUND")
  parchment:SetTexture(NS.ADDON_PATH .. "\\Art\\Parchment.png")
  parchment:SetTexCoord(unpack(PAGE_TEXCOORD))
  parchment:SetAllPoints(page)

  -- The polaroid card -- inset so its torn edges aren't clipped.
  local card = CreateFrame("Frame", nil, page)
  card:SetPoint("TOPLEFT",     page, "TOPLEFT",      CARD_INSET.left,  -CARD_INSET.top)
  card:SetPoint("BOTTOMRIGHT", page, "BOTTOMRIGHT", -CARD_INSET.right,  CARD_INSET.bottom)
  page.card = card

  local paper = card:CreateTexture(nil, "BACKGROUND")
  paper:SetTexture(art("CardPaper.tga"))
  paper:SetAllPoints(card)
  page.paper = paper

  -- Pin centered at the top, fully INSIDE the polaroid (was floating
  -- outside in 0.5.1 -- see Phase 1.8 screenshot).
  local pin = card:CreateTexture(nil, "OVERLAY")
  pin:SetSize(38, 38)
  pin:SetPoint("TOP", card, "TOP", 0, -14)
  page.pin = pin

  -- Chapter kicker: small letter-spaced caps under the pin.
  local chapter = card:CreateFontString(nil, "OVERLAY")
  chapter:SetFont(GameFontNormalLarge:GetFont(), 11, "")
  chapter:SetPoint("TOP", card, "TOP", 0, -56)
  chapter:SetWidth(RIGHT_PAGE.w - CARD_INSET.left - CARD_INSET.right - 40)
  chapter:SetJustifyH("CENTER")
  chapter:SetTextColor(0.45, 0.30, 0.16, 1)
  page.chapter = chapter

  -- Title for the entry (quest name / level / zone / etc).
  local title = card:CreateFontString(nil, "OVERLAY")
  title:SetFont(GameFontNormalLarge:GetFont(), 16, "")
  title:SetPoint("TOP", chapter, "BOTTOM", 0, -6)
  title:SetWidth(RIGHT_PAGE.w - CARD_INSET.left - CARD_INSET.right - 40)
  title:SetJustifyH("CENTER")
  title:SetTextColor(0.18, 0.10, 0.04, 1)
  page.title = title

  -- Narration body. Anchored to a SAFE interior so it never crashes the
  -- torn edges of the polaroid.
  local body = card:CreateFontString(nil, "OVERLAY")
  body:SetFont(GameFontNormalLarge:GetFont(), 13, "")
  body:SetPoint("TOPLEFT",     card, "TOPLEFT",      30, -110)
  body:SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT", -30,  38)
  body:SetJustifyH("LEFT")
  body:SetJustifyV("TOP")
  body:SetSpacing(4)
  body:SetTextColor(0.20, 0.12, 0.04, 1)
  body:SetWordWrap(true)
  page.body = body

  -- Footer: zone / timestamp / source badge. Lives at the bottom of the
  -- card, well inside the torn edge.
  local footer = card:CreateFontString(nil, "OVERLAY")
  footer:SetFont(GameFontNormalSmall:GetFont(), 11, "")
  footer:SetPoint("BOTTOM", card, "BOTTOM", 0, 16)
  footer:SetWidth(RIGHT_PAGE.w - CARD_INSET.left - CARD_INSET.right - 50)
  footer:SetJustifyH("CENTER")
  footer:SetTextColor(0.45, 0.30, 0.16, 1)
  page.footer = footer

  -- Empty state
  local empty = card:CreateFontString(nil, "OVERLAY")
  empty:SetFont(GameFontNormalSmall:GetFont(), 11, "")
  empty:SetPoint("CENTER", card, "CENTER", 0, 0)
  empty:SetWidth(RIGHT_PAGE.w - CARD_INSET.left - CARD_INSET.right - 60)
  empty:SetJustifyH("CENTER")
  empty:SetTextColor(0.45, 0.30, 0.16, 1)
  empty:SetText("Select a chapter from the list.")
  page.empty = empty

  return page
end

local function renderEntry(page, row)
  if not row or not row.kind then
    page.chapter:SetText("")
    page.title:SetText("")
    page.body:SetText("")
    page.footer:SetText("")
    if page.pin then page.pin:SetTexture(nil) end
    page.empty:Show()
    return
  end
  page.empty:Hide()

  if row.kind == "bible" then
    local db = NS.GetDB and NS.GetDB() or ChroniclesOfAzerothDB
    local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
    local name = (char and char.identity and char.identity.name) or "the traveler"
    local raceCls
    if char and char.identity then
      local r = char.identity.race or ""
      local c = char.identity.class or ""
      raceCls = (r .. " " .. c):gsub("^%s+", ""):gsub("%s+$", "")
    end
    page.pin:SetTexture(art("Pin1.tga"))
    page.chapter:SetText(formatKicker("Title Page"))
    page.title:SetText("The Chronicle of " .. name)
    local body = db.bible or ""
    if body == "" then
      body = "No bible yet. Roll your hero in the web companion and use /coa sync to fill this page."
    end
    page.body:SetText(body)
    page.footer:SetText(raceCls and raceCls ~= "" and raceCls or "")
    return
  end

  if row.kind == "chapter" then
    page.pin:SetTexture(art("Pin2.tga"))
    page.chapter:SetText(formatKicker("Chapter " .. (row.index or "")))
    page.title:SetText(row.zone or "Unknown Lands")
    page.body:SetText(string.format(
      "This chapter holds %d entr%s from %s.\n\nSelect an entry from the list to read it.",
      row.count, row.count == 1 and "y" or "ies", row.zone or "an unknown place"))
    page.footer:SetText("")
    return
  end

  local entry = row.entry
  local pinStyle = ((NS.Templates.EntryID(entry):byte(1) or 0) % 3) + 1
  page.pin:SetTexture(art("Pin" .. pinStyle .. ".tga"))

  local enr = entry.enrichment or {}
  local args = entry.args or {}
  local title
  if entry.event == "QUEST_ACCEPTED" or entry.event == "QUEST_TURNED_IN" then
    title = enr.questTitle
        or (args[2] and ("Quest #" .. tostring(args[2])))
        or "An unnamed quest"
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

  local kickerText = "A Chapter in the Chronicle"
  if row.chapterIndex then
    kickerText = "Chapter " .. row.chapterIndex .. "   " .. (row.chapterZone or "")
  end
  page.chapter:SetText(formatKicker(kickerText))

  local narration, isEnriched = getNarrationFor(entry)
  page.body:SetText(narration)

  local zone = enr.zoneText or "the road"
  local ts   = entry.ts or ""
  local lvl  = (enr.level or (entry.event == "PLAYER_LEVEL_UP" and args[1])) or nil
  lvl = lvl and ("level " .. lvl) or ""
  local badge = isEnriched and "  |cFFB8860B(enriched)|r" or ""
  local parts = { zone }
  if lvl ~= "" then table.insert(parts, lvl) end
  if ts  ~= "" then table.insert(parts, ts) end
  page.footer:SetText(table.concat(parts, "   -   ") .. badge)
end

------------------------------------------------------------------------
-- Left page: scrollable entry list. Each row is a simple button with
-- the preview line + relative date.
------------------------------------------------------------------------

local ROW_HEIGHT_EVENT   = 28
local ROW_HEIGHT_HEADER  = 22
local ROW_HEIGHT_BIBLE   = 36

local function styleRowAsBible(row)
  row.icon:SetText("✦")
  row.icon:SetTextColor(0.55, 0.32, 0.08, 1)
  row.label:SetText(formatKicker("The Hero's Bible"))
  row.label:SetFont(GameFontNormalLarge:GetFont(), 11, "")
  row.label:SetTextColor(0.18, 0.10, 0.04, 1)
  row.meta:SetText("title page")
  row.meta:SetTextColor(0.45, 0.30, 0.16, 0.9)
  row.divider:Hide()
end

local function styleRowAsChapter(row, chapter)
  row.icon:SetText("")
  -- Roman numeral + zone, letter-spaced so it reads like a real chapter
  -- heading instead of body text.
  local heading = "Chapter " .. (chapter.index or "") .. "   " .. (chapter.zone or "")
  row.label:SetText(formatKicker(heading))
  row.label:SetFont(GameFontNormalLarge:GetFont(), 10, "")
  row.label:SetTextColor(0.30, 0.18, 0.06, 1)
  row.meta:SetText(tostring(chapter.count))
  row.meta:SetTextColor(0.45, 0.30, 0.16, 0.85)
  row.divider:Show()
end

local function styleRowAsEvent(row, entry, isSelected)
  row.icon:SetText("")
  local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
  local name = (char and char.identity and char.identity.name) or "Traveler"
  row.label:SetFont(GameFontNormalLarge:GetFont(), 12, "")
  row.label:SetText(NS.Templates.Preview(entry, name))
  row.label:SetTextColor(0.18, 0.10, 0.04, 1)
  local lvl = entry.enrichment and entry.enrichment.level
  if not lvl and entry.event == "PLAYER_LEVEL_UP" and entry.args then
    lvl = entry.args[1]
  end
  row.meta:SetText(lvl and ("lvl " .. lvl) or "")
  row.meta:SetTextColor(0.45, 0.30, 0.16, 0.9)
  row.divider:Hide()
end

local function buildEntryRow(parent)
  local row = CreateFrame("Button", nil, parent)
  row:SetSize(360, ROW_HEIGHT_EVENT)

  local hl = row:CreateTexture(nil, "BACKGROUND")
  hl:SetAllPoints(row)
  hl:SetColorTexture(0.55, 0.38, 0.16, 0)
  row.hl = hl

  local icon = row:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  icon:SetPoint("LEFT", row, "LEFT", 6, 0)
  icon:SetWidth(18)
  icon:SetJustifyH("CENTER")
  row.icon = icon

  local label = row:CreateFontString(nil, "OVERLAY")
  label:SetFont(GameFontNormalLarge:GetFont(), 12, "")
  label:SetPoint("LEFT", icon, "RIGHT", 4, 0)
  label:SetPoint("RIGHT", row, "RIGHT", -52, 0)
  label:SetJustifyH("LEFT")
  label:SetWordWrap(false)
  label:SetTextColor(0.18, 0.10, 0.04, 1)
  row.label = label

  local meta = row:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  meta:SetPoint("RIGHT", row, "RIGHT", -8, 0)
  meta:SetTextColor(0.45, 0.30, 0.16, 0.9)
  row.meta = meta

  local divider = row:CreateTexture(nil, "ARTWORK")
  divider:SetColorTexture(0.40, 0.26, 0.10, 0.50)
  divider:SetPoint("BOTTOMLEFT",  row, "BOTTOMLEFT",   16, 1)
  divider:SetPoint("BOTTOMRIGHT", row, "BOTTOMRIGHT", -16, 1)
  divider:SetHeight(1)
  divider:Hide()
  row.divider = divider

  row:SetScript("OnEnter", function()
    if row._selected then return end
    if row._clickable then hl:SetColorTexture(0.55, 0.38, 0.16, 0.18) end
  end)
  row:SetScript("OnLeave", function()
    if row._selected then return end
    hl:SetColorTexture(0.55, 0.38, 0.16, 0)
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
    rowFrame:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 6, y)
    rowFrame:SetPoint("TOPRIGHT", scrollChild, "TOPRIGHT", -6, y)

    local h = ROW_HEIGHT_EVENT
    if row.kind == "bible" then
      h = ROW_HEIGHT_BIBLE
      rowFrame:SetHeight(h)
      styleRowAsBible(rowFrame)
      rowFrame._clickable = true
    elseif row.kind == "chapter" then
      h = ROW_HEIGHT_HEADER
      rowFrame:SetHeight(h)
      styleRowAsChapter(rowFrame, row)
      rowFrame._clickable = true   -- clicking a chapter header shows its summary
    else
      h = ROW_HEIGHT_EVENT
      rowFrame:SetHeight(h)
      styleRowAsEvent(rowFrame, row.entry, i == selectedIdx)
      rowFrame._clickable = true
    end

    rowFrame._selected = (i == selectedIdx)
    rowFrame.hl:SetColorTexture(0.55, 0.38, 0.16, rowFrame._selected and 0.30 or 0)

    local rowIndex = i
    rowFrame:SetScript("OnClick", function()
      selectedIdx = rowIndex
      renderEntry(book.rightPage, currentList[rowIndex])
      if PlaySound and SOUNDKIT then
        pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_SELECT)
      end
      refreshList()
    end)

    y = y - h - 2
  end

  for i = #currentList + 1, #entryButtons do
    entryButtons[i]:Hide()
  end

  scrollChild:SetHeight(math.max(1, -y + 4))

  -- Update custom scrollbar thumb after list rebuild.
  if book.updateThumb then book.updateThumb() end

  -- Default selection. If no selection yet, prefer the first event row
  -- (the most recent entry); fall back to bible if no events exist.
  if not selectedIdx then
    local fallback
    for i, row in ipairs(currentList) do
      if row.kind == "event" then fallback = i; break end
    end
    if not fallback then
      for i, row in ipairs(currentList) do
        if row.kind == "bible" then fallback = i; break end
      end
    end
    selectedIdx = fallback
    if selectedIdx then
      renderEntry(book.rightPage, currentList[selectedIdx])
    end
  end

  -- Empty hint when there's literally nothing to show (no bible, no events).
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

  book = CreateFrame("Frame", "ChroniclesBookFrame", UIParent)
  book:SetSize(FRAME_W, FRAME_H)
  book:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  book:SetFrameStrata("DIALOG")
  book:SetMovable(true)
  book:EnableMouse(true)
  book:RegisterForDrag("LeftButton")
  book:SetScript("OnDragStart", book.StartMoving)
  book:SetScript("OnDragStop", book.StopMovingOrSizing)
  book:Hide()

  -- Leather background from AAA's JournalElements atlas. This is the
  -- outer chrome (frame border + spine area).
  local bg = book:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints(book)
  bg:SetTexture(art("JournalElements.png"))
  bg:SetTexCoord(unpack(BG_TEXCOORD))

  ----------------------------------------------------------------------
  -- Left page parchment
  ----------------------------------------------------------------------
  local leftPage = CreateFrame("Frame", nil, book)
  leftPage:SetSize(LEFT_PAGE.w, LEFT_PAGE.h)
  leftPage:SetPoint("TOPLEFT", book, "TOPLEFT", LEFT_PAGE.x, LEFT_PAGE.y)
  do
    local p = leftPage:CreateTexture(nil, "BACKGROUND")
    p:SetTexture(NS.ADDON_PATH .. "\\Art\\Parchment.png")
    p:SetTexCoord(unpack(PAGE_TEXCOORD))
    p:SetAllPoints(leftPage)
  end
  book.leftPage = leftPage

  ----------------------------------------------------------------------
  -- Spine: a dark vertical strip between the two pages.
  ----------------------------------------------------------------------
  do
    local spine = book:CreateTexture(nil, "ARTWORK")
    spine:SetPoint("TOPLEFT",     book, "TOPLEFT", SPINE.x, SPINE.y)
    spine:SetSize(SPINE.w, SPINE.h)
    spine:SetColorTexture(0.06, 0.04, 0.02, 0.85)

    -- Subtle highlight stripe down the centre of the spine.
    local highlight = book:CreateTexture(nil, "OVERLAY")
    highlight:SetPoint("TOPLEFT",     book, "TOPLEFT", SPINE.x + SPINE.w/2 - 1, SPINE.y)
    highlight:SetSize(2, SPINE.h)
    highlight:SetColorTexture(0.30, 0.20, 0.10, 0.6)
  end

  ----------------------------------------------------------------------
  -- Title: across the top leather, above the pages.
  ----------------------------------------------------------------------
  local title = book:CreateFontString(nil, "OVERLAY")
  title:SetFont(GameFontNormalLarge:GetFont(), 22, "")
  title:SetPoint("TOP", book, "TOP", 0, -18)
  title:SetTextColor(0.92, 0.78, 0.46, 1)
  title:SetShadowColor(0, 0, 0, 0.7)
  title:SetShadowOffset(1, -1)
  title:SetText("The Chronicle")
  book.title = title

  ----------------------------------------------------------------------
  -- Close button (top-right of frame).
  ----------------------------------------------------------------------
  local close = CreateFrame("Button", nil, book)
  close:SetSize(22, 22)
  close:SetPoint("TOPRIGHT", book, "TOPRIGHT", -16, -16)
  local closeNormal = close:CreateTexture(nil, "ARTWORK")
  closeNormal:SetAllPoints(close)
  closeNormal:SetTexture(art("CloseButton.tga"))
  close:SetNormalTexture(closeNormal)
  local closeHL = close:CreateTexture(nil, "HIGHLIGHT")
  closeHL:SetAllPoints(close)
  closeHL:SetTexture(art("CloseButton-Highlight.tga"))
  closeHL:SetBlendMode("ADD")
  close:SetHighlightTexture(closeHL)
  close:SetScript("OnClick", function()
    book:Hide()
    if PlaySound and SOUNDKIT then
      pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_CLOSE)
    end
  end)

  ----------------------------------------------------------------------
  -- Left page scroll area. Plain ScrollFrame + mousewheel + thin
  -- custom thumb (UIPanelScrollFrameTemplate's chrome looks awful
  -- against parchment -- bug from 0.5.1 screenshot).
  ----------------------------------------------------------------------
  local LIST_PAD_X = 18
  local LIST_PAD_Y = 16
  local scroll = CreateFrame("ScrollFrame", nil, leftPage)
  scroll:SetPoint("TOPLEFT",     leftPage, "TOPLEFT",      LIST_PAD_X,        -LIST_PAD_Y)
  scroll:SetPoint("BOTTOMRIGHT", leftPage, "BOTTOMRIGHT", -(LIST_PAD_X + 10),  LIST_PAD_Y)
  scroll:EnableMouseWheel(true)
  book.scroll = scroll

  local scrollChild = CreateFrame("Frame", nil, scroll)
  scrollChild:SetSize(LEFT_PAGE.w - 2 * LIST_PAD_X - 10, 10)
  scroll:SetScrollChild(scrollChild)
  book.scrollChild = scrollChild

  -- Custom thin scrollbar track + thumb. Hidden when content fits.
  local track = leftPage:CreateTexture(nil, "ARTWORK")
  track:SetPoint("TOPRIGHT",    leftPage, "TOPRIGHT",    -8,  -LIST_PAD_Y)
  track:SetPoint("BOTTOMRIGHT", leftPage, "BOTTOMRIGHT", -8,   LIST_PAD_Y)
  track:SetWidth(3)
  track:SetColorTexture(0.30, 0.20, 0.10, 0.35)

  local thumb = leftPage:CreateTexture(nil, "OVERLAY")
  thumb:SetPoint("TOP", track, "TOP", 0, 0)
  thumb:SetWidth(5)
  thumb:SetHeight(40)
  thumb:SetPoint("LEFT", track, "LEFT", -1, 0)
  thumb:SetColorTexture(0.55, 0.38, 0.18, 0.85)

  local function updateThumb()
    local childH = scrollChild:GetHeight()
    local viewH  = scroll:GetHeight()
    local trackH = track:GetHeight()
    if childH <= viewH + 1 then
      track:Hide(); thumb:Hide()
      return
    end
    track:Show(); thumb:Show()
    local thumbH = math.max(20, trackH * (viewH / childH))
    thumb:SetHeight(thumbH)
    local maxScroll = childH - viewH
    local s = scroll:GetVerticalScroll() or 0
    local pos = (maxScroll > 0) and (s / maxScroll) or 0
    thumb:ClearAllPoints()
    thumb:SetPoint("LEFT", track, "LEFT", -1, 0)
    thumb:SetPoint("TOP",  track, "TOP",   0, -(trackH - thumbH) * pos)
  end
  book.updateThumb = updateThumb

  scroll:SetScript("OnVerticalScroll", function(self, _) updateThumb() end)
  scroll:SetScript("OnSizeChanged",    function(self, _, _) updateThumb() end)
  scroll:SetScript("OnMouseWheel", function(self, delta)
    local step = 36
    local s = self:GetVerticalScroll() or 0
    local maxS = math.max(0, scrollChild:GetHeight() - self:GetHeight())
    s = math.max(0, math.min(maxS, s - delta * step))
    self:SetVerticalScroll(s)
  end)

  ----------------------------------------------------------------------
  -- Right page (parchment + polaroid). buildRightPage handles the rest.
  ----------------------------------------------------------------------
  book.rightPage = buildRightPage(book)

  ----------------------------------------------------------------------
  -- Empty hint when no narrative events captured yet.
  ----------------------------------------------------------------------
  local hint = book:CreateFontString(nil, "OVERLAY")
  hint:SetFont(GameFontNormalLarge:GetFont(), 13, "")
  hint:SetPoint("CENTER", leftPage, "CENTER", 0, 0)
  hint:SetWidth(LEFT_PAGE.w - 60)
  hint:SetJustifyH("CENTER")
  hint:SetSpacing(4)
  hint:SetTextColor(0.30, 0.20, 0.10, 1)
  hint:SetText("No chapters yet.\n\nGo play. Accept a quest, level up, see a new place.\nThe Chronicle writes itself.")
  hint:Hide()
  book.emptyHint = hint

  -- Footer / attribution -- tiny, dim, on the leather bottom strip.
  local attr = book:CreateFontString(nil, "OVERLAY")
  attr:SetFont(GameFontNormalSmall:GetFont(), 8, "")
  attr:SetPoint("BOTTOM", book, "BOTTOM", 0, 6)
  attr:SetTextColor(0.55, 0.42, 0.22, 0.85)
  attr:SetText("Album chrome adapted from Azeroth Adventure Album by Peterodox.")

  return book
end

------------------------------------------------------------------------
-- Public API
------------------------------------------------------------------------

NS.OpenBook = function()
  local b = buildBook()
  if b:IsShown() then
    b:Hide()
    return
  end
  refreshList()
  b:Show()
  if PlaySound and SOUNDKIT then
    pcall(PlaySound, SOUNDKIT.IG_QUEST_LIST_OPEN)
  end
  NS.PlaySound("page-turn.mp3")
end

NS.RefreshBook = function()
  if book and book:IsShown() then refreshList() end
end

-- Live updates: when a new narrative event lands, refresh the list if
-- the book happens to be open. (Doesn't auto-open; that would be rude.)
if NS.On then
  for _, evt in ipairs({
    "QUEST_ACCEPTED",
    "QUEST_TURNED_IN",
    "PLAYER_LEVEL_UP",
    "ZONE_CHANGED_NEW_AREA",
    "PLAYER_DEAD",
    "ACHIEVEMENT_EARNED",
  }) do
    NS.On(evt, function() if book and book:IsShown() then refreshList() end end)
  end
end
