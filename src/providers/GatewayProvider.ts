// ============================================================================
// Hosted free-tier provider.
//
// Routes a generation through the server-side edge gateway
// (functions/api/generate.ts) instead of calling OpenRouter directly. This is
// the path for new/free players who have NOT brought their own key — Jeff's key
// stays server-side and the free-credit meter is enforced there.
//
// BYOK power users keep using OpenRouterProvider (browser-direct, any model).
// The server pins the model + provider (gpt-oss-120b / Baseten), so this client
// just forwards the messages and relays the prose. It deliberately does NOT
// record local spend — the cost is Jeff's, not the user's.
// ============================================================================

import { getSupabase } from '../lib/supabase';
import { getTurnstileToken as defaultGetTurnstileToken } from '../lib/turnstile';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';

const GENERATE_ENDPOINT = '/api/generate';

export class GatewayError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

interface GenerateResponse {
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  finishReason?: string;
  portraitUrl?: string;
  portraitError?: string;
  error?: string;
  message?: string;
}

export class GatewayProvider implements LLMProvider {
  // The underlying gateway is OpenRouter; report that for the LLMResponse type.
  readonly id = 'openrouter' as const;
  readonly models = ['hosted/free'] as const;

  // Turnstile token getter. Defaults to the on-demand invisible widget; the
  // server enforces the bot check only when TURNSTILE_SECRET is configured, and
  // the getter returns '' when no site key is set, so this is safe either way.
  constructor(private getTurnstileToken: () => Promise<string> = defaultGetTurnstileToken) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new GatewayError(
        'Cloud backend not configured — the hosted free tier is unavailable.',
        'no_backend',
      );
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new GatewayError('Please sign in to use your free generation.', 'unauthorized', 401);
    }

    const turnstileToken = await this.getTurnstileToken();

    const start = performance.now();
    let res: Response;
    try {
      res = await fetch(GENERATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          turnstileToken,
          messages: request.messages,
          temperature: request.temperature,
          portraitPrompt: request.imagePrompt,
          portraitId: request.imageId,
        }),
      });
    } catch (e) {
      throw new GatewayError(`gateway unreachable: ${(e as Error).message}`, 'network');
    }
    const latencyMs = performance.now() - start;

    let payload: GenerateResponse;
    try {
      payload = (await res.json()) as GenerateResponse;
    } catch {
      throw new GatewayError(`gateway returned non-JSON (HTTP ${res.status})`, 'bad_response', res.status);
    }

    if (!res.ok || payload.error) {
      throw new GatewayError(
        payload.message ?? payload.error ?? `HTTP ${res.status}`,
        payload.error,
        res.status,
      );
    }

    if (payload.portraitError) {
      // Portrait is best-effort; surface why it failed without breaking the reveal.
      console.warn('[GatewayProvider] portrait generation failed:', payload.portraitError);
    }

    const finishReason = payload.finishReason ?? 'stop';
    const stopReason: LLMResponse['stopReason'] =
      finishReason === 'length' ? 'truncated' : finishReason === 'stop' ? 'end' : 'other';

    return {
      text: payload.text ?? '',
      inputTokens: payload.inputTokens ?? 0,
      cachedInputTokens: 0,
      outputTokens: payload.outputTokens ?? 0,
      model: payload.model ?? 'hosted/free',
      provider: 'openrouter',
      latencyMs,
      stopReason,
      imageUrl: payload.portraitUrl,
    };
  }
}
