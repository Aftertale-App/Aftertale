// ============================================================================
// Gemini provider — uses Google's official @google/genai SDK.
// Phase 0: client-side calls (fine for local dev, would move to backend in prod).
// ============================================================================

import { GoogleGenAI } from '@google/genai';
import { calculateCost, PRICING } from '../pricing';
import { recordUsage } from '../lib/spendTracker';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini' as const;
  readonly models = ['gemini-3-flash-free', 'gemini-3-flash', 'gemini-3.5-pro'] as const;

  private client: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GeminiProvider: missing API key. Set VITE_GEMINI_API_KEY in .env.local');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const pricing = PRICING[request.model];
    if (!pricing) {
      throw new Error(`GeminiProvider: unknown model '${request.model}'`);
    }

    // Gemini's chat API takes a single combined string OR a structured contents array.
    // For Phase 0 we just join messages with role tags — good enough for the POC.
    const prompt = request.messages
      .map((m) => (m.role === 'system' ? `[SYSTEM]\n${m.content}` : `[${m.role.toUpperCase()}]\n${m.content}`))
      .join('\n\n');

    const start = performance.now();
    const result = await this.client.models.generateContent({
      model: pricing.model,
      contents: prompt,
      config: {
        maxOutputTokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.8,
      },
    });
    const latencyMs = performance.now() - start;

    const text = result.text ?? '';
    const usage = result.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const cachedInputTokens = usage?.cachedContentTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    const costUsd = calculateCost(request.model, inputTokens, cachedInputTokens, outputTokens);

    recordUsage({
      timestamp: Date.now(),
      provider: 'gemini',
      model: request.model,
      task: request.task,
      tier: pricing.tier,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    });

    return {
      text,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      model: request.model,
      provider: 'gemini',
      latencyMs,
    };
  }
}
