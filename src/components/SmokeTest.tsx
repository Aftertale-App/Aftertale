import { useState } from 'react';
import { GeminiProvider } from '../providers/GeminiProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import type { LLMProvider, LLMResponse } from '../types';

interface ProviderChoice {
  label: string;
  pricingKey: string;
  factory: () => LLMProvider;
}

const CHOICES: ProviderChoice[] = [
  {
    label: 'Gemini Flash (Free Tier)',
    pricingKey: 'gemini-flash-free',
    factory: () => new GeminiProvider(import.meta.env.VITE_GEMINI_API_KEY ?? ''),
  },
  {
    label: 'Gemini Flash (Paid)',
    pricingKey: 'gemini-flash-paid',
    factory: () => new GeminiProvider(import.meta.env.VITE_GEMINI_API_KEY ?? ''),
  },
  {
    label: 'Gemini Pro',
    pricingKey: 'gemini-pro',
    factory: () => new GeminiProvider(import.meta.env.VITE_GEMINI_API_KEY ?? ''),
  },
  {
    label: 'Claude Haiku 4.5',
    pricingKey: 'claude-haiku-4.5',
    factory: () => new AnthropicProvider(import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''),
  },
  {
    label: 'Claude Sonnet 4.6',
    pricingKey: 'claude-sonnet-4.6',
    factory: () => new AnthropicProvider(import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''),
  },
];

const SMOKE_PROMPT =
  'You are an ancient Azerothian historian. In exactly 2 sentences, tell me one obscure fact about the Old Gods.';

export function SmokeTest() {
  const [choiceIdx, setChoiceIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<LLMResponse | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const choice = CHOICES[choiceIdx];
      const provider = choice.factory();
      const res = await provider.chat({
        task: 'npc-chat',
        model: choice.pricingKey,
        maxTokens: 2048,
        temperature: 0.8,
        messages: [{ role: 'user', content: SMOKE_PROMPT }],
      });
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        marginTop: '2rem',
        padding: '1.5rem',
        border: '1px solid #3a3228',
        borderRadius: 8,
        background: '#1f1812',
      }}
    >
      <h2 style={{ marginTop: 0 }}>🔥 Smoke test</h2>
      <p style={{ opacity: 0.75, fontSize: 14, marginTop: 0 }}>
        Pings the selected model with a tiny Azeroth-flavored prompt. Watch the spend bar light up.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={choiceIdx}
          onChange={(e) => setChoiceIdx(Number(e.target.value))}
          disabled={loading}
          style={{
            background: '#2a2018',
            color: '#e8e4d8',
            border: '1px solid #3a3228',
            padding: '0.5rem 0.75rem',
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {CHOICES.map((c, i) => (
            <option key={c.pricingKey} value={i}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleRun}
          disabled={loading}
          style={{
            background: loading ? '#3a3228' : '#5a3a1a',
            color: '#e8e4d8',
            border: '1px solid #7a5a3a',
            padding: '0.5rem 1rem',
            borderRadius: 4,
            fontSize: 14,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Calling…' : 'Run smoke test'}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#3a1a1a',
            border: '1px solid #7a3a3a',
            borderRadius: 4,
            color: '#f0b0a8',
            fontSize: 13,
            fontFamily: 'Consolas, monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && (
        <div style={{ marginTop: '1rem' }}>
          <div
            style={{
              padding: '1rem',
              background: '#0f1810',
              border: '1px solid #2a3a2a',
              borderRadius: 4,
              fontFamily: 'Georgia, serif',
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            {response.text}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: 12, fontFamily: 'Consolas, monospace', opacity: 0.7 }}>
            {response.inputTokens} in / {response.cachedInputTokens} cached / {response.outputTokens} out · {response.latencyMs.toFixed(0)}ms · {response.model}
          </div>
        </div>
      )}
    </section>
  );
}
