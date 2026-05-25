// ============================================================================
// Single source of truth for the model dropdown across the app.
// Adding a model? Add an entry here AND a pricing row in `src/pricing.ts`.
// ============================================================================

import { getApiKey } from './apiKeys';
import type { LLMProvider } from '../types';

export interface ModelChoice {
  label: string;
  pricingKey: string;
  factory: () => Promise<LLMProvider>;
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    label: 'Gemini Flash',
    pricingKey: 'gemini-flash',
    factory: async () => {
      const { GeminiProvider } = await import('../providers/GeminiProvider');
      return new GeminiProvider(getApiKey('gemini'));
    },
  },
  {
    label: 'Gemini Pro',
    pricingKey: 'gemini-pro',
    factory: async () => {
      const { GeminiProvider } = await import('../providers/GeminiProvider');
      return new GeminiProvider(getApiKey('gemini'));
    },
  },
  {
    label: 'Claude Haiku 4.5',
    pricingKey: 'claude-haiku-4.5',
    factory: async () => {
      const { AnthropicProvider } = await import('../providers/AnthropicProvider');
      return new AnthropicProvider(getApiKey('anthropic'));
    },
  },
  {
    label: 'Claude Sonnet 4.6',
    pricingKey: 'claude-sonnet-4.6',
    factory: async () => {
      const { AnthropicProvider } = await import('../providers/AnthropicProvider');
      return new AnthropicProvider(getApiKey('anthropic'));
    },
  },
];

export const DEFAULT_MODEL_INDEX = 0; // Gemini Flash — cheapest, fast, plenty for the POC
