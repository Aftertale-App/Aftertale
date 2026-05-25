# LLM Providers

All LLM access goes through the `LLMProvider` interface defined in
`src/types.ts`. This document covers the contract, how to add a provider, and
provider-specific gotchas we've learned the hard way.

## The contract

```ts
export interface LLMProvider {
  readonly id: ProviderId;                       // 'gemini' | 'anthropic'
  readonly models: readonly string[];            // pricing keys, not API ids
  chat(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  task: TaskType;          // 'npc-chat' | 'bible-gen' | 'summary' | 'embedding'
  messages: ChatMessage[]; // [{role: 'system'|'user'|'assistant', content: '...'}]
  model: string;           // pricing key, e.g. 'gemini-flash'
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;    // includes Gemini thoughts tokens
  model: string;
  provider: ProviderId;
  latencyMs: number;
  stopReason: 'end' | 'truncated' | 'other';
}
```

### Two non-obvious rules

1. **The `model` field is a pricing key, not an API model id.** The pricing
   table maps keys like `gemini-flash` to the actual API id like
   `gemini-2.5-flash` and the per-token prices. This lets us swap underlying
   models without changing call sites.

2. **Providers record usage internally** inside `chat()`. Call sites do not
   call `recordUsage()` themselves. This is the rule that makes spend
   tracking impossible to forget.

## Adding a new provider

1. Add the API id + prices to `src/pricing.ts`:
   ```ts
   'openai-gpt5-mini': {
     provider: 'openai',
     model: 'gpt-5-mini',
     tier: 'paid',
     inputPer1M: 0.25,
     cachedInputPer1M: 0.025,
     outputPer1M: 2.00,
   },
   ```

2. Add `'openai'` to the `ProviderId` union in `src/types.ts`.

3. Create `src/providers/OpenAIProvider.ts` implementing `LLMProvider`. Inside
   `chat()`:
   - look up `pricing = PRICING[request.model]`
   - translate `request.messages` to the provider's format
   - call the API
   - compute `inputTokens`, `cachedInputTokens`, `outputTokens` from the
     response (and **any provider-specific extra billed tokens** — see Gemini
     thinking below)
   - call `calculateCost(...)`
   - call `recordUsage(...)`
   - return `LLMResponse`

4. Wire it into the shared model picker in `src/lib/modelChoices.ts`.

5. Add an env var: `VITE_OPENAI_API_KEY` in `.env.local` + `.env.example`.

## Gemini thinking mode trap

**The single most important provider-specific lesson in this project.**

### Symptom

When testing Gemini Flash, responses come back truncated to ~5 tokens
("Though many scholars believe only"), but the API reports a successful
`finishReason: "STOP"` and `usageMetadata.totalTokenCount: 1300+`. Where did
all those tokens go?

### Diagnosis

```
[GeminiProvider] response {
  finishReason: "STOP",
  textLength: 25,
  usageMetadata: {
    promptTokenCount: 30,
    candidatesTokenCount: 5,      ← visible output
    thoughtsTokenCount: 1234,     ← silent thinking
    totalTokenCount: 1269
  }
}
```

Newer Gemini models (3.x+ and the `*-latest` aliases) have **mandatory
thinking mode**. The thinking happens BEFORE generating user-visible output
and consumes the `maxOutputTokens` budget. If you ask for `maxOutputTokens: 200`
and thinking eats 195, you get a 5-token visible response.

The `thinkingConfig: { thinkingBudget: 0 }` flag works on `gemini-2.5-flash`
but is **silently ignored** on `gemini-flash-latest` (currently → 3.5-flash).

### Fix (current)

1. **Pin to `gemini-2.5-flash` and `gemini-2.5-pro`** instead of `*-latest`
   aliases. These are the last models where `thinkingBudget: 0` actually
   disables thinking. See `src/pricing.ts`.

2. **Count `thoughtsTokenCount` toward `outputTokens`** for cost accuracy.
   Google bills thinking tokens at the output rate regardless of whether
   you see them. See `src/providers/GeminiProvider.ts`:

   ```ts
   const visibleOutputTokens = usage?.candidatesTokenCount ?? 0;
   const thoughtsTokens = usage?.thoughtsTokenCount ?? 0;
   const outputTokens = visibleOutputTokens + thoughtsTokens;
   ```

3. **Bump default `maxOutputTokens` to 2048** so we always have headroom even
   if a future model re-introduces mandatory thinking.

### Future: thinking-on tasks (Phase 1)

Some tasks genuinely benefit from thinking (bible generation, chapter
rollups). We'll add `enableThinking?: boolean` to `LLMRequest` and route:

| Task           | Thinking | Why                                 |
| -------------- | -------- | ----------------------------------- |
| `npc-chat`     | OFF      | We want voice, not deliberation     |
| `bible-gen`    | ON       | Quality > latency for this one-off  |
| `summary`      | OFF      | Fast, mechanical                    |
| Chapter rollup | ON       | Quality matters, infrequent         |

## Anthropic notes

- Browser usage requires `dangerouslyAllowBrowser: true` on the client.
  Acceptable for Phase 0 local dev; Phase 1 will proxy via the Electron main
  process so the API key never touches the renderer.
- System messages are passed via the top-level `system` parameter, not
  inside `messages[]`.
- `cache_read_input_tokens` is in the response usage block — we read it to
  populate `cachedInputTokens` for accurate cost accounting.

## Verifying model availability

Google's pricing page and the actual API model IDs do not match. Always verify
with a list call:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$VITE_GEMINI_API_KEY" \
  | jq '.models[].name'
```

Known production IDs as of 2026-05-24:

- `gemini-2.5-flash` ← we pin to this
- `gemini-2.5-pro`   ← we pin to this
- `gemini-2.5-flash-lite`
- `gemini-3.5-flash` ← thinking is mandatory
- `gemini-flash-latest` (alias)
- `gemini-pro-latest` (alias)
- `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview`
