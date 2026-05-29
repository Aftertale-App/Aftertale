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

  return page
end

local function clearDetail(page)
  page.kicker:SetText("")
  page.title:SetText("")
  page.body:SetText("")
  page.footer:SetText("")
  page.rule:Hide()
end

local function renderEntry(page, row)
  if not row or not row.kind then
    clearDetail(page)
    if NS.Scribe and NS.Scribe.Voice then page.empty:SetText(NS.Scribe.Voice.rightPageEmpty) end
    page.empty:Show()
    return
  end
  page.empty:Hide()
  page.rule:Show()
  -- default kicker tint is violet (AddKicker sets it); chapter/bible override.
  page.kicker:SetTextColor(S.rgba("accent"))

  if row.kind == "bible" then
    local db = NS.GetDB and NS.GetDB() or AftertaleDB
    local char = NS.GetCurrentCharacter and select(1, NS.GetCurrentCharacter()) or nil
    local name = (char and char.identity and char.identity.name) or "the traveler"
    local raceCls
    if char and char.identity then
      raceCls = ((char.identity.race or "") .. " " .. (char.identity.class or "")):gsub("^%s+", ""):gsub("%s+$", "")
    end
    page.kicker:SetText(formatKicker((NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.bibleKicker) or "The Hero's Truth"))
    page.kicker:SetTextColor(S.rgba("goldDeep"))
    page.title:SetText("The Chronicle of " .. name)
    local body = db.bible or ""
    if body == "" then
      body = (NS.Scribe and NS.Scribe.Voice and NS.Scribe.Voice.bibleEmpty)
        or "No bible yet. Roll your hero at aftertale.gg, then drop the AftertaleRestore.lua file into your SavedVariables folder."
    end
    page.body:SetText(body)
    page.footer:SetText(raceCls and raceCls ~= "" and raceCls or "")
    return
  end

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
  row.icon:SetText("✦")
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

  local icon = row:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(icon, 12, "")
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

  -- Header band: kicker + title, with a violet rule beneath.
  local kicker = S.AddKicker(book, "Aftertale")
  kicker:SetPoint("TOPLEFT", book, "TOPLEFT", PAD + 4, -16)

  local title = S.AddHeading(book, "The Chronicle", 24)
  title:SetPoint("TOPLEFT", kicker, "BOTTOMLEFT", 0, -4)
  book.title = title

  local headRule = S.CreateRule(book, "accent", 0.4)
  headRule:SetPoint("TOPLEFT", book, "TOPLEFT", PAD, -(HEADER_H - 8))
  headRule:SetPoint("TOPRIGHT", book, "TOPRIGHT", -PAD, -(HEADER_H - 8))

  -- Close button: a styled "✕" (no more Blizzard texture).
  local close = CreateFrame("Button", nil, book)
  close:SetSize(26, 26)
  close:SetPoint("TOPRIGHT", book, "TOPRIGHT", -12, -12)
  local x = close:CreateFontString(nil, "OVERLAY")
  S.UseDisplayFont(x, 16, "")
  x:SetPoint("CENTER")
  x:SetText("✕")
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
