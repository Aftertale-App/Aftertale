# Aftertale — IP Posture for Quest/Game Data

**Status:** working engineering posture, pending legal review before the paid tier ships.
**Last reviewed:** 2026-06-01.
**This is not legal advice.** It records the design decisions and the research behind them so a games-IP attorney can be briefed efficiently. Terms of service change without notice — re-verify the cited terms at launch.

---

## TL;DR — the rule

> **Capture quest/game data only via the in-game WoW Addon API, send only bare FACTS to the LLM, never verbatim Blizzard prose, and never bypass a technical protection measure.**

That posture is what the IP research found to be the most defensible one available for a *commercial* product. There is **no clean licensed source** for Blizzard's quest *prose* (descriptions, dialogue, causality) for a paid product — so we don't use one.

---

## The two "APIs" — do not conflate them

This is the single most important distinction, because one is restricted for paid use and one is not.

| | What it is | How we use it | Governing terms | Restricted for a paid product? |
|---|---|---|---|---|
| **In-game Addon API** | Lua functions that run *inside the WoW client* and surface the player's own data at runtime (`C_QuestLog.GetQuestObjectives`, `GetQuestText`, event registrations in `addon/Aftertale/Aftertale.lua`). | **This is our entire capture pipeline.** The addon reads events for the player's own account and writes them to SavedVariables. | Blizzard **EULA + Addon Policy** (a contract) | **No.** This is how every WoW addon works. None of the Developer-API restrictions apply to it. |
| **Developer / Game Data *Web* API** | OAuth REST service (`develop.battle.net`, `api.blizzard.com`) you call server-side over HTTP for game data. | **We do not use it. At all.** | Blizzard **Developer API Terms of Use** | **Yes** — and the reason we steer clear (see below). |

When the research says "don't ship the official-API path on the paid tier," it means **do not start pulling quest data from the Web API.** It says nothing about the addon logging events — that is unaffected and is the *clean* route.

---

## What we capture and what we send

**Capture (addon, in-game API):**
- **A — structured facts (always on):** quest ID, quest title, structured objectives via `C_QuestLog.GetQuestObjectives` (type + short objective text like "Slay 10 Kobolds" + counts), reward item names/IDs, quest tag/type, NPC name/ID, zone, level, timestamps.
- **B — verbatim Blizzard quest prose (DEV-ONLY):** `GetQuestText`/`GetObjectiveText`/`GetProgressText`/`GetRewardText`, gated behind the `captureBlizzardText` config flag (`/aftertale richtext on`). **Off by default. Never ships to the paid pipeline.** Exists only for an internal prose-quality A/B test.

**Send to the LLM (paid tier) — seeding modes (`src/lib/featureFlags.ts`):**
- **A** = facts only.
- **B** = facts + verbatim prose. **Hard-gated to dev builds; can never be reached in production** (the `!DEV` short-circuit returns the default before localStorage is read).
- **C (production default)** = facts + an instruction telling the model to draw on *its own trained lore knowledge* to ground the scene. **Sends zero Blizzard text** — grounding comes from the model, which is the model provider's exposure, not ours.

A constant prompt guardrail always instructs the model to write **wholly original prose** and never reproduce or closely paraphrase any reference text.

---

## Why this is defensible

- **Facts vs. expression (Feist Publications v. Rural Telephone, 499 U.S. 340).** Bare facts — names, IDs, objective counts, zone, level, NPC — are *not* copyrightable; only creative *expression* (the quest's descriptive prose and dialogue) is. Our facts-only payload sits on the unprotectable side of that line.
- **Clean-room capture.** We read what the client offers to a sanctioned addon for the player's own account. We do **not** datamine client files, scrape Wowhead, or call the Web API.

---

## Why every external "buy better data" route is a dead end (paid product)

All verified against primary sources (Blizzard/Fanbyte legal pages, repo licenses, case law):

- **Blizzard Developer/Game Data Web API — barred.** ToU: *"'Premium' versions of Applications offering additional for-pay features are not permitted, nor can players be charged money to download an Application … when those features use the Blizzard Developer APIs."* Also: *"You may not sell, license or otherwise transfer the Data,"* may not use it to market your product, and must enforce a **30-day TTL** on cached Data (no persistent store).
- **Wowhead (Fanbyte/ZAM) — barred.** EULA grants only a *"personal … non-commercial"* license, explicitly bans *"spiders, robots, crawlers, data mining tools,"* reverse-engineering, and *"any commercial purpose."* No official public API (the only programmatic route is scraping, which the ToS forbids).
- **Community datamined DBs (Questie/QuestieDB, pfQuest, Questie-X) — cannot help.** The data is Blizzard-derived; a GPL/MIT *code* license cannot relicense Blizzard's underlying copyright. The main Questie repo has no repo-wide license (data is all-rights-reserved; files marked "AUTO GENERATED … DO NOT EDIT" with verbatim Blizzard objective text). Some forks (pfQuest-epoch) carry custom licenses that **affirmatively prohibit** commercial use, plus private-server provenance risk.

**Conclusion:** there is no lawful licensed source of quest *prose/causality* for a commercial product. Don't pursue one.

---

## Liabilities that survive a copyright defense — the two hard rules

Even though facts aren't copyrightable, two *independent* liabilities exist. These drive our hard rules:

1. **Blizzard's EULA is an enforceable contract** — *Davidson & Assocs. v. Jung (Blizzard v. BnetD)*, 422 F.3d 630 (8th Cir. 2005). It binds even where a copyright fair-use defense might apply. → **Rule: stay on the sanctioned addon route; don't agree to other terms (Web API ToU, Wowhead EULA) that would bind us to worse restrictions.**
2. **DMCA §17 U.S.C. 1201** penalizes *bypassing technical protection measures*, independent of infringement — *MDY Industries v. Blizzard*, 629 F.3d 928 (9th Cir. 2010) (a WoW case). WoW client files are encrypted/obfuscated. → **Rule: never datamine client files. Read only what the in-game API hands us.**

### Do / Don't

**Do**
- Capture via the in-game Addon API for the player's own account.
- Send structured **facts** to the LLM.
- Use the model's own knowledge (mode **C**) for grounding.
- Keep mode **B** (verbatim prose) dev-only.

**Don't**
- Call the Blizzard Web API for quest data on the paid tier.
- Scrape Wowhead or use community datamined DBs as a commercial data source.
- Datamine/decrypt WoW client files.
- Send verbatim or closely-paraphrased Blizzard prose to the LLM on the paid tier.

---

## Open questions for counsel (the genuinely unresolved risk)

These are *not* resolvable by research — they need a games-IP attorney before the paid tier launches:

1. **Commercial gating under the EULA/Addon Policy.** Capturing events via the addon is clearly fine. The narrower question is whether **gating story features *built from* that captured data behind a paid subscription** is permitted. There is **no known precedent of a *paid* WoW companion** doing this — Raider.IO / WoWAnalyzer are *ad-supported* on the free-API model, which is a different permission.
2. **Where Feist's line falls for a product-authored "causality summary."** A neutral, original summary of a quest's narrative purpose is likely a fact statement, but the boundary between an unprotected fact summary and a derivative of protected expression is interpretive.
3. (Worth asking) Does Blizzard offer any **separate commercial/partner licensing** outside the standard free Web API ToU?

---

## Primary sources

- Blizzard Developer API Terms of Use — https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use
- Blizzard 2013 Third-Party API Usage Policy (continuity) — https://www.bluetracker.gg/wow/topic/us-en/8796591061-third-party-api-usage-policy/
- Fanbyte/ZAM Terms of Service — https://corp.fanbyte.com/legal/terms
- Wowhead Terms of Service — https://www.wowhead.com/termsofservice
- Questie / QuestieDB (license + auto-generated data) — https://github.com/Questie/Questie , https://github.com/Questie/QuestieDB
- EFF Reverse Engineering FAQ — https://www.eff.org/issues/coders/reverse-engineering-faq
- Feist Publications, Inc. v. Rural Telephone Service Co., 499 U.S. 340 (1991)
- Davidson & Associates v. Jung (Blizzard v. BnetD), 422 F.3d 630 (8th Cir. 2005)
- MDY Industries, LLC v. Blizzard Entertainment, Inc., 629 F.3d 928 (9th Cir. 2010)

*Research method: two adversarially-verified deep-research passes (fan-out web search → source fetch → 3-vote claim verification → synthesis). Load-bearing claims rest on primary documents with unanimous verification; see the workflow transcripts for the full claim ledger.*
