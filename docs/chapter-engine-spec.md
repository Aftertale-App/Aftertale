# Chapter Engine — Phase 2 Spec

**Status:** Draft for build (2026-06-02). Authored by Jeff + Claude.

How a stream of captured beats becomes a *serial story* — where chapters
start and end, how threads carry across sessions, how the character's own
journey advances, and how a distractible player's loose ends become character
rather than clutter.

Builds on the narrative-weight chapter-scaling + session registers already
shipped. This spec is the continuity engine on top of them.

---

## 0. The core idea: two spines

A chronicle is two stories braided together:

- **Plot** — what happened in the world. WoW quests, dungeons, zones, PvP.
  External. Tracked by the **Thread Ledger** (§3).
- **Character arc** — who the hero is *becoming*. Authored by the player in the
  bible (Hero's Truth, beliefs, fears, flaws). Internal. The *real* main
  storyline; the quests are just the material it plays out through. Tracked by
  the **Arc Ledger** (§4).

Every design choice below serves keeping those two spines coherent across an
indefinitely long, messy, real play history.

---

## 1. Decouple the chapter from the session

A **session** is a real-world container (when you logged in/out) — not a
narrative unit. A **chapter** is a coherent scene: one place, goal,
relationship, or mood, that opens, develops, and closes on something,
digestible in one read. An **arc** is a multi-chapter storyline (a quest
campaign, a rivalry) — a *navigation* layer, not a generation unit.

The session remains how we capture + trigger generation (immediacy: you always
read what you just played). But one session yields **1–N chapters**.

---

## 2. Segmentation — session → 1–N chapters

On generate, the model receives the session's beats (with seam signals
attached) and emits 1–N chapters, **biased hard toward one**.

**Seam signals fed per beat:** timestamp, zone, register
(adventuring/downtime/martial), quest/chain id, and a flag on major beats
(death, boss, dungeon clear, rank/rating milestone, arc completion).

**Segmentation instruction (the prompt's spine):**
- *Most sessions are a single chapter.* Start a new chapter ONLY at a genuine
  scene change: a new zone, a shift in activity (questing ↔ PvP ↔ crafting),
  the completion of a quest arc, or a turning point.
- A short or single-threaded session is ONE chapter. Never invent chapters to
  hit a number.
- A session that clearly *continues* a still-open thread may extend that arc
  rather than start fresh (see §3).

**Length is a total session budget, distributed.** The weight tier
(Quick/Full/Epic) sets a *total* prose budget for the session; the model
spreads it across however many chapters it finds. A big session becomes 2–3
normal-length chapters, not one bloated mega-chapter. (This supersedes the
"Epic = one long chapter with movements" idea — movements become real chapter
breaks.)

**Output format:** a delimited list of chapters, each `# Title` + prose +
closing (§5). Single call, so cost tracks total output (bounded by the budget),
not chapter count.

---

## 3. Thread Ledger — external plot continuity

A persistent, per-character, cloud-synced ledger of unresolved story threads.
The model never has to *remember*; the ledger remembers, anchored on **quest /
chain IDs** (deterministic — not "did the AI recall it").

**Entry shape:**
```
{ threadId, title, register,
  openedInChapterId, openedAt, lastTouchedAt,
  openQuestIds: [155, 156], openChainId: "defias",
  storySoFar: "Magnus took up the Defias investigation; the trail
               pointed to the Deadmines, but night fell.",
  weight,                 // how notable (gates whether it's worth surfacing)
  status: "active" | "dormant" | "faded" | "resolved" }
```

**Populated deterministically.** When a chapter generates, we record what it
left hanging: quests accepted-but-not-turned-in, chains not completed. Quest
IDs are hard facts the addon already captures.

**Matching a new session.** Before generating, match the session's quest/chain
IDs against open threads. A `QUEST_TURNED_IN` for #155 resolves the "defias"
thread regardless of how long ago it opened — **time-agnostic**. On match, inject
the thread into the prompt: *"OPEN THREAD 'The Road to the Deadmines' (Ch.7):
[storySoFar]. This session resolves it — write the payoff and close it."*

**Don't mutate old chapters — write the payoff.** Chapter 7 (the setup) stays
immutable; the resolution becomes a NEW chapter ("The Deadmines") consciously
framed as the arc's conclusion. The **arc** (Ch.7 → payoff) is what spans
sessions; chapters stay immutable installments. Preserves immediacy.

### 3.1 Lifecycle — for the distractible player

Threads decay; they are not binary open/closed. This is how loose ends become
character, not clutter.

- **Active** — touched within the last few chapters/days. The *only* status
  injected as "continue this" context, so the prompt never carries 40 stale
  threads.
- **Dormant** — untouched past a decay window (N chapters or days). Drops out of
  active continuity but **stays in the ledger** — still matchable by quest ID, so
  a late finish (weeks later) still fires, and the model is told it's been cold:
  *"After all this time, Magnus finally went back."* The distractibility makes
  the payoff *richer*.
- **Faded** — cold for good, or explicitly abandoned in-game (`QUEST_REMOVED`).
  Eligible for a narrative send-off; otherwise quietly archived.
- **Resolved** — closed by a turn-in/payoff.

**Weight gates what's worth mentioning.** A trivial "kill 10 boars" that goes
cold drops silently; a notable named arc that fades earns a nod.

**Loose-threads narrative mode.** Faded notable threads surface two ways:
- *In prose* — an occasional "What lingers" line or a periodic **interlude
  chapter**: *"The missing caravan, the priestess's request, the road north he
  kept meaning to take — Magnus carried them like stones in a pocket, and walked
  on."*
- *In navigation* — a quiet "Threads left behind" list in the arc/saga view.
  For many players that's relatable, not shameful — a visible wake of
  unfinished business.

**Optional later:** a feather-light affordance to "let it go" (send-off) or
"this still matters" (keep active). Automatic decay handles ~95%; don't build
the agency until it's felt necessary.

---

## 4. Arc Ledger — internal character continuity

The character spine. Parallel architecture to the Thread Ledger, but it tracks
*who the hero is becoming*, not what's unresolved in the world. This is what
makes "advance the character's main storyline" actually *advance* across the
whole chronicle instead of resetting each chapter.

**Seeded from the bible:** Hero's Truth, beliefs, motivations, fears, flaws —
the player-authored arc. These define the character's central tension (e.g.
Magnus: protect the vulnerable / question authority / *fear of becoming only a
weapon*).

**Living state, per character, cloud-synced:**
```
{ truth: "<the Hero's Truth>",
  tension: "<the central pull — who they are vs. who they fear becoming>",
  trend: "<recent direction — hardening / softening / drifting / steadying>",
  openQuestions: ["Is he teaching Tovin to question or only to obey?"],
  recentMovements: [ { chapterId, note } ],  // short, last N
  updatedAt }
```

**Updated each chapter.** Generation also emits a short arc-state update —
how this leg moved/tested/reaffirmed the character's journey. Fed *forward*, so
later chapters' closings know what earlier ones set up internally. The arc gains
momentum and direction.

**Feeds the closing (§5).** The "longer road" closing draws on this — the
unsaid feeling, the private truth, the step toward or away from who they fear
becoming.

This is deliberately *not* tied to WoW quest completion. A character can advance
their arc profoundly in a session where they finished no quests at all — a
crafting evening, a hard-fought loss, a mercy shown. The arc is the adventure of
the *person*.

---

## 5. The chapter closing

Keep **What lingers** exactly as it is — it's the plot residue, and it pairs
with the Thread Ledger. Add a companion movement for the character spine.

> **What lingers** — the residue in the world: a debt, a face they'll see
> again, a question, a loose end. *(Plot. Draws from the Thread Ledger.)*
>
> **The longer road** *(name TBD)* — the interior: what the hero felt but did
> not say, and how this leg moved their own journey — a step toward or away from
> who they fear becoming. *(Character. Draws from the Arc Ledger.)*

**Scale by chapter size:** Quick (vignette) → *What lingers* only; Full → add
*The longer road*; Epic → both, with room for the unsaid to breathe. Never
force the interior section onto a chapter too slight to earn it.

**Naming candidates for the second section** (Jeff's call): *The longer road*,
*What it's making of him*, *Beneath it all*, *The thread of him*, *Further
along*. The name should sound like a chronicler, not a UI label.

---

## 6. Generation flow (putting it together)

On "generate" for a session:
1. **Match** the session's quest/chain IDs against the Thread Ledger → the
   active + newly-resolved threads.
2. **Assemble context:** bible + register voice + matched open threads
   (storySoFar) + current Arc Ledger state + (optionally) a faded-thread or two
   if a loose-threads beat is due.
3. **Segment + write:** one model call → 1–N chapters (biased to one), each with
   `# Title`, prose, *What lingers*, and (size-permitting) *The longer road*.
   Continuations are framed as arc payoffs.
4. **Update both ledgers:** resolve/close threads that paid off; open new ones;
   decay stale ones; write the Arc Ledger update (trend, movement, open
   questions).
5. **Persist** the chapters as immutable entries; record arc/thread linkage for
   the navigation layer.

---

## 7. Storage + reader changes

- A generation produces **1–N chapter entries** (today it's exactly 1). The
  reader treats each as its own chapter — and a published session-recap is a
  hard chapter boundary (never zone-merged with a different-register session).
- New persisted stores: `threadLedger` and `arcLedger`, per character, synced
  via the existing cloudSync path.
- The arc/saga navigation view gains: arcs (multi-chapter groupings) and a
  "Threads left behind" list.

---

## 8. Build phasing — ✅ COMPLETE (2026-06-02)

- [x] **P2a — Segmentation.** Session → 1–N chapters, biased-to-one,
  total-budget distribution. One entry per chapter; recap = hard chapter
  boundary. *(`chapterParse.ts`, SessionTrail prompt, bibleStore, reader.)*
- [x] **P2b — Thread Ledger + continuity.** Derived (quest-ID) thread ledger,
  payoff chapters, active/dormant/faded lifecycle, loose-threads prompt mode.
  *(`threadLedger.ts`, SessionTrail CONTINUITY block.)*
- [x] **P2c — Arc Ledger + the closing.** Persistent internal-journey state, the
  *longer road* closing, `<<ARC>>` carry-forward. Derived; never edits the
  bible. *(`arcLedger.ts`, SessionTrail.)*
- [x] **P2d — Navigation.** "Threads left behind" saga-view surface.
  *(ChronicleReader.)* Arcs-grouping view + thread agency deferred as polish.

Durability: the arc ledger is now **cloud-synced** in the per-character bundle
(alongside bible/enrichments/recaps), folded into the LWW comparator. The thread
ledger is derived from events (which already sync), so it recomputes on a new
device. Published chapters live in `bible.history` (synced). Nothing
story-critical is localStorage-only.

---

## 9. Open decisions

- **Name of the second closing section** (§5). *Default: "The longer road."*
- **How aggressively to decay threads** — N chapters vs N days vs both. *Default:
  dormant after ~4 chapters or ~10 days untouched; faded after ~3× that or on
  `QUEST_REMOVED`.*
- **Interlude cadence** — do loose-threads reflections get their own occasional
  interlude chapter, or only ride "What lingers"? *Default: ride What lingers
  first; add interludes later if they earn it.*
- **Arc Ledger update — same call or a cheap second call?** Inline in the
  segmentation call (cheaper, one pass) vs a small dedicated reflection call
  (cleaner, costs an extra call). *Default: inline first; split only if quality
  demands.*
- **Whether the Arc Ledger ever edits the bible** — or stays a read-only
  derived state that never touches the player's authored source. *Default:
  derived-only; never mutate the player's bible.*
