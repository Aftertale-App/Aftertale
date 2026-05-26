# LLM Providers

> **As of 2026-05-26 the only LLM gateway is OpenRouter.** Direct Gemini
> and Anthropic providers were removed in this session — one key, every
> model. See [`companion-architecture.md`](./companion-architecture.md) §8a
> for the strategic rationale.

All LLM access goes through the `LLMProvider` interface defined in
`src/types.ts`. The OpenRouter implementation in
`src/providers/OpenRouterProvider.ts` is the only one shipped today.

## The contract

```ts
export interface LLMProvider {
  readonly id: ProviderId;                       // 'openrouter'
  readonly models: readonly string[];            // pricing keys, not API ids
  chat(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  task: TaskType;          // 'npc-chat' | 'bible-gen' | 'summary' | 'embedding' | 'inspire-me'
  messages: ChatMessage[]; // [{role: 'system'|'user'|'assistant', content: '...'}]
  model: string;           // pricing key, e.g. 'openrouter/anthropic/claude-sonnet-4.5'
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  model: string;
  provider: ProviderId;
  latencyMs: number;
  stopReason: 'end' | 'truncated' | 'other';
}
```

### Two non-obvious rules

1. **The `model` field is a pricing key, not an API model id.** The pricing
   table maps keys like `openrouter/anthropic/claude-sonnet-4.5` to the
   actual OpenRouter slug (`anthropic/claude-sonnet-4.5`) and the per-token
   prices. The key naming convention mirrors the OpenRouter namespace so
   slugs copy-paste from their UI.

2. **The provider records usage internally** inside `chat()`. Call sites do
   not call `recordUsage()` themselves. This makes spend tracking impossible
   to forget.

## Adding a model

1. Add a pricing row to `src/pricing.ts`:
   ```ts
   'openrouter/<provider>/<slug>': {
     provider: 'openrouter',
     model: '<provider>/<slug>',
     tier: 'paid',
     inputPer1M: ...,
     cachedInputPer1M: ...,
     outputPer1M: ...,
   },
   ```
   Verify pricing against <https://openrouter.ai/models>.

2. Add a picker entry to `src/lib/modelChoices.ts` using the shared
   `openRouter()` factory.

3. That's it. No new file. No new env var. No new key.

## OpenRouter notes

- **API:** OpenAI-compatible, plain fetch. No SDK, no client library —
  keeps the bundle tiny (~3.5 KB chunk, ~1.5 KB gzipped).
- **Attribution headers:** `HTTP-Referer` and `X-Title` are sent on every
  request so calls show up labeled on the user's OpenRouter activity feed.
- **Prompt caching:** OpenRouter surfaces `prompt_tokens_details.cached_tokens`
  for providers that support it (currently Anthropic models, etc.). The
  provider reads this and feeds it into our cost calculator.
- **Free models:** OpenRouter offers `:free` model variants
  (e.g. `meta-llama/llama-3.3-70b-instruct:free`). We don't ship any in the
  curated picker today but they're trivially addable by following the
  "Adding a model" steps above.

## Historical: the Gemini thinking trap

This is preserved as institutional knowledge even though we no longer hit
Gemini directly. If a future OpenRouter routing change exposes a
thinking-mandatory model, the same gotcha applies.

### Symptom

When testing Gemini Flash, responses came back truncated to ~5 tokens
("Though many scholars believe only"), but the API reported a successful
`finishReason: "STOP"` and `usageMetadata.totalTokenCount: 1300+`. Where
did all those tokens go?

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
and consumes the `maxOutputTokens` budget. If you ask for `maxOutputTokens:
200` and thinking eats 195, you get a 5-token visible response.

### Fix

- Pin to specific model versions, not `*-latest` aliases.
- Count any silent thinking tokens toward `outputTokens` for cost accuracy
  (Google bills thinking tokens at the output rate).
- Default `maxOutputTokens` to 2048 so we always have headroom.
