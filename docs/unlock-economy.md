# Quill & Coin — Free-Tier Unlock Economy

**Status:** Design lock — pre-implementation. Last updated 2026-05-26.

The Quill & Coin is the store. Scribe's Desk is where you write; the Quill & Coin
is where you buy small things to make what you've written better, prettier, or
yours forever.

This doc covers (1) the unlock catalog, (2) the contextual surfaces that
actually sell them, (3) the Quill & Coin store as the always-on browsable
fallback, and (4) the subscription-only moat that keeps unlocks from
cannibalizing recurring revenue.

The strategy summary and conversion hypotheses live in
`private/aftertale-monetization-dashboard.html` (Unlocks tab). That dashboard is the
business-case planning tool. **This doc is the engineering and UX spec.**

---

## 1. Design principles (non-negotiable)

1. **Every unlock is permanent.** No expiry, no credits, no confusion.
2. **Unlocks travel with the account**, not the character.
3. **Impulse-buy pricing only.** Nothing over $9.99. No purchase should
   require deliberation.
4. **Contextual surfacing first, store second.** Unlocks live in the moments
   they're earned. The Quill & Coin store exists as the always-on browsable
   fallback for users who want to shop deliberately.
5. **Unlocks demonstrate paid features, never replace them.** If a free user
   can buy their way to the magic moment one unlock at a time, the
   subscription has no moat. See §5 for the guardrail list.

---

## 2. The unlock catalog

All prices in USD. Stripe small-transaction fees (~3%) eat into net but the
sticker price is what the user sees.

### 2.1 Additional Hero Slot — $4.99 / slot
- **What:** Adds one more character slot to the account.
- **Cap:** 4 add-on slots (5 heroes max before Companion is the obvious move).
- **Mechanic:** Slot purchase unlocks character-creation flow for that slot.
  Manual import still required per hero — no automation bleed into free tier.
- **Where it surfaces:** Character roster page, prominent "Add slot — $4.99"
  CTA adjacent to the hero count. Soft-prompt post-purchase: *"Managing
  multiple heroes manually? Companion does this automatically for $12/month."*

### 2.2 Single Chapter Export — $0.99 / chapter
- **What:** Downloads one chapter as a formatted PDF.
- **Format:** PDF only. ePub stays a Chronicler differentiator.
- **Mechanic:** Same PDF pipeline as Chronicler export — just rate-limited per
  purchase. Export button visible but locked on every chapter card.
- **Where it surfaces:** Locked export icon on each chapter card in the reader.
  Click → $0.99 prompt → PDF download. Post-download prompt: *"Love having
  your chronicle as a file? Chronicler includes unlimited exports for $24/month."*

### 2.3 Chapter Bundle Export — $3.99 / hero
- **What:** All current chapters for one hero, bundled into a single PDF.
- **Mechanic:** Snapshot — chapters written after purchase need a new bundle
  or subscription. Scoped per hero.
- **Where it surfaces:** Prompt after the user's **second** single-chapter
  purchase: *"You've exported 2 chapters. Get all of them for $3.99."* Also
  available on demand from the hero page and the Quill & Coin.

### 2.4 Reader Themes — $2.99 / theme
- **What:** Visual skin for the chronicle reader — background, typography,
  color palette.
- **Initial pack:**
  - Ironforge Scriptorium — stone and candlelight, dwarven manuscript
  - Moonglade Parchment — soft green and ivory, druidic
  - Stormwind Archive — navy and gold, Alliance formal
  - Orgrimmar War Journal — worn leather, bone and red, Horde
  - Dalaran Arcane — deep purple and silver, magical grimoire
- **Mechanic:** Theme previews visible to all free users. Purchase unlocks
  application. **One theme included free at signup** (default "Candlelight
  Parchment" or equivalent) so the reader doesn't feel bare.
- **Where it surfaces:** Settings → Themes (always browseable). Theme picker
  modal on first reader open. Themes carry into paid tiers — purchased themes
  aren't lost on upgrade.

### 2.5 Chapter Regeneration (single use) — $1.99 / regen
- **What:** One alternate take on one chapter. User keeps whichever version
  they prefer; the loser is discarded after 7 days.
- **Mechanic:** Runs enrichment again with a variation-prompt modifier ("write
  this chapter from a different emotional angle" or similar). Both versions
  saved temporarily; user picks one to keep.
- **Where it surfaces:** Locked regenerate icon on chapter cards. **Auto-surface
  when a user rates a chapter poorly** — that's the prime moment. Post-selection
  prompt: *"Like having options? Chronicler includes unlimited regeneration for $24/month."*

### 2.6 Hero Bible Polish (single use) — $2.99 / session
- **What:** One AI-assisted bible review. Reads the current hero bible, suggests
  deepening questions, contradictions to resolve, and character details worth adding.
- **Mechanic:** Output is a structured suggestions document rendered in the
  reader. Player applies changes manually — automation is the paid-tier
  differentiator. One-time session, not ongoing.
- **Where it surfaces:** Hero bible editor page, prominent "Polish my bible —
  $2.99" CTA at the top. Post-session prompt: *"Want your bible to evolve
  automatically as your story deepens? That's Chronicler."*

---

## 3. Contextual surfacing — where unlocks live in the product

Unlocks should never feel like a paywall. They surface in the natural moments
where a user already wants the thing.

| Moment | Surface | Unlock | Prompt copy |
|---|---|---|---|
| User opens reader for the first time | Theme picker modal | Themes ($2.99 ea, one free) | "Pick your reader's look. One's on the house — others, $2.99." |
| User finishes reading a chapter | Locked export icon on chapter card | Single chapter export ($0.99) | "Keep this one as a PDF — $0.99." |
| User exports a second chapter | Post-export bundle prompt | Bundle export ($3.99) | "You've exported 2 chapters. Get all of them for $3.99." |
| User creates their second character | Roster page "Add slot" CTA | Hero slot ($4.99) | "Add another hero — $4.99 per slot." |
| User adds a 2nd, 3rd, 4th slot | Same CTA + soft Companion prompt | Hero slot ($4.99) | Plus: "Managing multiple heroes manually? Companion does this automatically for $12/month." |
| User rates a chapter ≤2 stars | Inline regeneration prompt | Regeneration ($1.99) | "Try a different take — $1.99." |
| User opens hero bible editor | Top-of-page CTA | Bible polish ($2.99) | "Get a polish pass — $2.99." |

These contextual surfaces are **first-class** — most unlock revenue should come
from these moments, not the store.

---

## 4. The Quill & Coin store

The always-on, browsable home for all unlocks. Where users go when they want to
shop deliberately, see what they own, or buy a gift for themselves.

### 4.1 Where it lives
- New top-nav tab: **Quill & Coin** (always visible, anyone with an account).
- URL: `/store` (or `/quill-and-coin` — pick the friendlier slug at build time).
- Settings flag NOT needed — this is core, not power-user.

### 4.2 What's on the page
- **Inventory bar at the top:** "Your collection — 3 themes owned · 2 extra slots · 7 chapters exported."
- **Catalog grid** — all 6 unlock types as cards with:
  - Name, one-line description, price
  - "Owned: N" badge if applicable
  - Primary CTA ("Buy", "Buy another", "Apply" for themes)
  - "Why this exists" expandable explainer
- **Featured / spotlight strip** at the top — surfaces what the user most likely
  wants next based on usage (e.g. "You've exported 2 chapters — bundle is $3.99")
- **Quiet upsell footer:** *"Or, get all of this and more — Chronicler at $24/mo."*
  Single line, no button. Subscription pitch lives on Scribe's Desk, not here.

### 4.3 What's not on the page
- No tiered comparison table (that's Scribe's Desk's job).
- No subscription CTAs more prominent than the catalog itself.
- No "limited time" timers or fake scarcity. Permanent pricing only.

---

## 5. Subscription-only guardrails (never sold as unlocks)

These are the subscription's defensible core. If any of these become buyable
à la carte, the tier ladder collapses.

- **Gameplay monitoring / automated capture** (Companion)
- **Push notifications / mobile delivery** (Companion)
- **Cloud sync** (Companion)
- **Ongoing saga memory across chapters** (Chronicler)
- **Public hero page** (Loremaster)
- **Audio narration** (Loremaster)
- **Unlimited regeneration** (Chronicler — single-use regen is the demo)
- **AI-assisted bible polish, ongoing** (Chronicler — single-use polish is the demo)

The two "single-use demo" entries are intentional: they let a free user feel
the Chronicler-grade workflow once, then earn the upsell.

---

## 6. Cross-tier behavior

- **Free + account:** can buy any unlock. Unlocks persist on the account.
- **Companion:** still benefits from themes (cosmetic) and hero slots beyond 3
  (cap stops them needing this in V1; future cap-raises could re-enable).
  Export, regeneration, and bible polish are included by their subscription,
  so we hide those unlock CTAs for them.
- **Chronicler / Loremaster:** unlocks like themes still purchasable.
  All other unlocks are redundant — hide the CTAs.
- **Lapsed → Free + account:** keeps every unlock they previously bought.
  Subscription benefits go away, unlocks stay. This is the "graceful walk-back"
  promise.

---

## 7. Implementation plan (build order)

Each item should ship behind a feature flag and only after the prior items.

### Phase 1 — Foundation
1. Stripe Checkout integration for one-time purchases (separate from subscriptions).
2. Backend `unlocks` table: `(user_id, unlock_type, scope, purchased_at, stripe_session_id)`.
3. Edge function: `POST /api/unlocks/purchase` — verifies Stripe session, writes row.
4. Client SDK: `useUnlocks()` hook returning what the current user owns.
5. Guardrail check helpers — `canExportChapter()`, `canRegenerate()`, etc.

### Phase 2 — Contextual surfaces (in priority order by hypothesis impact)
1. **Hero slot purchase** — character roster CTA + post-purchase Companion prompt.
   *Highest-intent unlock; primary Companion upsell driver.*
2. **Single chapter PDF export** — reader chapter-card lock + Stripe checkout flow.
   *Lowest-friction unlock; tests the artifact-export pipeline.*
3. **Chapter bundle export** — post-2nd-export prompt + on-demand from hero page.
4. **Reader themes** — settings page + first-reader-open modal + one-free-at-signup.
5. **Chapter regeneration** — chapter-card lock + auto-surface on low-rated chapters.
6. **Hero bible polish** — bible editor top CTA + suggestions-document render.

### Phase 3 — Quill & Coin storefront
1. New `/store` route, top-nav tab.
2. Inventory bar (reads from `useUnlocks()`).
3. Catalog grid (6 cards).
4. Featured strip — heuristic-driven recommendation.
5. Subscription upsell footer line.

### Phase 4 — Telemetry
1. Track per the dashboard's "Conversion tracking priorities":
   - Purchase rate by unlock type
   - Time-from-signup to first purchase
   - 30-day unlock-to-subscription conversion rate
   - Which unlock correlates most with eventual Companion upgrade
2. Wire to backend analytics (Supabase realtime + edge function).

---

## 8. Open questions

- **One free theme at signup — which theme is the default?** Probably a
  game-agnostic one ("Candlelight Parchment") not a faction theme — avoids
  Alliance vs Horde defaults seeming biased.
- **Bundle export snapshot semantics:** if user buys bundle today, plays
  tomorrow, can they pay $3.99 *again* for a fresh bundle, or only after 30
  days? Initial call: no time limit, every bundle is a fresh PDF. Re-purchase
  at user's discretion.
- **Stripe checkout vs in-app purchase UX:** redirect to hosted Checkout for V1
  (zero PCI scope, same flow as subscriptions). Inline Elements is a Phase 5
  polish.
- **Refund policy:** Stripe's standard "no questions asked within 24h" for
  digital goods seems right. Spec when billing lands.
- **Gifting:** "Buy this PDF / theme / slot for a friend" is a natural Quill &
  Coin extension but **not V1**. Note for post-launch.

---

## Appendix A — Naming notes

- Page: **Quill & Coin**.
- URL slug: TBD between `/store` and `/quill-and-coin` (lean shorter).
- Top-nav tab label: **Quill & Coin** (full ampersand, not "and").
- Conversational shorthand internally: "the Q&C" or "the store" both fine.
