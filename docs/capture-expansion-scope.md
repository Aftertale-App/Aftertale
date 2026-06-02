# Capture Expansion — Scope & Requirements

**Status:** Draft for review (2026-06-02). Authored by Jeff + Claude.

Scopes how Aftertale captures and narrates the parts of WoW it currently
ignores: **professions & gathering, wealth, battlegrounds, arenas, world PvP,
and duels.** Builds directly on the narrative-weight / chapter-scaling system
shipped 2026-06-02 (`storyBeats.ts`).

This is core to the storytelling, so it's written to be argued with.

---

## 0. Decisions locked (this review's inputs)

1. **Downtime gets its own chapter.** A pure crafting/fishing night is a
   first-class chapter, not just flavor on a combat one.
2. **Real player names are used for rivalry** (battlegrounds, arenas, world
   PvP, duels). Designed tastefully — name *rivals and standouts*, never dump
   rosters. See §7 for the one privacy nuance.
3. **Everything is in scope:** professions & gathering, wealth, battlegrounds,
   arenas/rated, world PvP, duels. The hard ones (world PvP, arenas) are
   included with honest notes on what the combat-log-off constraint costs us.
4. **Professions surface as milestones + a per-session rollup.**

---

## 1. The organizing idea: **session register**

The single most important concept for landing this. Today every chapter is
written in one voice — the hero's-journey adventuring voice. But crafting and
PvP are *different kinds of story* and must not be narrated the same way.

Every session is classified into a **register** by which beats dominate its
narrative weight:

| Register | Dominated by | The voice |
| --- | --- | --- |
| **Adventuring** | quests, kills, zones, levels, instances | The hero's journey (current default). |
| **Downtime** | professions, fishing, cooking, gathering, wealth | Slice-of-life, patience, mastery, the quiet between adventures. |
| **Martial** | battlegrounds, arenas, world PvP, duels | Glory, rivalry, the rush and cost of the fight. |

The register drives three things:
- The **significance line** lead ("A quiet evening at the forge" vs "A big
  night of questing" vs "Blood in the Warsong Gulch").
- The **recap prompt's tonal guidance** (a new per-register voice block).
- For **mixed sessions**, the dominant register sets the voice; if a session is
  genuinely split (e.g. quested *then* hit a BG), the Epic tier's "movements"
  can carry one movement per register.

A session is **classified by summing beat weight per register** and taking the
max; ties break toward Martial > Adventuring > Downtime (the rarer/spikier
story wins the voice). This is the mechanism that makes "downtime gets its own
chapter" actually produce a *good* chapter and not an action-voiced one
describing fishing.

---

## 2. Capture philosophy (unchanged, reinforced)

- **Aggregate, never enumerate.** High-volume activities (skill-ups, money
  ticks, BG score events) are captured as telemetry but promoted to **one
  consolidated beat** — a milestone or a per-session rollup. This is the same
  rule the housing/BG notes already state in `event-candidates.md`.
- **Read-only, no automation.** Every new capture is passive event-listening
  (`CHAT_MSG_*`, scoreboard queries on match end). We never post auctions,
  never automate crafting. EULA-safe by construction.
- **Cross-flavor via `CHAT_MSG_*` string parsing** where modern APIs are
  absent on Classic .tocs; dual-register modern + legacy paths otherwise.
- **Everything new is a weighted story beat** that plugs into the existing
  `BEAT_WEIGHTS` / `sessionNarrativeScore` / chapter-length scaling.

---

## 3. New beat taxonomy (the master list)

New `AddonEventKind`s and the beats they produce. Weight column is the proposed
narrative weight (tunable, same scale as combat/quests where quest-turn-in = 2,
death = 3).

| Beat kind | Register | Capture signal | Aggregation | Weight |
| --- | --- | --- | --- | --- |
| `profession_rank` | Downtime | `CHAT_MSG_SKILL` crossing a named rank (Journeyman/Expert/Artisan/Master…) | one per rank crossed | 2 |
| `profession_first` | Downtime | first-ever skill-up in a skill we've not seen | once per skill, ever | 1.5 |
| `profession_session` | Downtime | `CHAT_MSG_SKILL` deltas, summed at session end | one per (skill × session) | 1 |
| `recipe_learned` | Downtime | `NEW_RECIPE_LEARNED` / `CHAT_MSG_SYSTEM` "learned to create" | one per recipe; notable (rare+) = 2 | 1.5 |
| `crafted_notable` | Downtime | crafted item that is rare+ quality | one per item | 2 |
| `wealth_milestone` | Downtime | `CHAT_MSG_MONEY` crossing a gold threshold (first time) | one per threshold, ever | 1.5 (big thresholds 2) |
| `battleground` | Martial | `PVP_MATCH_COMPLETE` (modern) / scoreboard winner (Classic) + after-action stats | one per match | 2.5 (win) / 2 (loss) |
| `arena_match` | Martial | `PVP_MATCH_COMPLETE` in arena + `GetPersonalRatedInfo` delta | one per match | 2.5 |
| `rating_milestone` | Martial | rated bracket crossing (1500/1800/2000…) | one per threshold, ever | 2 |
| `world_pvp` | Martial | `CHAT_MSG_COMBAT_HONOR_GAIN` (named victim) / `PVP_KILL` | rollup per zone-streak | 1.5 |
| `duel` | Martial | `DUEL_FINISHED` + opponent name | one per duel | 1 |
| `honor_milestone` | Martial | lifetime HK thresholds / rank (Classic PvP ranks) | one per threshold | 1.5 |

Existing adventuring beats are unchanged.

---

## 4. Feature specs

### 4.1 Professions & gathering  *(widest reach)*

**Covers:** all primary professions (blacksmithing, alchemy, engineering,
tailoring, leatherworking, enchanting, JC, inscription), gathering (mining,
herbalism, skinning), and secondaries (cooking, fishing, first aid). **One
capture covers all of them.**

- **Signal:** `CHAT_MSG_SKILL` → "Your skill in `<Skill>` has increased to
  `<N>`." Parse skill name + new level. Fires on every flavor for every skill
  type. Captured as telemetry on every tick.
- **Recipes:** `NEW_RECIPE_LEARNED` (modern, recipeID → name) with a
  `CHAT_MSG_SYSTEM` "You have learned how to create `<X>`" fallback for Classic.
- **Milestones (beats):**
  - `profession_first` — the first time a skill appears for this character ("took
    up the hammer").
  - `profession_rank` — crossing a named rank threshold. Classic ranks:
    Apprentice 1 / Journeyman 75 / Expert 150 / Artisan 225 / Master 300 /
    Grand Master 375 / Illustrious 450 / Zen 525 / … Modern: per-expansion tier
    caps. We store the rank table per flavor.
  - `recipe_learned` / `crafted_notable` — mastering a recipe; crafting a rare+
    item.
- **Session rollup (beat):** the addon tracks `skillStart`/`skillEnd` per skill
  across a session and emits **one** `profession_session` summary at
  `session_end`: `{ skill, from, to, gained }` → "Blacksmithing 180 → 225 (+45)".
  This is what makes a grind night a chapter without 45 noise lines.
- **Voice (Downtime):** patience, materials, the forge/loom/lake, small
  triumphs, the meditative grind. A fishing session is *contemplative downtime*,
  not an achievement dump.

### 4.2 Wealth milestones

- **Signal:** `CHAT_MSG_MONEY` (already captured) + `GetMoney()` snapshots at
  session boundaries. App tracks a per-character gold high-water mark.
- **Beats:** crossing a threshold upward for the first time — 1g, 10g, 100g,
  1,000g, 10,000g, 100,000g, 1,000,000g (under the hood). Big thresholds (10k+)
  weigh 2.
- **Narrate the aspiration, not the number.** A wealth beat is never "crossed
  1,000g." It's what the coin *unlocks* in-world: the first real mount, the
  epic mount finally within reach, enough to never go hungry, wealth that
  changes how innkeepers and rivals treat the hero. Each threshold maps to an
  in-world meaning the narrator reaches for. (Mount-cost inference per flavor is
  a polish pass; aspirational copy first.)
- **Explicitly NOT captured:** auction-house *activity* (postings, bids, scans)
  — pure noise per the existing doc. We narrate the *outcome* (wealth), never
  the spreadsheet.
- **Voice (Downtime):** the merchant, the prosperous, the coin that buys better
  days — or, for some heroes, unease at what wealth costs.

### 4.3 Battlegrounds  *(flagship Martial unit)*

- **Start:** `PVP_MATCH_ACTIVE` (modern, BfA 8.2+) / `UPDATE_BATTLEFIELD_STATUS`
  status `active` (Classic).
- **End:** `PVP_MATCH_COMPLETE` → `winner, duration` (modern) / final
  `UPDATE_BATTLEFIELD_SCORE` once `GetBattlefieldWinner()` is non-nil (Classic).
- **After-action stats (no combat log needed):** on end,
  `RequestBattlefieldScoreData()` then `GetBattlefieldScore(playerRow)` →
  killing blows, honorable kills, deaths, honor, damage, healing. Plus BG name
  and win/loss vs the player's faction.
- **Rivalry (real names — per locked decision):** the scoreboard exposes the
  full roster with names, class, race, faction, and per-row stats. We name the
  **enemy standout** ("the Horde's deadliest was a rogue, Grimfang, with 22
  killing blows") and, where available, repeat opponents. ⚠️ **Constraint:**
  "who killed *me*" is combat-log data and the combat log is off — so we name
  standout *opponents from the scoreboard*, not necessarily our killer. This
  still reads as rivalry and needs no combat log.
- **Aggregation:** a BG fires a burst — emit **one** `battleground` beat on
  completion. Several BGs in a night → several beats → a Martial-register
  chapter that scales up (Epic with movements for a long queue night).
- **Voice (Martial):** the rush, the choke point held, the flag run, the
  hard-fought loss. Win/loss colors the whole beat.

### 4.4 Arenas / rated

- **Modern:** `PVP_MATCH_COMPLETE` also fires for arenas; pull rating via
  `C_PvP.GetPersonalRatedInfo(bracketIndex)` for the delta, enemy comp from the
  scoreboard. **Classic (TBC+):** arena scoreboard via `GetBattlefieldScore` +
  team rating via `GetBattlefieldTeamInfo`.
- **Beats:** `arena_match` (win/loss + comp + rating delta), `rating_milestone`
  (crossing 1500/1800/2000/2400 the first time — a real story beat for the
  competitive player).
- **Rivalry:** enemy team composition and names ("twice we broke against the
  same warrior-druid").
- **Voice (Martial):** tighter, tenser, personal — the ladder, the rival comp,
  the climb.

### 4.5 World PvP  *(the hard one — included honestly)*

The combat log is off, so this is **asymmetric**:
- **Your kills — captured well, named.** `CHAT_MSG_COMBAT_HONOR_GAIN` includes
  the slain player's name on most flavors ("You have been awarded X honor for
  killing `<Name>`"); modern also has `PVP_KILL`. Aggregate into a per-zone
  streak rollup: "claimed six of the Horde across Hillsbrad."
- **Your deaths to players — degraded.** Attributing your death to a *specific
  player* normally needs the combat log. Best-effort: a `player_death` that
  occurs while PvP-flagged in a contested/hostile zone is tagged
  `world_pvp_death` ("cut down in Stranglethorn, flagged and far from home") —
  unnamed unless a system "slain by" string is available on that flavor.
- **Voice (Martial):** the wild, lawless register — ambush, territory, the
  flagged road.

### 4.6 Duels

- **Signal:** `DUEL_FINISHED` + opponent name (from `DUEL_REQUESTED` /
  target context). Win/loss.
- **Beat:** `duel` — light, named ("settled it with Garrth behind the
  Lion's Pride; he yielded first"). Weight 1.
- **Voice (Martial, light):** friendly-rivalry flavor.

---

## 5. The "downtime gets its own chapter" mechanism

What has to change so a non-combat session produces a *good* chapter:

1. **New beats are in `STORY_BEAT_KINDS`** → they count toward
   `sessionNarrativeScore` → the session crosses the "produces a chapter" bar
   and lands a length tier on its own.
2. **Register classification** (§1) is computed per session and stored on the
   `ChronicleSession`. The session card's significance line and the recap
   prompt both read it.
3. **The recap prompt gains a per-register voice block.** Same structure as
   today, but the system prompt swaps in Adventuring / Downtime / Martial tonal
   guidance. This is the highest-leverage prose change in the whole scope.
4. **Significance lead copy per register** in `describeSessionSignificance`
   ("A quiet evening at the forge — Blacksmithing 180→225 and a new recipe.").
5. **Scaling still applies.** A short craft session = a Quick vignette (which is
   still "its own chapter," satisfying the decision); a marathon
   gather-and-craft night with rank-ups and recipes can reach Full.

---

## 6. Pipeline changes (where the work lands)

**Addon (`addon/Aftertale/`):**
- `Aftertale.lua` `EVENTS`: add `CHAT_MSG_SKILL`, `NEW_RECIPE_LEARNED`,
  `PVP_MATCH_ACTIVE/COMPLETE`, `UPDATE_BATTLEFIELD_STATUS/SCORE`,
  `DUEL_FINISHED`, `CHAT_MSG_COMBAT_HONOR_GAIN`, `PVP_KILL` (+ legacy fallbacks).
- Per-session skill-delta tracking + `profession_session` summary on
  `session_end`.
- Scoreboard harvest helper on BG/arena complete.
- Gold high-water tracking via `PLAYER_MONEY` + `GetMoney()`.
- New `Lore/Templates.lua` narrator pools per new beat kind (Lua 5.1 — decimal
  escapes only).

**App (`src/lib/`):**
- `addonEvents.ts`: new `AddonEventKind`s + payload fields (skill, rank, rating,
  scoreboard stats, opponent names).
- `storyBeats.ts`: `BEAT_WEIGHTS` rows for all new kinds; `SessionRegister`
  type + `classifyRegister(records)`; rank-table + threshold helpers.
- `sessionHistory.ts`: stamp `register` onto `ChronicleSession`; new stat rollups
  (skill deltas, BG record, wealth high-water).
- `SessionTrail.tsx`: significance copy per register; the recap prompt's voice
  block keyed on register.
- Per-event narrator/enrichment templates for the new kinds.

---

## 7. Privacy / EULA notes

- **All read-only.** Every signal is passive listening or an on-completion
  scoreboard query. No automation, no AH interaction. EULA-safe.
- **Real player names (locked decision):** character names are *public in-game*
  data, not personal data, so capturing them is defensible. The nuance:
  they get written into chronicle data that **syncs to the cloud** for
  account users. Mitigations baked into the design:
  - We only name **standouts and repeat rivals**, never the full roster.
  - Recommend a future **"name opponents" toggle** (default on) in settings, so
    a privacy-conscious user can fall back to roles/classes.
  - We never capture anything beyond the public character name (no realm-ID
    correlation, no cross-session tracking of other players).

---

## 8. Cross-flavor matrix (capture availability)

| Capability | Vanilla | TBC/Wrath/Cata/MoP Classic | Retail |
| --- | --- | --- | --- |
| `CHAT_MSG_SKILL` (professions) | ✅ | ✅ | ✅ |
| `NEW_RECIPE_LEARNED` | ❌ (use `CHAT_MSG_SYSTEM`) | partial | ✅ |
| Wealth (`CHAT_MSG_MONEY`) | ✅ | ✅ | ✅ |
| BG via `PVP_MATCH_*` | ❌ (legacy scoreboard) | ❌ (legacy) | ✅ |
| BG via `UPDATE_BATTLEFIELD_*` | ✅ | ✅ | ✅ (legacy still works) |
| Arenas | ❌ (no arenas) | ✅ (scoreboard + team rating) | ✅ (rated API) |
| World PvP honor-kill names | ✅ | ✅ | ✅ (+`PVP_KILL`) |
| Duels (`DUEL_FINISHED`) | ✅ | ✅ | ✅ |

Battlegrounds use the **legacy `UPDATE_BATTLEFIELD_*` path as the cross-flavor
baseline**, with modern `PVP_MATCH_*` as the Retail upgrade.

---

## 9. Proposed build order

Each ships independently and is testable via the Addon Simulator.

1. **Register framework + Downtime voice** — the prompt/significance plumbing.
   Unlocks "downtime = its own chapter" the moment professions land.
2. **Professions & gathering** — widest reach, single `CHAT_MSG_SKILL` capture,
   milestones + session rollup.
3. **Wealth milestones** — small add-on to money telemetry.
4. **Battlegrounds** — the flagship Martial unit; scoreboard after-action.
5. **Duels** — cheap Martial flavor.
6. **Arenas / rated** — modern + Classic scoreboard paths.
7. **World PvP** — honor-kill rollups (kills strong, deaths degraded).

---

## 10. Decisions resolved (review 1 — 2026-06-02)

1. **"Who killed me" — best-effort, not blocking.** Try to name the killer from
   any available system "slain by"/death string on a given flavor; fall back to
   naming the **enemy standout from the scoreboard** when no killer signal
   exists. Nice-to-have, never gates the BG beat.
2. **World-PvP deaths ship** (not kills-only). Name the killer where any signal
   exists; unnamed "cut down while flagged in Stranglethorn" is an acceptable
   fallback. No privacy concern with in-game character names.
3. **Modern crafting: narrate for richness, not for ranks.** Retail has no
   Apprentice/Journeyman ladder, so don't force one. Beats are: first-time in a
   skill, notable recipes, crafting a rare+ item, and the per-session rollup —
   each framed as a story moment (mastery, a long-sought recipe) rather than a
   number crossing. Classic *does* get the named-rank beats since they're real
   there.
4. **Wealth = aspirational, contextual milestones.** Don't narrate "crossed
   1,000g" as a number. Narrate what the coin *unlocks*: first real mount, the
   epic mount finally within reach, enough to never go hungry again, wealth that
   changes how the hero is treated. Milestones map to in-world aspirations, not
   thresholds on a graph. (Ladder stays 1/10/100/1k/10k/100k/1M under the hood;
   the *story* is the unlock.)
5. **Opponent naming ships on by default.** No privacy gating needed. A toggle
   can come later as a nicety, not a v1 requirement.
6. **Mixed sessions: dominant voice, with movements for long splits.** A
   short/single-purpose session takes its dominant register's voice and weaves
   the minor beats in as texture. A long session that genuinely spans two strong
   registers (e.g. a quest afternoon that became a BG evening) splits into one
   **movement per register** using the Epic-tier movements mechanism — "Part I"
   in the adventuring voice, "Part II" in the martial voice.

### Still genuinely open (low stakes, decide during build)

- **Classic PvP rank ladder (the old 14 ranks):** fold into `honor_milestone`,
  or model the named ranks (Grunt, Knight, Warlord…) explicitly? Leaning: model
  the named ranks on Classic — they're iconic and story-rich.
- **"Could finally afford X" mount detection:** infer from gold-vs-known-mount
  costs per flavor, or keep wealth milestones to the gold ladder with
  aspirational copy? Leaning: aspirational copy first, mount-cost inference as a
  polish pass.
