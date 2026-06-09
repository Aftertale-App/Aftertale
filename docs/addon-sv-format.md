# Addon SavedVariables format — contract & evolution policy

This is the handshake between two independently-versioned codebases:

- **Producer:** the WoW addon (`addon/Aftertale/`, Lua 5.1), which writes
  `Aftertale.lua` (the `AftertaleDB` global).
- **Consumer:** the web app (`src/lib/`, TypeScript), which imports that file.

They deploy on different cadences (the addon via CurseForge / manual install,
the web via Cloudflare Pages), so **they will always be version-skewed**. This
doc is the source of truth both sides reference when the format changes.

> Written 2026-06-09 after a Horde Orc Rogue imported as an "Alliance Unknown
> Adventurer" — the importer read identity fields flat off each character record
> when the addon nests them under `identity`. Root cause: two readers parsing
> raw Lua independently, and a test fixture that didn't match what the addon
> actually writes. This doc + the canonical layer + golden fixtures exist so
> that class of bug can't recur.

---

## What makes this hard (the permanent constraints)

1. **Version skew.** A user can run a 6-month-old addon against today's web
   app, or a fresh addon against a stale cached web bundle. Both must work.
2. **One file holds many schema generations at once.** The addon *appends* to
   one `events` array across every version it's ever run. A single real file
   we examined held **three** event shapes simultaneously:
   - oldest: `{ ts, event, enrichment }` — no `char`, no `id`, no `session`
   - middle: `+ char + charName + id` — GUID-tagged, no `session`
   - newest: `+ session + v` — fully tagged
   You never get to "migrate and forget." Old shapes live forever on disk.
3. **"Missing" is ambiguous.** Absent duel data could mean the user didn't
   duel, *or* that the addon build couldn't capture duels. The capabilities
   manifest (below) disambiguates.

**Goal:** make *additive* change free and forever-safe; make *breaking* change
visible and contained.

---

## The four principles

### 1. The reader is tolerant — additive change is always free
- Unknown event type → canonical kind `unknown` (never dropped, never fatal).
- Unknown field → ignored.
- Unknown top-level table → ignored until a reader supports it.

If the addon only ever **adds** fields/events and never **repurposes** an
existing one, a new addon capability can never break an old reader. This is a
discipline on the **addon** side as much as the web side.

### 2. One normalization layer, not N scattered readers
All raw-Lua → canonical translation lives in **`src/lib/addonSchema.ts`**.
Everything downstream consumes the canonical shapes, never raw Lua. A schema
change has exactly **one** place to update, and two readers can't disagree
(which is exactly how the identity bug happened — `characterIngest.ts` and
`addonIngest.ts` each parsed the registry their own way).

### 3. Version-stamp going forward, shape-sniff backward
- **Forward:** every event the addon writes carries `v = <schema>` (the writer's
  schema version), and `db.meta.capabilities` declares feature versions. The
  reader branches on these deterministically.
- **Backward:** records written before the stamp existed are handled by
  shape-sniffing fallbacks (e.g. identity nested under `identity` vs. flat). The
  sniffing only has to cover the *frozen past*; everything new is explicit.

### 4. Golden fixtures from real files
`tools/fixtures/golden/` holds **real (anonymized) captures**, one per notable
addon era. `tools/test-golden-fixtures.mjs` runs the canonical layer against all
of them and asserts identity + era distribution. **Every schema change adds a
golden file.** A hand-authored fixture that doesn't match reality is worse than
none — it ships green while the real path is broken (which is what happened).

---

## The canonical model (what the web normalizes *to*)

`src/lib/addonSchema.ts` exports `CANONICAL_SCHEMA_VERSION` and the normalizers:

- `normalizeCharacters(db)` → `CanonicalCharacterRecord[]` — identity resolved
  from `value.identity.*` (nested, addon ≥ schema 2) with a flat fallback for
  legacy records. Carries `identityShape: 'nested' | 'flat'` for provenance.
- `readCapabilities(db)` → `{ fileSchemaVersion, features }` — reads
  `db.schemaVersion` / `db.meta.schemaVersion` and `db.meta.capabilities`.
- `eventWriterVersion(event)` → the per-event `v` stamp (or `null` for legacy).

Event parsing itself is already single-source in
`src/lib/savedVariablesIngest.ts` (`ingestChroniclesSavedVariables` →
`AddonEvent[]`); `addonIngest.ts` reuses it. Treat that function as THE event
normalizer — don't add a second event reader.

---

## On-disk schema (`AftertaleDB`)

```
AftertaleDB = {
  schemaVersion = <int>,            -- file-level; current writer = 4
  meta = {
    version, project, build, characterName, realm, startedAt,
    chatLogEnabled, combatLogEnabled,
    schemaVersion = <int>,          -- mirrors top-level (added schema 4)
    capabilities = {                -- added schema 4; feature -> version int
      identity, events, professions, wealth, duels, pvp, ...
    },
  },
  events = {
    { id, t, ts, event, char, charName, session, v, args = {...}, enrichment? },
    ...
  },
  characters = {                    -- added addon schema 2 (Phase 0.75-C)
    [guid] = {
      identity = { guid, name, realm, class, classFile, race, raceFile, sex, faction },
      firstSeen = { timestamp, iso, level, mapID, zoneText, subzoneText, coords{x,y}, ... },
      lastSeen  = { timestamp, iso, level, zoneText, subzoneText },
      classification, classificationReason, onboardingState,
      onboardingPayloadVersion, announced, sightings,
    },
  },
  counts = { [eventName] = int },
  marked = { ... },                 -- /aftertale mark presence stamps (legacy shapes vary)
  enriched = { ... },               -- Companion-tier writeback
}
```

### Field changelog (append-only — never remove or repurpose)

| Addon schema | Change |
|---|---|
| 1 | base `events` array: `{ ts, event, enrichment }`, no per-character tagging |
| 2 | `characters` registry with nested `identity`; events gain `char`/`charName`/`id` |
| 3 | per-login `session` ids on events; ring buffer 5000 → 25000 |
| 4 | per-event `v` writer-version stamp; `meta.capabilities` manifest; `meta.schemaVersion` mirror |

---

## Rules for changing the format

**Addon side (producer):**
- **Add, never remove or repurpose.** If a field's meaning must change, use a
  new field name and bump the relevant capability version.
- Bump `CURRENT_SCHEMA` and add a capability entry when you add a capability.
- Migrations in `migrate()` are for *in-place data fixes only*; new fields
  don't need one (the reader tolerates their absence on old records).

**Web side (consumer):**
- All new raw-shape handling goes in `src/lib/addonSchema.ts`. Do not parse the
  raw registry anywhere else.
- Prefer `event.v` / `meta.capabilities` over shape-sniffing for anything the
  addon now stamps; keep sniffing only for pre-stamp records.
- **Every reader change ships with a golden fixture** proving it against real
  data. Add the new-era capture to `tools/fixtures/golden/` and a case in
  `tools/test-golden-fixtures.mjs`.
