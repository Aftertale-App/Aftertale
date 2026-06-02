---
description: Run the automatable slice of docs/test-matrix.md (no key, no game, no Supabase) and report pass/fail.
---

# `/test-auto`

Runs the ~20 tests from [`docs/test-matrix.md`](../../docs/test-matrix.md) that
can be verified **without** spending the user's OpenRouter key, without WoW, and
without a Supabase account — i.e. pure structure/rendering/parsing/math.

**Never spend the OpenRouter key.** Anything that needs a real LLM generation,
real prose judgement, in-game capture, or cross-device sync is OUT of scope here
— list those at the end as "still needs you."

Use the Claude Preview tools (`preview_start` / `preview_eval` / `preview_resize`).
The preview's localStorage is ephemeral; freely inject + clean up synthetic data.
Magnus's character key is `1779645176311`.

## Procedure

### 1. Build (E1)
`npm run build` from the repo root — must pass.

### 2. Boot preview + load Magnus
- `preview_start` name `app`. Resize desktop (1280×820).
- Navigate to `#app`, dismiss any settings modal (`.at-modal-close`).
- If no active hero: Character tab → "Play as Magnus". Confirm `at.bible.roster.v1` has an `activeKey`.

### 3. Run the checks (via `preview_eval`)

Desktop, Magnus loaded:
- **E2** Chronicle renders — `.at-chronicle-reader` present.
- **B1/B2** Inkwell session cards — each `.at-chapter-length` has a `-read` line, three `-opt`s with `~N¢`, one `-rec` badge. A small session (death) → Quick recommended; the quest-chain session → **Full** recommended. Cents rise Quick<Full<Epic.
- **B3** Override — click the Epic `-opt` on a card; after a tick the `.is-chosen` label is "Epic".
- **C6** Multi-chapter publish — inject a 2-chapter `SessionRecapRecord` (`chapters:[{title,text},{title,text}]`) into `at.session-recaps.<ck>` for an existing sim sessionId, dispatch `at:session-recaps-updated`, click "Publish to Chronicle", then Chronicle (full mode) → **two** `.at-chronicle-chapter` with the two titles; history has `recap_<sid>__1` and `__2`. Clean up after.
- **C8** Threads left behind — push a `quest_accepted` event (5 days old, no turn-in) into `at.addon.events.v1`, click Chronicle tab, *then* dispatch `at:addon-events-updated` + `at:chronicle-mode`{full}, wait, check `.at-thread` shows the quest tagged "open". Clean up after. (Sequence matters: mount the reader *before* dispatching mode.)
- **A8** Landing — navigate to `/` (clear `at.phaseA.bannerDismissed` first). Body text has: `.at-phasea-banner`, "Open the app", "free tier is always free", no `#magic`, "Currently supports World of Warcraft", `.at-pricing-phasea-note`, "What stage is Aftertale at?", 3 `.at-feature-soon-badge`.
- **A9** Legal — navigate to `/privacy`; `.at-legal-title` = "Privacy Policy"; body has no "supabase"/"cloudflare".
- **E3** Legacy recap — inject a single legacy `recap_legacy_test` history entry (no `__i`) with a `# Title`; Chronicle full mode renders it as a chapter. Clean up after.

Mobile (resize 375×812, **reload** after resize — the headless harness doesn't fire `matchMedia` change events, so live-resize leaves `useIsMobile` stale; a reload re-inits it correctly):
- **A1** `.at-mobile` present; bottom nav = Chronicle/Tavern/Hero/You; no `.at-modal`.
- **A5** No API-key input anywhere (`input[placeholder*="key" i]`).
- **A10** `scrollWidth - clientWidth === 0`.
- **A3** Tap Tavern → `.at-mobile-locked`.
- **A4** Tap Hero → `.at-mobile-hero`, name "Magnus Brunn", no inputs.
- **A2/A7** Demo path — back up then clear the roster `activeKey`, reload mobile → `.at-mobile-demo-tag` + `.at-mobile-demobanner` present, and `.at-chronicle-dropcap` count ≥ 3 (single letters). Restore the roster after.
- **A6** Resize desktop (1280) + reload + `#app` → `.at-mobile` gone, `.at-tab` count = 5.

### 4. Report
Output a pass/fail table (test · result · evidence). Then list the **out-of-scope**
tests that still need the user: B4–B7 + C1–C5/C7 (key + prose judgement), Track D
(in-game), Track F (Supabase), E5 (real email). Reference `docs/test-matrix.md`.

### 5. Clean up
Remove every injected key (`auto_open_q`, `recap_legacy_test`, synthetic recaps),
restore the roster backup, and leave the preview on the desktop app with Magnus
active.
