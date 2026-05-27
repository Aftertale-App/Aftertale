-- Aftertale -- categorized logger
--
-- Why this exists: as Phase 1+ adds sync, companion polling, chronicle book,
-- and more event-driven UI, we need diagnostic output that doesn't spam chat
-- by default but can be filtered on per-category for debugging. Modeled after
-- the categorized logger pattern in mantaskazlauskas/ChattyLittleNpc.
--
-- Design rules:
--   * User-facing chat output (slash command responses, character announcements,
--     load banner) stays as plain print(). The Logger is for *diagnostics* the
--     dev or a curious user would explicitly opt into via `/aftertale log`.
--   * Categories are an enum; new categories must be added to NS.Logger.Categories
--     so typos like "captuer" fail loudly during code review.
--   * The ring buffer is in-memory only -- not persisted. It's for "what just
--     happened" debugging, not long-term audit (that's what db.events is for).
--   * Toggle state IS persisted to AftertaleDB.config.logs so the
--     user's preferences survive /reload.

local ADDON_NAME, NS = ...

NS = NS or {}

local Logger = {}
NS.Logger = Logger

-- Categories. Adding a new one? Add it here AND document its purpose.
Logger.Categories = {
  capture    = "capture",     -- event capture pipeline (recordEvent, enrichment)
  sync       = "sync",        -- web-app <-> addon paragraph sync
  companion  = "companion",   -- AftertaleCompanion.lua interactions
  ui         = "ui",          -- UI module diagnostics (book, recap, dialogs)
  events     = "events",      -- raw WoW event registration / dispatch
  character  = "character",   -- character detection & onboarding
  secrets    = "secrets",     -- secret-value desecrets (WoW 12.0+ identity APIs)
  misc       = "misc",        -- catch-all; prefer a real category
}

-- Levels. Lower = chattier. Set via `/aftertale log level <name>` or programmatically.
Logger.Levels = {
  DEBUG = 1,
  INFO  = 2,
  WARN  = 3,
  ERROR = 4,
}
local LevelNames = { [1] = "DEBUG", [2] = "INFO", [3] = "WARN", [4] = "ERROR" }

-- Color codes per level for chat mirroring.
local LevelColors = {
  [1] = "|cFF888888", -- grey
  [2] = "|cFFFFFFFF", -- white
  [3] = "|cFFFFA500", -- orange
  [4] = "|cFFFF4444", -- red
}

-- Ring buffer cap. 500 entries is plenty for "what just happened" debugging
-- without ballooning memory if a category goes wild.
local RING_CAP = 500

Logger._history = {}      -- ring buffer of { ts, level, category, msg }
Logger._writeIdx = 0      -- next write position (0-based, mod RING_CAP)
Logger._count = 0         -- total entries written (for ring math + display)

-- Default config; merged into db.config.logs on first run. Keep diagnostics
-- OFF by default in chat -- players shouldn't see them. They're available
-- via `/aftertale log show` and `/aftertale log <cat> on` if curious.
local DEFAULT_CONFIG = {
  minLevel = 2,              -- INFO and above
  mirrorToChat = false,      -- when true, every accepted log also prints to chat
  categories = {             -- per-category enable flag; nil = enabled
    -- categories absent here default to true; explicit false silences them
  },
}

-- Resolve the persisted config table. Lazy-initialized so the module is safe
-- to call before ADDON_LOADED (when SVs haven't materialized yet) -- in that
-- case we hand back DEFAULT_CONFIG so a stray early log line still routes
-- to the ring buffer with sane defaults.
local function getConfig()
  if type(AftertaleDB) ~= "table" then return DEFAULT_CONFIG end
  AftertaleDB.config = AftertaleDB.config or {}
  local cfg = AftertaleDB.config
  if type(cfg.logs) ~= "table" then
    cfg.logs = {
      minLevel = DEFAULT_CONFIG.minLevel,
      mirrorToChat = DEFAULT_CONFIG.mirrorToChat,
      categories = {},
    }
  end
  if type(cfg.logs.categories) ~= "table" then cfg.logs.categories = {} end
  if type(cfg.logs.minLevel) ~= "number" then cfg.logs.minLevel = DEFAULT_CONFIG.minLevel end
  if cfg.logs.mirrorToChat == nil then cfg.logs.mirrorToChat = DEFAULT_CONFIG.mirrorToChat end
  return cfg.logs
end

local function categoryEnabled(cfg, category)
  -- Unknown categories are accepted but kept enabled by default so a typo
  -- never silently swallows a log line. Explicit false silences.
  if cfg.categories[category] == false then return false end
  return true
end

local function nowIso()
  return date("%H:%M:%S")
end

-- Core log routine. All public level helpers funnel through here.
function Logger:_log(level, category, msg)
  if type(level) ~= "number" or level < 1 or level > 4 then level = 2 end
  category = category or Logger.Categories.misc
  if type(msg) ~= "string" then msg = tostring(msg) end

  local cfg = getConfig()
  if level < cfg.minLevel then return end
  if not categoryEnabled(cfg, category) then return end

  -- Ring buffer write.
  self._writeIdx = (self._writeIdx % RING_CAP) + 1
  self._history[self._writeIdx] = {
    ts = nowIso(),
    level = level,
    category = category,
    msg = msg,
  }
  self._count = self._count + 1

  -- Chat mirror (opt-in). ERROR always mirrors regardless of the toggle --
  -- a silent error is a bug we'll never find.
  if cfg.mirrorToChat or level == Logger.Levels.ERROR then
    local color = LevelColors[level] or "|cFFFFFFFF"
    local tag = NS.CHAT_TAG or "[Aftertale]"
    if DEFAULT_CHAT_FRAME then
      DEFAULT_CHAT_FRAME:AddMessage(string.format(
        "%s %s%s|r [%s] %s",
        tag, color, LevelNames[level], category, msg
      ))
    end
  end
end

function Logger:debug(msg, category) self:_log(Logger.Levels.DEBUG, category, msg) end
function Logger:info(msg, category)  self:_log(Logger.Levels.INFO,  category, msg) end
function Logger:warn(msg, category)  self:_log(Logger.Levels.WARN,  category, msg) end
function Logger:error(msg, category) self:_log(Logger.Levels.ERROR, category, msg) end

-- Return the last N entries from the ring buffer, in chronological order.
local function iterHistory(self, n)
  local total = math.min(self._count, RING_CAP)
  n = math.min(n or total, total)
  local out = {}
  -- writeIdx points at the most-recent written slot. Walk backwards n
  -- positions, then forward to deliver chronological order.
  for i = 0, n - 1 do
    local slot = ((self._writeIdx - n + i) % RING_CAP) + 1
    -- Lua's % can yield 0..(RING_CAP-1) for negative dividends; the +1
    -- normalizes to 1..RING_CAP. Belt-and-suspenders the edge.
    if slot < 1 then slot = slot + RING_CAP end
    out[#out + 1] = self._history[slot]
  end
  return out
end

-- Print the last N entries to chat. Used by `/aftertale log show`.
function Logger:Show(n)
  local entries = iterHistory(self, n or 20)
  local tag = NS.CHAT_TAG or "[Aftertale]"
  if #entries == 0 then
    print(tag .. " no log entries yet.")
    return
  end
  print(string.format("%s last %d log entr%s (of %d total):",
    tag, #entries, (#entries == 1 and "y" or "ies"), self._count))
  for _, e in ipairs(entries) do
    if e then
      local color = LevelColors[e.level] or "|cFFFFFFFF"
      print(string.format("  [%s] %s%s|r [%s] %s",
        e.ts, color, LevelNames[e.level], e.category, e.msg))
    end
  end
end

-- Per-category enable/disable. Persists to SVs.
function Logger:SetCategory(category, enabled)
  local cfg = getConfig()
  if enabled then
    cfg.categories[category] = nil  -- nil = default enabled, saves bytes
  else
    cfg.categories[category] = false
  end
end

function Logger:IsCategoryEnabled(category)
  return categoryEnabled(getConfig(), category)
end

-- Set the minimum level by name or number. Returns the resolved level number,
-- or nil if the input was invalid.
function Logger:SetLevel(level)
  local lvl
  if type(level) == "number" then
    lvl = level
  elseif type(level) == "string" then
    lvl = Logger.Levels[string.upper(level)]
  end
  if not lvl or lvl < 1 or lvl > 4 then return nil end
  getConfig().minLevel = lvl
  return lvl
end

function Logger:GetLevel() return getConfig().minLevel end

function Logger:SetMirrorToChat(enabled)
  getConfig().mirrorToChat = not not enabled
end

function Logger:IsMirroringToChat() return getConfig().mirrorToChat end

-- Wipe the in-memory ring buffer. Doesn't touch persisted config.
function Logger:Clear()
  for i = 1, RING_CAP do self._history[i] = nil end
  self._writeIdx = 0
  self._count = 0
end

-- Summary for `/aftertale log` with no args.
function Logger:DescribeState()
  local cfg = getConfig()
  local tag = NS.CHAT_TAG or "[Aftertale]"
  print(string.format("%s logger: level=%s mirrorToChat=%s buffered=%d/%d",
    tag, LevelNames[cfg.minLevel] or "?",
    tostring(cfg.mirrorToChat), math.min(self._count, RING_CAP), RING_CAP))
  local disabled = {}
  for cat, v in pairs(cfg.categories) do
    if v == false then disabled[#disabled + 1] = cat end
  end
  if #disabled > 0 then
    table.sort(disabled)
    print("  silenced categories: " .. table.concat(disabled, ", "))
  else
    print("  all categories enabled.")
  end
  print("  use: /aftertale log <category> on|off  |  /aftertale log level <debug|info|warn|error>")
  print("       /aftertale log chat on|off  |  /aftertale log show [N]  |  /aftertale log clear")
end
