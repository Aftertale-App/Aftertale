# BYOK Removal — Scope

**Status:** Scoping for decision. Drafted 2026-06-10 from Jeff's direction:
*"I'd like to scope out the complete removal of BYOK. I don't see a need for
it, but we MUST make the economics work… our 10-player friends and family
window will never surface that to our test cohort, so it needs to be locked
behind a switch that is off for now."*

**Already done (2026-06-10):** pricing/plans and every BYOK mention removed
from the marketing landing page behind `SHOW_PLANS = false` in
`LandingPage.tsx`.

**Not done yet:** the in-app switch. This doc is the plan for it, plus the
economics that have to hold once Jeff's gateway key is the only engine.

---

## 1. Why removal is plausible now

BYOK was the Phase-0 cost firewall: no server, no spend exposure. Since then
the hosted gateway (`GatewayProvider` + Supabase edge function) became the
real onboarding path — the Bring-to-Life reveal *requires* it (portrait is
server-side), and session recaps already silently fall back to it for keyless
users (`SessionTrail.tsx:89-96`). BYOK is no longer how a player meets the
product; it's a leftover second engine that:

- doubles every provider code path (two providers, two error vocabularies),
- forces the worst-converting ask in SaaS (paste an API key) into copy,
- leaks cost-anxiety UI (SpendBar, model picker, per-call dollar amounts)
  into a product whose voice is "campfire," not "billing console."

What we lose: the unlimited free escape valve (BYOK users paid their own
marginal cost) and the "your key, your model, your data" privacy/control
pitch. Both are real; both are priced into §4.

## 2. Current BYOK surface area (inventory)

| Surface | File | What happens when BYOK goes |
|---|---|---|
| Key storage/lookup | `src/lib/apiKeys.ts` | Kept internally for dev builds; no prod consumer |
| Settings → API Keys section + cross-device key sync | `SettingsPanel.tsx` (ApiKeysSection), `cloudSync.ts` (`syncOpenRouterKey`) | Hidden behind switch; key-sync code dormant |
| Auto-popup key nudge on every visit for keyless users | `App.tsx:146-153` | **Delete** (it's also a UX bug — fires every load) |
| Model picker + per-browser model choice | `ModelPicker.tsx`, `modelChoices.ts`, Settings → Models | Hidden; gateway owns model choice server-side |
| SpendBar (per-call $ tracking UI) | `SpendBar.tsx`, `spendTracker.ts` | Hidden in prod; keep for dev. Future: becomes the free-allowance meter |
| **Character interview + name/answer assists + codex gen** | `CharacterCreation.tsx` (all calls via `MODEL_CHOICES[].factory()`) | **Must be routed through the gateway** — today this path is BYOK-only and errors for keyless users (pre-existing bug) |
| **Loremaster polish** in manual entry | `ManualEntryDialog.tsx` (`hasKey` gate + "Add a key in ⚙ Settings" hints) | Route through gateway; delete key hints |
| Session recap generation | `SessionTrail.tsx` | Already dual-path ✓ — collapses to gateway-only |
| Bring-to-Life reveal | `ChronicleReader.tsx` | Already gateway-only ✓ |
| Error copy naming keys | `ChronicleReader.tsx` (`friendlyGenError`: "Add your own OpenRouter key in Settings…") | Reword to allowance framing ("The free forge is resting for today — try again tomorrow") |
| Privacy page | `LegalPage.tsx` | Audit + reword the BYOK/OpenRouter-key paragraphs |
| Dev tools (Tavern, Addon Sim) | `NpcChat.tsx`, `AddonSimulator.tsx` | Dev builds keep BYOK — never shipped |
| Docs that assume BYOK | `COST-STRATEGY.md`, `unlock-economy.md`, `LAUNCH-PLAN.md`, `companion-architecture.md`, `value-prop.md` | Doc-debt pass after the decision is final |

## 3. The switch

- `export const BYOK_ENABLED = DEV_TOOLS_ENABLED;` in `src/lib/featureFlags.ts`
  — a **build-time constant, not a localStorage flag**. The cohort must not be
  able to discover or flip it; dev builds keep BYOK so the Tavern/Sim and
  model A/B work keeps functioning.
- One helper, `providerForTask(task)`, that returns the user's OpenRouter
  provider when `BYOK_ENABLED && hasKey`, else `GatewayProvider`. Every call
  site (CharacterCreation ×4, ManualEntryDialog, SessionTrail, InspireMe)
  switches to it — this also fixes the keyless-interview dead end as a side
  effect.
- UI gating: Settings hides API Keys + Models sections; App drops the key
  nudge; SpendBar renders only when `BYOK_ENABLED`.
- Server check before flipping: confirm the gateway edge function accepts the
  `bible-gen` and polish task types (today it's exercised for reveal +
  `summary`), and that its per-user daily ceiling covers an interview
  (≈ 8–10 small calls) without tripping.

**Estimate:** 1–2 days client, ~half day gateway verification + error-copy
pass. No migration; keys already in users' localStorage are simply ignored
(and `apiKeys.ts` is untouched, so dev round-trips keep working).

## 4. Economics — what has to be true

Unit costs (from `src/pricing.ts`, prompt sizes measured from the prompt
builders):

| Action | Approx tokens (in/out) | Claude Sonnet 4.5 | Gemini 2.5 Flash |
|---|---|---|---|
| One chapter (session recap) | ~2.5k / ~800 | **~$0.02** | ~$0.003 |
| Bring-to-Life (backstory + codex) | ~3k / ~1k | ~$0.025 | ~$0.004 |
| + portrait (image gen, server-side) | — | ~$0.03–0.05 | same |
| Interview (8–10 small calls) | ~8k / ~2k total | ~$0.05 | ~$0.01 |

**Friends & Family window (10 players):** worst case ≈ 10 × (1 reveal +
1 interview + ~15 chapters) ≈ **$5–8/month total on Sonnet, under $1 on
Flash.** The economics question doesn't exist at cohort scale — the switch
can flip off the moment the build work in §3 lands.

**Public free tier:** the protection already exists in code — the gateway has
a one-free-credit grant (`no_credit`) and a daily ceiling (`ceiling_reached`).
Removal of BYOK means tuning those numbers, not building new machinery.
A free allowance of ~1 chapter/day costs ≤ $0.60/user-month on Sonnet at
full utilization; real utilization will be a fraction of that.

**Recurring revenue model — options:**

1. **Subscriptions only (recommended).** The Companion/Chronicler/Loremaster
   ladder already exists and subsumes generation costs trivially ($12/mo vs
   ~$1–3/mo of heavy-use model cost). Free = capped hosted generation
   (daily ceiling). Simplest story: *"Free writes a chapter a day; Companion
   writes them all, automatically."*
2. **Subscriptions + a one-time "chapter pack."** For cap-hitters who won't
   subscribe: e.g. $4.99 → 50 chapter generations, never expiring.
   ⚠ **Conflict to resolve:** `unlock-economy.md` Principle #1 is "No
   credits, no confusion." A never-expiring pack honors the spirit
   (permanent purchase, no balance anxiety) but it *is* metered credits in a
   trench coat. That principle was written when BYOK was the unlimited-free
   valve; removing BYOK is exactly the change that re-opens it. **Jeff's
   call.**
3. **Pure pay-as-you-go credits.** Not recommended: maximizes purchase
   friction and balance anxiety, contradicts the unlock-economy design, and
   makes the free→paid story transactional instead of magical.

**What replaces BYOK's two real benefits:**
- *Cost relief:* the daily ceiling + (optionally) the chapter pack.
- *Model choice / privacy control:* gone for users. Acceptable at this stage —
  it was a power-user feature serving approximately one user (Jeff). The
  privacy page must be updated to name the hosted chain (OpenRouter → model
  provider) since "your key never leaves your browser" is no longer the story.

## 5. WoW positioning — walking the Blizzard line (Zygor precedent)

Researched against Zygor Guides (paid since 2007, never enforced against) and
Blizzard's UI Add-On Development Policy. The rules of the road:

1. **The addon itself must be free, full stop.** Blizzard's add-on policy
   requires add-ons to be distributed free of charge, with no premium
   versions, no charging to download, no in-game ads, no solicitation.
   Zygor and RestedXP survive by a clean separation: the **Lua addon is free;
   the paid thing is content/services delivered outside the game** (their own
   website/desktop client). Aftertale's architecture already matches this
   exactly — the addon captures, the *website* writes prose. Keep it that
   way: **no paid feature may ever live inside the addon**, including the
   in-game ChronicleBook if it ships later (reading your own data in-game
   must stay free; the paid value is generation, sync, and delivery).
2. **The addon stays silent about money in-game.** It already is (the
   minimap/popover deliberately don't surface the URL aggressively). Keep the
   single "read your chronicle at aftertale.gg" footer line; never add
   upsells, tier names, or prices to any in-game string.
3. **Distribution:** paid-adjacent addons distribute from their own site, not
   CurseForge (whose listing rules also frown on monetized addons). This
   matches the existing plan (PHASE-A-PUNCHLIST E4: GitHub Release; EX2: no
   CurseForge yet). When CurseForge does happen (Phase B), the listing copy
   must describe the addon as a free, standalone capture/journal tool —
   which, per the deferred-value pitch, it genuinely is.
4. **Trademark hygiene (Zygor's exact pattern, already ours):** name WoW
   nominatively ("for World of Warcraft"), never use Blizzard art/logos/
   screenshots in marketing, and keep the disclaimer — the landing footer's
   "World of Warcraft is a trademark of Blizzard Entertainment… not
   affiliated, endorsed, sponsored, or specifically approved" is already
   correct. This means we **can** say "for World of Warcraft" above the fold;
   nominative use is what every paid guide service does.
5. **The unresolved question stays unresolved:** `ip-posture.md` open
   question #1 (is gating story features *built from* addon-captured data
   behind a subscription permitted?) now has a useful data point — Zygor has
   sold subscription guide content fed through a free addon for ~19 years
   without enforcement — but precedent-of-tolerance is not permission. Brief
   counsel with the Zygor/RestedXP comparison before Phase C billing, per the
   existing plan.

Sources: [Zygor Guides](https://zygorguides.com/) ·
[Zygor review & positioning](https://www.wowlevelingaddons.com/zygor-wow-leveling-guides-review/) ·
[Blizzard UI Add-On Development Policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534) ·
[Blizzard AddOn Policy (archive)](https://wowwiki-archive.fandom.com/wiki/Blizzard_AddOn_Policy) ·
[community enforcement debate](https://us.forums.blizzard.com/en/wow/t/add-on-premiums/1335744)

## 6. Decisions needed from Jeff before build

1. **Go/no-go on §3** (the switch + gateway routing). Everything else can
   trail; this is the cohort blocker.
2. **Free-tier allowance numbers** — proposal: 1 Bring-to-Life per hero +
   3 chapters/day, Sonnet-class model. (Current gateway grants/ceiling get
   tuned to whatever you pick.)
3. **Credits posture** — Option 1 (subs only) vs Option 2 (subs + permanent
   chapter pack), i.e. whether `unlock-economy.md` Principle #1 bends.
4. **SpendBar fate** — hide entirely (proposed) or rework now as the
   free-allowance meter ("2 of 3 chapters today"). Hiding is a one-liner;
   the meter is its own small feature.
5. **Privacy page rewrite** — needs a sentence on the hosted chain once user
   keys are gone (can ride along with the switch PR).
