# Changelog

All notable changes to Chronicles of Azeroth. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pre-1.0, every
change is technically breaking — we'll start being strict about SemVer when
Phase 1 ships.

## [Unreleased] — Phase 0 in progress

### Added

- **Project scaffold** (Vite 6 + React 19 + TypeScript, manual scaffold to
  bypass a PowerShell TTY-prompt hang in `npm create vite@latest`).
- **Provider abstraction** (`LLMProvider` interface in `src/types.ts`) so
  the rest of the app never imports a vendor SDK directly.
- **`GeminiProvider`** using `@google/genai`. Records usage internally and
  includes `thoughtsTokenCount` in `outputTokens` for accurate cost.
- **`AnthropicProvider`** using `@anthropic-ai/sdk` (with
  `dangerouslyAllowBrowser: true` for Phase 0 local-only use). Reads
  `cache_read_input_tokens` for cache-aware costing.
- **Pricing table** (`src/pricing.ts`) as the single source of truth for
  per-model prices and free-tier rate hints.
- **Spend tracker** (`src/lib/spendTracker.ts`) — localStorage backend,
  day-keyed records (`coa.spend.YYYY-MM-DD`), 90-day rolling retention,
  averages by `task::model`, CSV export.
- **`SpendBar` component** mounted in `App.tsx` — always-visible cost
  header, click to expand averages table, CSV export.
- **`SmokeTest` component** with model dropdown (5 choices: Gemini
  free/paid Flash, Gemini Pro, Claude Haiku, Claude Sonnet) and live
  response display.
- **`docs/`** folder with ARCHITECTURE, COST-STRATEGY, PROVIDERS,
  DEVELOPMENT, and ROADMAP.
- **CHANGELOG.md** (this file).

### Fixed

- **In-tab spend bar refresh.** The native `storage` event only fires on
  OTHER tabs, so the spend bar wasn't updating after calls in the same
  tab. Fixed by dispatching a `coa:usage-updated` CustomEvent on the
  window inside `recordUsage()`, with the SpendBar listening for both
  the native event (for multi-tab) and the custom one (for same-tab).
- **Underreported Gemini cost.** We were only counting
  `candidatesTokenCount` toward `outputTokens`, ignoring
  `thoughtsTokenCount`. Google bills thoughts at the output rate, so
  costs were silently understated on thinking-mode models. Now
  `outputTokens = candidatesTokenCount + thoughtsTokenCount`.

### Changed

- **Gemini models pinned** from `gemini-flash-latest` / `gemini-pro-latest`
  to `gemini-2.5-flash` / `gemini-2.5-pro`. The `*-latest` aliases point
  to Gemini 3.x models which have **mandatory thinking** that silently
  ignores `thinkingBudget: 0` and burns 1000+ extra output tokens per
  call. `gemini-2.5-*` is the last family where thinking can be cleanly
  disabled. See [docs/PROVIDERS.md](./docs/PROVIDERS.md#gemini-thinking-mode-trap).
- **Default `maxOutputTokens`** raised from 200 → 2048 so we always have
  headroom even if a future model re-introduces mandatory thinking.
- **Dev server port** pinned to **5180** (`strictPort: true`) to avoid
  colliding with sand-miner on 5173.

### Project meta

- Renamed from "Azeroth Chronicle" to **Chronicles of Azeroth**.
- Repo lives at `C:\Users\snobl\Source\chronicles-of-azeroth`.
- Initial commit on `main`.

---

## Lessons learned (running log)

These are sharp edges discovered during Phase 0 that future-us shouldn't
have to rediscover.

1. **Gemini's pricing page and API model IDs don't match.** Always verify
   model availability with a REST `models?key=...` call.
2. **Newer Gemini Flash models have mandatory thinking.** Even with
   `thinkingConfig: { thinkingBudget: 0 }`, `gemini-flash-latest` (→ 3.5
   Flash) burns ~1234 tokens of silent thinking. Pin to `gemini-2.5-flash`.
3. **Google bills thinking tokens at the output rate.** Cost tracking must
   include `usageMetadata.thoughtsTokenCount` or you'll under-report.
4. **`window.storage` only fires on OTHER tabs.** For same-tab refresh of
   localStorage-backed UI, dispatch a CustomEvent.
5. **`npm create vite@latest` hangs in some PowerShell environments** on
   interactive TTY prompts. Workaround: scaffold by hand.
6. **Anthropic SDK in the browser** needs `dangerouslyAllowBrowser: true`.
   Acceptable for local-only Phase 0; Phase 1 must proxy via Electron main.
