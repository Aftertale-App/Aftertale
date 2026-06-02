# Aftertale Test Matrix

Everything built in the 2026-06-02 sprint, as a runnable checklist. Check boxes
as you go. **Setup** once, then work the tracks.

## Setup

- [ ] `git pull` then `npm run dev` → open `http://localhost:5180`
- [ ] Click into the app (`#app`); paste your **OpenRouter key** in ⚙ Keys (needed for Track B/C)
- [ ] **Character → Play as Magnus** (rich bible — needed for arc tests)
- [ ] Have browser DevTools handy for resizing (mobile tests)

Legend: 🆓 no key · 🔑 needs key · 🎮 in-game

---

## Track A — Web UI: mobile, landing, legal 🆓

| # | Test | Steps | Expected | ✓ |
|---|---|---|---|---|
| A1 | Mobile shell mounts | Resize browser < 760px wide, load `#app` | Bottom nav (Chronicle/Tavern/Hero/You); **no** API-key modal; no sideways scroll | ☐ |
| A2 | Demo-first | Mobile, no hero (or fresh) | Chronicle tab shows **Magnus demo** chapters + "This is a demo" banner | ☐ |
| A3 | Tavern locked | Tap **Tavern** | "Premium · coming soon" locked card | ☐ |
| A4 | Hero read-only | Tap **Hero** | Read-only sheet (faction header, quote, backstory); no edit fields | ☐ |
| A5 | You tab = no BYOK | Tap **You** | Sign-in (or "accounts not enabled"); **no API-key field anywhere** | ☐ |
| A6 | Desktop returns | Resize > 760px | Desktop tab shell (Character/Chronicle/Inkwell…) returns | ☐ |
| A7 | Drop cap | Open any chapter (desktop + mobile) | First **letter** floated large in gold (not first word) | ☐ |
| A8 | Landing reframe | Load `/` (landing) | Early-testing banner (dismiss works); header says **"Open the app"**; trust line **"the free tier is always free"**; **no** magic-moment phone section; "Currently supports WoW"; pricing **"coming soon"** note; FAQ leads with **"What stage is Aftertale at?"**; "Coming soon" badges on 3 feature tiles | ☐ |
| A9 | Legal pages | Visit `/privacy` and `/terms`; click footer Privacy/Terms | Both render; footer links work; **no** "Supabase"/"Cloudflare" named in privacy | ☐ |
| A10 | No mobile overflow | Mobile, swipe each tab | Zero horizontal scroll on any tab | ☐ |

---

## Track B — Chapter scaling + registers 🔑

Use **Addon Sim** to make sessions, **Inkwell** to generate.

| # | Test | Steps | Expected | ✓ |
|---|---|---|---|---|
| B1 | Quick vignette | Addon Sim → **Start session → Emit death → End session**. Inkwell → that card | Recommended = **Quick recap**, ~1–2¢. Generate → tight 2–3 paragraph chapter | ☐ |
| B2 | Full chapter | Addon Sim → **Run full chain as session**. Inkwell → that card | Recommended = **Full chapter**, ~3–4¢. Generate → noticeably longer than B1 | ☐ |
| B3 | Length override | On the B2 card, click **Epic** → Regenerate | Longer chapter (and/or splits into 2+). Click **Quick** → shrinks to a vignette | ☐ |
| B4 | Cents accuracy | Note the **~X¢** on the chosen button, generate, check the spend bar | Actual cost ≈ the estimate (within a cent or two) | ☐ |
| B5 | **Downtime voice** | Addon Sim → **⚒ Downtime session** → Inkwell → Generate | Read line "A quiet hour…"; prose is **slice-of-life** (forge/craft/patience), NOT combat-action | ☐ |
| B6 | **Martial voice** | Addon Sim → **⚔ Martial session** → Inkwell → Generate | Read line "A quick scrap…"; prose is **glory/rivalry**; names the duel opponent (Tovin) and a BG rival (Grimfang) | ☐ |
| B7 | Adventuring voice | Generate the B2 quest-chain card | Hero's-journey voice (road/stakes/consequence) | ☐ |

---

## Track C — Chapter engine (P2a–P2d) 🔑

| # | Test | Steps | Expected | ✓ |
|---|---|---|---|---|
| C1 | Single chapter | Generate a small single-zone session (B1) | Exactly **one** chapter | ☐ |
| C2 | **Multi-chapter split** | On the **full chain** card (it spans Westfall→Redridge→Stormwind→Deadmines), pick **Epic** → Generate | **2–3 chapters**, each with its own `# Title`, split at zone/scene changes | ☐ |
| C3 | **The longer road** | Any generated chapter (Magnus) | Each chapter ends with **What lingers:** AND **The longer road:** (the character's interior/arc) | ☐ |
| C4 | Arc block stripped | Read the generated/published text carefully | **No** `<<ARC>>` or `trend:/movement:` text anywhere in the prose | ☐ |
| C5 | **Arc continuity** | Generate two different sessions in a row. Then DevTools console: `localStorage['at.arc-ledger.1779645176311']` | JSON with `trend`, `recentMovements` (grows each gen). Session 2's "The longer road" should *continue*, not restart | ☐ |
| C6 | Publish as a set | On a multi-chapter draft (C2), click **Publish to Chronicle** → Chronicle (Full saga) | Each chapter appears as its **own** titled chapter, not fused under one title | ☐ |
| C7 | **Thread payoff** (cross-session) | *Best in-game (Track D8).* Sim approximation: see note below | A later session that finishes an earlier quest writes a **payoff** chapter that acknowledges the gap | ☐ |
| C8 | **Threads left behind** | Have an unresolved quest (accept without turn-in — or the in-game case). Chronicle → **Full saga** view | "Threads left behind" section lists it, tagged **open / cooling / gone cold** | ☐ |

> **C7 sim note:** the sim turns in every quest, so threads resolve. To exercise
> payoffs without WoW, you'd need an accept-without-turn-in in one session and the
> turn-in later — easiest to just confirm this in-game (D8).

---

## Track D — Tier A capture, in-game 🎮

| # | Test | Steps | Expected | ✓ |
|---|---|---|---|---|
| D1 | Addon version | In WoW, `/reload` | Load line says **`Aftertale loaded v0.6.0 … N events armed`** | ☐ |
| D2 | Profession rollup | **Fish ~15 casts** (or cook/mine several). `/reload`. App → **Inkwell → Auto-import** the SavedVariables `Aftertale.lua` | Beats: "Took up Fishing", "Fishing N to M" rollup; session classifies **Downtime** | ☐ |
| D3 | Profession rank | Cross skill **75/150/225** (Journeyman/Expert/Artisan) → reload → import | "Reached Journeyman/Expert/Artisan in X" beat | ☐ |
| D4 | Wealth milestone | Sell/loot so gold crosses **10g/100g/1000g** → reload → import | A wealth beat narrated as **aspiration** ("a mount now within reach"), not a number | ☐ |
| D5 | Recipe | Learn a recipe from a trainer → reload → import | "Learned to craft X" beat | ☐ |
| D6 | Duel | `/duel` a guildmate, finish it → reload → import | Duel beat with **opponent name** + win/loss | ☐ |
| D7 | Downtime chapter | Generate a recap from a real crafting session | Downtime-voice chapter from your actual play | ☐ |
| D8 | **Cross-session payoff** | Accept a quest one session; finish it a **later** session → import both → generate the later session | The later chapter frames the finish as a **payoff** ("after all this time…") | ☐ |

> **If a Tier A beat doesn't show:** it won't error — the enUS string just didn't
> match. Copy me the exact in-game chat line (skill-up / recipe / duel) and I'll fix
> the pattern.

---

## Track E — Regression (didn't break the basics) 🆓/🔑

| # | Test | Expected | ✓ |
|---|---|---|---|
| E1 | Build | `npm run build` passes clean | ☐ |
| E2 | Existing chronicle | Old/demo chapters still render and zone-group normally | ☐ |
| E3 | Single-recap legacy | A pre-existing single-chapter recap still displays | ☐ |
| E4 | Character switch | Switching heroes keeps each one's chronicle/recaps separate | ☐ |
| E5 | Sign-in (if Supabase env on) | Email OTP accepts the **6-digit** code | ☐ |

---

## Known limits (not bugs)

- Arc ledger is **localStorage-only** (not cloud-synced yet) — regenerable.
- Tier A capture is **enUS** string-parsing for now.
- Tier B PvP (battlegrounds/arenas/world-PvP) **not built** — pending live-client work.
- Arcs-grouping nav view + thread "let it go" agency deferred as polish.
