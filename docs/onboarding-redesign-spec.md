# Onboarding & AI Tiers — Design Spec

**Status:** Design agreed, not yet built. Supersedes the in-Inkwell import flow.
**Date:** 2026-06-03
**Origin:** Real-world testing with multiple WoW toons exposed that the import
experience is confusing for multi-character players. This spec is the
ground-up redesign that resolves it.

---

## 1. The core problem (why we're redoing this)

Every confusion in testing traced to a single mismatch:

> Import is an **account-level** operation (one `Aftertale.lua` = all your
> toons), but the app treated it as a **hero-level** one (you import "as"
> whoever's active).

Symptoms that all collapse into that one bug:
- "Why is it talking about Futony when I'm on Theron?"
- "Where did my sessions go?" (→ to the heroes in the file, not the active one)
- Hidden backlogs of unwritten sessions under heroes you're not looking at.
- "Theron isn't in the file" — only weird because you imported *as* Theron.

You can't patch your way out of a model error with nudges/prompts (we tried;
each patch spawned a new edge). The fix is structural.

---

## 2. The thesis

- **Import = "sync my account."** Account-level. It updates *every* hero from
  one file and persists *every* character's moments.
- **Authoring = per-hero, on-demand.** You build/write one hero at a time.
- **Capture is automatic and account-wide; authoring is deliberate and
  per-hero.** Saving a character's *moments* is not the same as creating a
  *hero* — toons only become heroes when the player chooses to start them.

---

## 3. Information architecture

| Surface | Job |
|---|---|
| **Meet Your Heroes** (primary hub) | Import (update all heroes from one file) · select a started hero · start a captured one. The onboarding front door. |
| **Top character dropdown** | **Started heroes only.** Quick-switch "who am I writing." Never shows captured-but-unstarted toons. |
| **Chronicle** | Read the active hero's story. |
| **The Inkwell** | Author the active hero's session cards. **Only that** — no import, no setup, no roster. |

Import moves **out of The Inkwell** and onto Meet Your Heroes. The Inkwell goes
back to being purely the per-hero writing surface.

### Two character states
- **Captured** — has saved moments from import, not yet started. Shows on Meet
  Your Heroes **grayed out with a `Start [name]` CTA**. Never in the dropdown.
- **Started** — went through the Meet Your Heroes onboarding; a real authored
  hero. In the dropdown **and** on Meet Your Heroes as a live, selectable hero.

A captured toon **graduates** to started (and into the dropdown) the moment the
player begins it.

---

## 4. The new-player journey (beat by beat)

### Beat 1 — Landing page
Sells the dream, shows the payoff (the exhibit carousel already does this).
One primary CTA: **Get Started**. A new player can **demo the sample chronicle
cold** — no sign-in. We only ask for an email at the first thing worth saving.

### Beat 2 — "Three steps to your first chronicle"
The first in-app screen is a calm, confident path, not a form. The magic needs
setup the player hasn't done, so we lead with **capture-first**:

> **1 · Install the Aftertale addon** — records your adventures while you play.
> **2 · Play World of Warcraft** — just play; Aftertale is watching.
> **3 · Import your save file** — drop your `Aftertale.lua`, meet your heroes.

- It's a **home base that remembers where they are** (they install, leave to
  play for days, come back — step 3 lights up on return).
- **`See a sample chronicle →`** lets them taste the payoff before investing.
- **Secondary side door:** *"Want to start writing before you play? Roll a hero
  by hand →"* — with an explicit warning: **you'll need to create a character
  with the same name in WoW for imports to attach later.** (This is the only
  blessed path to a from-scratch hero; it caused the "Theron" mess when it led.)

### Beat 3 — "Meet your heroes" (first import)
They return, hit **"I've played — import,"** drop the file → loading beat →
this screen. **Lead with the main; don't dump all toons as equals.**

> **✦ Meet your heroes** — we read your save file; here's who we found.
>
> **Futony** — Level 12 Orc Warrior · 196 moments · **4h 18m played** · *your most-adventured*
> **`Begin Futony's chronicle →`**
>
> **Your other heroes aren't going anywhere.** Every character's adventures were
> saved the moment you imported, and they keep recording as you play. Start any
> of them whenever you like — every moment they've lived will be waiting.
>
> **Emberfox** — Level 8 · 43 moments · 1h 02m played
> **Maim** — Level 5 · 98 moments · 2h 47m played
> *(Daddywowbuks — too quiet to chronicle yet — skipped.)*

- **Main chosen by most moments + most playtime.** Show both stats per hero
  (playtime from the addon's `/played` capture, `TIME_PLAYED_MSG`).
- The **reassurance line answers the "am I abandoning them?" worry before it
  forms.** It must be *true*: import persists every character's moments
  immediately (see §5).
- Deferred toons get **no call to action** — just "start them whenever."

### Beat 4 — "Begin Futony's chronicle" (always launches from the hub)
There is **one onboarding entry point**: Meet Your Heroes → `Start/Begin [hero]`
— same flow for the first hero and the fifth.

**Cold reveal first — show the magic before any ask.** You can't ask for an
email *and* (much bigger) an OpenRouter key before the player has seen value.

> Click **Begin** → **immediately** show Futony's **real, captured adventures**
> — his session cards built from actual play (quests, level-ups, zones),
> recognizably his. Local, keyless, **no sign-in.** It's obviously a *skeleton*
> — facts, not yet a story — and that gap is the engine.
>
> One CTA: **`✦ Bring Futony to life →`** *(author his backstory + pen each
> chapter in his voice)*.

Asks then arrive **in order of payoff:** **sign in** (*save him*) → **AI**
(*author him*). See §6 for how the AI ask is made gentle (free taste).

---

## 5. Capture mechanism (makes the reassurance true)

- On import, **every character's events are persisted immediately** (locally for
  a not-yet-signed-in player; synced to the backend on sign-in). This is a
  **change from today**, where import skips characters you don't pick.
- **Session cards are *derived* from saved moments** (`buildChronicleSessions`),
  not stored as cards. They materialize when a hero is opened.
- A captured character needs a **lightweight record** (identity + its events) so
  its moments have a home — but it sits in the **"captured, not started"** state,
  **not** as a draft hero cluttering the roster. (Honors the "don't junk up my
  roster with bank alts" rule.)
- Sequence when returning to a captured hero: pick it → **onboarding** (identity
  is already known from import; adds the story layer) → its session cards are
  there to process, built from the moments saved all along.

Mental model: **import banks everyone's raw moments → you author heroes one at a
time → opening a character turns its banked moments into writable session cards.**

---

## 6. Monetization & AI tiers

The wall is BYOK-only: asking a non-technical new player for an OpenRouter key
at the magic moment bleeds conversions. But Jeff won't subsidize others' AI use
without return. Resolution — three tiers:

1. **Free (email only) — a *bounded* taste.** After the cold reveal, the player
   gets **one** authored thing free (backstory or first chapter): a single AI
   call, **cheap model (Haiku)**, **hard-capped at one per account**. Not
   "paying for their usage" — a fixed, predictable **CAC of a few cents per
   signup** that buys a hooked, converted user.
2. **BYOK — free to Jeff forever.** Author the rest with your own OpenRouter key;
   you pay OpenRouter directly. Stays **browser-direct** (as today). For power
   users / the addon crowd.
3. **Hosted ("we run the AI") — paid.** Don't want a key? Subscribe (the planned
   Companion+ tier); the subscription covers their AI cost **plus margin**.
   Hosted AI is something people **pay for**, never something Jeff eats.

Beat 4's funnel becomes a slope, not a wall:

> Cold reveal (free) → `Bring Futony to life` → **sign in** (email only) →
> **first chapter authored, free** → *"Loved that? Keep going — bring your key,
> or let us run it for you."*

Email gets the **full wow** (an authored chapter in his voice). The key/sub ask
only appears *after* they've felt it and want more.

---

## 7. Server-side AI gateway & abuse prevention

Free + paid-hosted AI **cannot run in the browser** (Jeff's key can't be
exposed). They go **browser → a server-side gateway (Cloudflare Worker / Supabase
Edge Function holding the key) → OpenRouter.** BYOK stays browser-direct. The
gateway is the **biggest net-new piece** in this spec (no edge functions exist
today). All abuse controls live there.

### The backstop that makes it un-burnable
**A global daily spend ceiling on free generations.** Once free-tier spend hits
`$X/day`, the free taste switches off (falls back to "bring your key / subscribe")
until tomorrow. **Max exposure = `$X/day`, period** — even if every other defense
is bypassed. This single cap is the guarantee.

### Required controls
- **Server-side metering, never client-side.** "1 free per account" is a counter
  on the user row, checked + decremented **atomically on the server** before any
  AI call. (localStorage caps are trivially reset — never use them here.)
- **Verified email** (OTP already forces a real inbox) + **normalize** it
  (collapse `foo+1@`/`f.o.o@gmail` → one identity) so plus-addressing fails.
- **Block disposable-email domains** (deny-list).
- **Cloudflare Turnstile** on signup + OTP request (free; kills bots).
- **Per-IP / per-device rate limits** on the free endpoint (one machine can't
  mint many free generations even with many emails).
- **Tie the free credit to the normalized email** so delete-and-resignup doesn't
  refill it.
- **Minimize per-hit cost:** cheap model, capped output tokens, one/account — so
  even a slipped hit is pennies, and the daily ceiling caps the total.

**Honest bottom line:** you can't make a free taste 100% un-farmable (a
determined person with real emails + a VPN scrapes a few). The realistic, safe
target is: **more effort than it's worth, and bounded to a daily dollar ceiling
you set.**

---

## 8. Design principles that emerged (keep these)

- **Pull, not push.** Surface things when the player comes looking; never nag.
- **Never pull the player off their main.** Cues live on the hero they're about.
- **One onboarding door:** Meet Your Heroes → Start.
- **Reveal order: see the magic → save it → make it beautiful.** Each ask after
  the player has felt why it's worth it.
- **Capture is account-wide; authoring is per-hero.**
- **Bounded free taste → convert.** Never an open tab.

---

## 9. Open / not-yet-designed

- Beat 4 past the cold reveal: personality/trait step? exact backstory-generation
  flow (the "one-click from play history" we discussed earlier in the thread).
- The pre-author (manual, side-door) path in detail.
- **Name-match merge:** when a pre-authored hero (e.g. "Theron") is later played
  in WoW and imported in a multi-toon file, the in-game character must **merge
  into** the existing hand-made hero instead of spawning a duplicate "Start"
  draft. Today's auto-name-match only fires for single-character files
  (`matchingAutoclaim`, AddonImport.tsx).
- Tab/route restructure: physically introducing "Meet Your Heroes" as a primary
  page and moving import there; retiring the old hero-scoped import in Inkwell.
- Migration from current data/architecture.
- Gateway implementation choice: Cloudflare Worker vs Supabase Edge Function.

---

## 10. Relationship to current code

This session produced **uncommitted** changes that partially explored this
direction but predate the full IA decision:
- An account-level import **roster** ("Synced from your save file"), a loading
  beat, a visual glow-up, per-hero "sessions to write" counts, and a
  "no play yet → author/play" prompt — all in `AddonImport.tsx` / `ScribesDesk.tsx`
  / `index.css`.
- A `CharacterCreation.tsx` fix (no longer wedges on the `banner` step when the
  active hero vanishes) — this one is a genuine bug fix worth keeping regardless.

The roster work feeds Meet Your Heroes conceptually, but this spec **restructures
where it lives** (a primary hub, not Inkwell Step 1). Decide before building
whether to ship the CharacterCreation fix on its own and rebuild the rest atop
this spec.

Related tabled item: localhost cloud-sync failure (see memory
`sync-localhost-failure`).
