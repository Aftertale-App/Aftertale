# Cost Strategy

Chronicles of Azeroth will make many LLM calls per play session. To keep this
sustainable (and to avoid surprise bills), Phase 0 ships with a complete cost
tracking and rate management strategy from day one.

## TL;DR

- **Default to Gemini 2.5 Flash on the free tier.** Free tier covers normal
  dev + casual play (~15 RPM, ~1,500 RPD).
- **Switch to paid only when free runs out** ($0.25 input / $1.50 output per
  1M tokens — pennies per hour even at heavy use).
- **Use Gemini 2.5 Pro for premium tasks** (bible generation, chapter
  rollups) — $1.50 / $9.00.
- **Use Claude Sonnet for A/B taste tests**, not as the daily driver.
- **Spend tracker is always-on** and records every call, including the silent
  `thoughtsTokenCount` Google charges for thinking.

## Pricing table (verified 2026-05-24)

| Pricing key            | Provider  | Model                | Input $/1M | Cached $/1M | Output $/1M |
| ---------------------- | --------- | -------------------- | ---------- | ----------- | ----------- |
| `gemini-flash-free`    | Gemini    | gemini-2.5-flash     | 0          | 0           | 0           |
| `gemini-flash-paid`    | Gemini    | gemini-2.5-flash     | 0.25       | 0.025       | 1.50        |
| `gemini-pro`           | Gemini    | gemini-2.5-pro       | 1.50       | 0.15        | 9.00        |
| `claude-haiku-4.5`     | Anthropic | claude-haiku-4-5     | 1.00       | 0.10        | 5.00        |
| `claude-sonnet-4.6`    | Anthropic | claude-sonnet-4-6    | 3.00       | 0.30        | 15.00       |

The pricing table in `src/pricing.ts` is the **single source of truth**. Update
it when providers change pricing; everything else (UI, spend bar, averages)
derives from it.

### Cost calculation

```
cost = (inputTokens − cachedInputTokens) / 1M × inputPer1M
     + cachedInputTokens                    / 1M × cachedInputPer1M
     + outputTokens                         / 1M × outputPer1M
```

`outputTokens` on Gemini **includes `thoughtsTokenCount`** because Google
bills thinking tokens at the output rate even though they're invisible.
See [PROVIDERS.md](./PROVIDERS.md#gemini-thinking-mode-trap).

## Workload sizing

Rough envelope for typical play (per hour):

| Task        | Calls/hr | Avg input tok | Avg output tok | Cost/hr (paid Flash) |
| ----------- | -------: | ------------: | -------------: | -------------------: |
| NPC chat    |     ~120 |          ~800 |           ~150 |              ~$0.05  |
| Bible gen   |       ~2 |        ~3,000 |           ~600 |              ~$0.004 |
| Summary     |      ~10 |        ~2,500 |           ~400 |              ~$0.012 |
| **Total**   |     ~132 |             — |              — |          **~$0.07**  |

A four-hour play session on paid Flash: **~$0.28**. On the free tier: **$0**.
Even if averages double, this is well within hobby-project territory.

Pro tier for the *same* workload would be ~6× more (~$0.42 / hr) — that's why
Pro is reserved for premium tasks (bible gen, arc summaries) only.

## Rate limit strategy

Free tier (informally, since Google hides the official numbers):

- ~10–15 RPM (requests per minute)
- ~1,500 RPD (requests per day)
- ~250k–1M TPM (tokens per minute, depends on model)

Our peak demand is roughly 10 RPM and 150 RPD, so we sit comfortably under
the free tier with headroom for bursts.

When we DO hit a limit:

1. **Exponential backoff with jitter** on 429s (default in Google SDK).
2. **`p-queue` rate limiter** on the client side capping us at 10 RPM to
   stay below the wall (Phase 1).
3. **Cascading provider fallback**: free Gemini → paid Gemini → Claude Haiku.
4. **Spend bar in the tray** shows live RPM so we know when we're near the wall.
5. **Soft cap → hard stop** at user-configurable daily $ budget (Phase 1).
6. **Batch API for non-urgent summaries** (Phase 1) — 50% cheaper, slower SLA.

## Spend tracker

Lives in `src/lib/spendTracker.ts`. Backed by `localStorage`, keyed per day
(`coa.spend.YYYY-MM-DD`). 90-day rolling retention with auto-purge.

### Public API

```ts
recordUsage(record: Omit<UsageRecord, 'id'>): UsageRecord
loadRecentRecords(days?: number): UsageRecord[]
loadTodayRecords(): UsageRecord[]
purgeOldRecords(): void
computeAverages(records: UsageRecord[]): TaskAverages[]
sumCost(records: UsageRecord[]): number
exportCsv(records: UsageRecord[]): string
```

`recordUsage()` dispatches a `coa:usage-updated` CustomEvent on `window` so
in-tab listeners refresh immediately. (The browser's native `storage` event
only fires on OTHER tabs — this was a real bug we hit.)

### Averages by task × model

`computeAverages()` groups records by `${task}::${model}` and returns:

```ts
interface TaskAverages {
  task: TaskType;       // 'npc-chat' | 'bible-gen' | 'summary' | 'embedding'
  model: string;
  calls: number;
  avgInput: number;     // average input tokens per call
  avgCached: number;
  avgOutput: number;
  avgCostUsd: number;
  totalCostUsd: number;
}
```

This is the forecasting goldmine — once we have a few hours of real play
data, we can predict "1 hour of leveling = $X" with confidence.

### Spend bar UI

`SpendBar.tsx` is mounted in `App.tsx` and always visible:

- **Top strip** (collapsed): Today total / Session total / Last call cost
- **Expanded panel**: averages table grouped by task::model, CSV export button
- **Updates live** via the `coa:usage-updated` CustomEvent

If the spend bar ever shows > $0, you know you're on a paid model.

## Privacy / training data

- Gemini **free tier** uses your prompts and responses for model training.
  Fine for fictional roleplay, NOT okay for anything sensitive.
- Gemini **paid tier** does not use your data for training (per Google's
  terms as of 2026-05).
- Anthropic does not use API data for training by default.

This is documented in the README so users understand what they're opting into.
