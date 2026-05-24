# Chronicles of Azeroth

> AI-powered narrative engine that turns World of Warcraft into a personalized RPG novel where you are the protagonist.

## Phase 0 — Proof of Concept

Pure browser app. No addon, no Electron yet. Just enough to validate that LLM + character bible + memory feels real.

**Goals of Phase 0:**

- Character creation interview → generates a character bible
- Pick a famous NPC, have a conversation grounded in lore + your bible + recent events
- A/B test models live (Gemini Flash / Pro / Claude Sonnet) using the same prompt
- Track spend per call, per task, per model — so we can forecast Phase 1 production costs

## Stack

- Vite 6 + React 19 + TypeScript
- `@google/genai` (default — free tier)
- `@anthropic-ai/sdk` (optional — for A/B testing)
- localStorage for everything (throwaway, Phase 1 migrates to SQLite)

## Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local and add your Gemini API key
npm run dev
```

Open http://localhost:5173.

## Privacy / cost notes

- Gemini **Free Tier** uses your data for training (per Google's terms). Fine for roleplay, not for anything sensitive.
- Free tier rate limits: ~10-15 RPM, ~1,500 RPD for Flash. Plenty for normal dev/play.
- Spend tracker is always visible — if it shows > $0 you're using a paid model.

## Project structure

```
src/
  components/    React UI
  lib/           Spend tracker, pricing table, helpers
  providers/     LLM provider implementations (Gemini, Anthropic)
  types.ts       Shared types (UsageRecord, CharacterBible, LLMProvider)
  pricing.ts     Per-model pricing table (single source of truth)
  App.tsx        Top-level app shell
  main.tsx       Entry point
```

## Not in scope for Phase 0

- The actual WoW addon (Phase 2)
- Electron / desktop app (Phase 1)
- SQLite / vector RAG (Phase 1)
- TTS / voice (Phase 1+)
- Realtime sync with game (Phase 2)

See `~/.copilot/session-state/.../plan.md` for the full multi-phase plan.
