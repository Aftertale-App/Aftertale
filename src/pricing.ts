// ============================================================================
// Per-model pricing table — single source of truth for cost calculations.
// All prices in USD per 1M tokens. Update when providers change pricing.
//
// As of 2026-05-26 all enrichment routes through OpenRouter. Pricing here
// mirrors the underlying provider's published per-token rate (OpenRouter
// passes provider pricing through and takes their margin on credit
// purchases, not per-request). Verify at https://openrouter.ai/models
// when adding or updating an entry.
//
// Pricing-key convention: 'openrouter/<provider>/<slug>' — mirrors the
// OpenRouter model namespace exactly so the slug copy-pastes from their UI.
// ============================================================================

import type { ModelTier, ProviderId } from './types';

export interface ModelPricing {
  provider: ProviderId;
  model: string;
  tier: ModelTier;
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'openrouter/anthropic/claude-sonnet-4.5': {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4.5',
    tier: 'paid',
    inputPer1M: 3.0,
    cachedInputPer1M: 0.3,
    outputPer1M: 15.0,
  },
  'openrouter/anthropic/claude-opus-4.5': {
    provider: 'openrouter',
    model: 'anthropic/claude-opus-4.5',
    tier: 'paid',
    inputPer1M: 15.0,
    cachedInputPer1M: 1.5,
    outputPer1M: 75.0,
  },
  'openrouter/openai/gpt-5': {
    provider: 'openrouter',
    model: 'openai/gpt-5',
    tier: 'paid',
    inputPer1M: 1.25,
    cachedInputPer1M: 0.125,
    outputPer1M: 10.0,
  },
  'openrouter/google/gemini-2.5-pro': {
    provider: 'openrouter',
    model: 'google/gemini-2.5-pro',
    tier: 'paid',
    inputPer1M: 1.25,
    cachedInputPer1M: 0.31,
    outputPer1M: 10.0,
  },
  'openrouter/google/gemini-2.5-flash': {
    provider: 'openrouter',
    model: 'google/gemini-2.5-flash',
    tier: 'paid',
    inputPer1M: 0.3,
    cachedInputPer1M: 0.075,
    outputPer1M: 2.5,
  },
};

export function calculateCost(
  pricingKey: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[pricingKey];
  if (!p) {
    console.warn(`[pricing] Unknown model '${pricingKey}', assuming $0`);
    return 0;
  }
  const uncachedInput = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (uncachedInput / 1_000_000) * p.inputPer1M +
    (cachedInputTokens / 1_000_000) * p.cachedInputPer1M +
    (outputTokens / 1_000_000) * p.outputPer1M
  );
}
