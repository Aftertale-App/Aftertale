-- Lore/Scribe.lua -- the scribe persona, in one place.
--
-- Aftertale has two narrative voices in-game:
--
--   1. The Scribe -- in-character watcher who takes notes during play.
--      Speaks plainly. Never claims authorship. Always points the player
--      toward the chronicler when a deed deserves more than a note.
--
--   2. The Chronicler -- the LLM in the web companion that turns the
--      scribe's notes into prose. The chronicler does not speak in-game;
--      its voice arrives only as enriched paragraphs round-tripped from
--      aftertale.gg.
--
-- This file holds the Scribe's copy + brand colors. UI files pull from
-- here so voice iteration doesn't require hunting through files.
--
-- Brand palette mirrors the web app (src/index.css :root tokens):
--   --gold        #d4a373  -> 0xD4A373  (primary)
--   --gold-bright #f0c896  -> 0xF0C896  (emphasis)
--   --magic       #b89eff  -> 0xB89EFF  (arcane / scribe accent)
--   --fg-muted    #a89c80  -> 0xA89C80  (secondary text)

local ADDON_NAME, NS = ...
NS.Scribe = NS.Scribe or {}
local S = NS.Scribe

------------------------------------------------------------------------
-- Color escapes
--
-- WoW chat-frame coloring uses "|cAARRGGBB...|r" escape sequences.
-- These helpers wrap a string in the brand color so callers stay readable.
-- Texture/font color (not strings) uses S.RGB.* below.
------------------------------------------------------------------------

S.Color = {
  gold       = function(s) return "|cFFD4A373" .. tostring(s) .. "|r" end,
  goldBright = function(s) return "|cFFF0C896" .. tostring(s) .. "|r" end,
  magic      = function(s) return "|cFFB89EFF" .. tostring(s) .. "|r" end,
  muted      = function(s) return "|cFFA89C80" .. tostring(s) .. "|r" end,
}

-- Numeric RGB tuples for SetTextColor / SetColorTexture (0..1 range).
S.RGB = {
  gold        = { 0.831, 0.639, 0.451 },  -- #d4a373
  goldBright  = { 0.941, 0.784, 0.588 },  -- #f0c896
  magic       = { 0.722, 0.620, 1.000 },  -- #b89eff
  fgMuted     = { 0.659, 0.612, 0.502 },  -- #a89c80
  ink         = { 0.180, 0.100, 0.040 },  -- existing body ink
  inkSoft     = { 0.300, 0.180, 0.060 },  -- existing dim body
  fgFaint     = { 0.420, 0.370, 0.290 },  -- footer text
}

-- Brand chat tag. Prepend to chat-frame messages so the player can pick
-- Aftertale out of the noise.
S.Tag = function()
  return S.Color.gold("[Aftertale]")
end

------------------------------------------------------------------------
-- Voice copy strings
--
-- The Scribe speaks in first person. Short sentences. No exclamation
-- points. The voice is patient, observational, slightly archaic.
-- "I have noted", not "Got it!".
------------------------------------------------------------------------

S.Voice = {
  ----------------------------------------------------------------------
  -- Chronicle Book copy
  ----------------------------------------------------------------------

  -- Right-page kicker shown above an unenriched event note. Letter-
  -- spaced caps -- matches existing formatKicker() treatment.
  noteKicker      = "Scribe's Note",

  -- Right-page footer under an unenriched event note. Tells the player
  -- where to go to render this beat into prose.
  noteFooter      = "The chronicler awaits at aftertale.gg.",

  -- Right-page empty card text. Shown when no row is selected yet.
  rightPageEmpty  = "Choose a beat from the journal to read it.",

  -- Left-page empty hint. Shown when no narrative events captured yet.
  bookEmpty       = "I have nothing to note yet.\n\nGo play. Take a quest. Cross a border. Fall in battle.\nI will be watching, quill in hand.",

  -- Bible page body when no bible has been imported.
  bibleEmpty      = "No bible yet. Roll your hero at aftertale.gg, then drop the AftertaleRestore.lua file the chronicler hands you into your SavedVariables folder. I will read it on my next watch.",

  -- Bible page kicker. Replaces the generic "TITLE PAGE".
  bibleKicker     = "The Hero's Truth",

  -- Right-page chapter-summary copy (shown when a chapter header is
  -- selected, before the player picks a specific event).
  chapterSummary  = function(count, zone)
    local plural = count == 1 and "beat" or "beats"
    return string.format("This chapter holds %d %s from %s.\n\nChoose one from the journal to read it.",
      count, plural, zone or "an unknown place")
  end,

  ----------------------------------------------------------------------
  -- Scribe's-note field labels (for unenriched event rendering).
  -- These are letter-spaced and right-aligned in the note card.
  ----------------------------------------------------------------------

  labelPlace      = "Place",
  labelTime       = "Time",
  labelLevel      = "Level",
  labelDeed       = "Deed",

  ----------------------------------------------------------------------
  -- Preview-line fallbacks for the left-page list when enrichment is
  -- missing. The scribe noted the *kind* of thing without knowing the
  -- name -- so the line stays honest instead of saying "a quest".
  ----------------------------------------------------------------------

  previewFallback = {
    QUEST_ACCEPTED  = "Took on a task from a local hand",
    QUEST_TURNED_IN = "Made good on a task",
    ZONE_CHANGED_NEW_AREA = "Crossed into new ground",
    PLAYER_DEAD     = "Fell in the field",
    ACHIEVEMENT_EARNED = "Earned a quiet honor",
    ENCOUNTER_END   = "Saw a hard fight to its end",
    BOSS_KILL       = "Put down something that did not want to fall",
    LOOT_OPENED     = "Pocketed something worth keeping",
  },

  ----------------------------------------------------------------------
  -- Chat-frame messages (reserved for the signals PR -- PR B).
  -- Listed here so the persona stays consolidated; the signals PR will
  -- wire them into the appropriate event handlers.
  ----------------------------------------------------------------------

  welcome         = "A scribe has taken up watch at your side. I will note your deeds as they pass -- open my journal anytime with /at.",
  logoutNudge     = "My notes are set down. Visit aftertale.gg to ink today's pages, or sleep -- I will keep watch.",
  newChapterReady = "Today's pages are inked. Type /at to read.",
  noted           = function(deed) return "Noted: " .. deed .. "." end,
}

------------------------------------------------------------------------
-- Format helpers
------------------------------------------------------------------------

-- Letter-spaced caps. Shared with ChronicleBook.lua's formatKicker but
-- exposed here so future surfaces (toasts, settings) can use the same
-- treatment without duplicating the code.
function S.Kicker(s)
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

-- Stable pick from a small pool. Same hash style used elsewhere in the
-- addon: ts + event yields a deterministic pick so re-renders don't
-- shuffle the phrasing on the player.
function S.PickFallback(eventName, entry)
  local pool = S.Voice.previewFallback[eventName]
  if not pool then return nil end
  if type(pool) == "string" then return pool end
  -- (room to grow this into per-event pools later -- today they're strings)
  return pool
end
