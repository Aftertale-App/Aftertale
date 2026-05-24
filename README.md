# Chronicles of Azeroth

> AI-powered narrative engine that turns World of Warcraft into a personalized
> RPG novel where **you** are the protagonist.

Roll a character, live the adventure in-game, and watch the app build a
chapter-by-chapter chronicle of your hero's story in real time. Quests have
permanent consequences. NPCs remember you. Your character is *yours* — voice,
backstory, beliefs, scars and all.

**Status:** Phase 0 (Browser POC) — see [docs/ROADMAP.md](./docs/ROADMAP.md)

## What it does (eventually)

- **Character creation interview** generates a deep character bible (race,
  class, faction, backstory, beliefs, motivations, voice).
- **Talk to famous NPCs** — Tirion, Sylvanas, Jaina, Bolvar — grounded in
  WoW lore + your character bible + recent events. They remember you.
- **Quests have permanent narrative impact.** Killing Hogger isn't just XP;
  it's a moment in your story.
- **Per-zone / per-arc summaries** that build into a readable novel of your
  playthrough.
- **In-game integration** (Phase 2) via a Lua addon extending YUI-Dialogue.

## Quick start

```powershell
git clone <repo-url>
cd chronicles-of-azeroth
npm install
Copy-Item .env.example .env.local
# Edit .env.local, add your Gemini API key from https://aistudio.google.com/apikey
npm run dev
```

Open <http://localhost:5180>.

## Stack

- **Phase 0** (current): Vite 6 + React 19 + TypeScript, browser-only
- **Phase 1** (planned): Electron 28 + better-sqlite3 + sqlite-vec
- **Phase 2** (planned): Lua addon (extends Peterodox's YUI-Dialogue)
- **LLM**: Gemini 2.5 Flash on the free tier (default), Claude as A/B

## Docs

| Doc | What's in it |
| --- | --- |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Three-phase architecture, data flow, provider contract |
| [docs/COST-STRATEGY.md](./docs/COST-STRATEGY.md) | Pricing table, rate limits, spend tracker, forecasting |
| [docs/PROVIDERS.md](./docs/PROVIDERS.md) | LLM provider interface, adding providers, **Gemini thinking trap** |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Local setup, scripts, ports, env vars, common workflows |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Phase status, exit criteria, what's next |
| [CHANGELOG.md](./CHANGELOG.md) | Notable changes + lessons learned |

## Cost / privacy

The app is built around **always-on cost tracking**. Every LLM call is logged
to localStorage with per-call cost, plus averages by task × model. If the
spend bar in the header ever shows > $0, you're using a paid model.

Default config uses **Gemini's free tier** which is plenty for normal dev
and casual play (~15 RPM, ~1,500 RPD). Free tier means your prompts are used
for Google's model training — fine for fictional roleplay, not okay for
sensitive content. See [docs/COST-STRATEGY.md](./docs/COST-STRATEGY.md) for
the full breakdown.

## License

TBD (currently unlicensed — internal personal project).

---

*Not affiliated with Blizzard Entertainment. World of Warcraft and all related
characters and lore are property of Blizzard Entertainment, Inc.*
