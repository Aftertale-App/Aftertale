import { useState, useCallback } from 'react';
import { generateInspireMe, InspireMeError } from '../lib/inspireMe';
import type {
  InspireMeContext,
  InspireMeSuggestion,
} from '../lib/inspireMePrompt';
import type { LLMProvider } from '../types';

interface InspireMePanelProps {
  /** Everything the prompt needs EXCEPT clickIndex (we manage that here). */
  contextWithoutClickIndex: Omit<InspireMeContext, 'clickIndex'>;
  /** Provider to make the LLM call through. */
  provider: LLMProvider;
  /** Called when the player picks a card -- parent typically sets the textarea. */
  onUse: (text: string) => void;
  /** Override the trigger button label. */
  triggerLabel?: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; suggestions: InspireMeSuggestion[]; clickIndex: number; latencyMs: number }
  | { kind: 'error'; message: string };

/**
 * Inspire Me drop-in panel.
 *
 * Sits next to or below a textarea on an onboarding open-text question.
 * Initial state is a single trigger button (so we don't burn tokens
 * until the player asks). Once clicked, it fetches 3 suggestion cards.
 * Each card is clickable -> hands `onUse(text)` back to the parent.
 * "Try 3 more" re-rolls with an incremented clickIndex to rotate hints.
 */
export function InspireMePanel({
  contextWithoutClickIndex,
  provider,
  onUse,
  triggerLabel = '✨ Inspire Me',
}: InspireMePanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const fetchSuggestions = useCallback(
    async (clickIndex: number) => {
      setPhase({ kind: 'loading' });
      try {
        const result = await generateInspireMe(
          { ...contextWithoutClickIndex, clickIndex },
          provider,
        );
        setPhase({
          kind: 'ready',
          suggestions: result.suggestions,
          clickIndex,
          latencyMs: result.latencyMs,
        });
      } catch (e) {
        const msg =
          e instanceof InspireMeError ? e.message : (e as Error).message ?? 'unknown error';
        setPhase({ kind: 'error', message: msg });
      }
    },
    [contextWithoutClickIndex, provider],
  );

  if (phase.kind === 'idle') {
    return (
      <div className="coa-inspire-panel">
        <button
          type="button"
          className="coa-btn coa-btn-assist coa-inspire-trigger"
          onClick={() => fetchSuggestions(0)}
        >
          <span className="sparkle">✦</span> {triggerLabel}
        </button>
        <div className="coa-inspire-meta">
          Three starting points based on the traits you picked. Use one, edit it, or ignore.
        </div>
      </div>
    );
  }

  if (phase.kind === 'loading') {
    return (
      <div className="coa-inspire-panel">
        <button type="button" className="coa-btn coa-btn-assist coa-inspire-trigger" disabled>
          <span className="sparkle">✦</span> Conjuring three starting points…
        </button>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="coa-inspire-panel">
        <div className="coa-callout coa-callout-danger">
          <strong>Inspire Me failed.</strong> {phase.message}
        </div>
        <button
          type="button"
          className="coa-btn coa-btn-secondary coa-inspire-trigger"
          onClick={() => fetchSuggestions(0)}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="coa-inspire-panel">
      <div className="coa-inspire-cards">
        {phase.suggestions.map((s, i) => (
          <button
            key={`${phase.clickIndex}-${i}`}
            type="button"
            className="coa-inspire-card"
            onClick={() => onUse(s.text)}
            title="Use this suggestion (fills the answer field)"
          >
            <span className="coa-inspire-card-title">{s.title}</span>
            <span className="coa-inspire-card-text">{s.text}</span>
          </button>
        ))}
      </div>
      <div className="coa-inspire-meta">
        <button
          type="button"
          className="coa-btn coa-btn-sm coa-btn-secondary"
          onClick={() => fetchSuggestions(phase.clickIndex + 1)}
        >
          ✦ Try 3 more
        </button>
        <span>Generated in {(phase.latencyMs / 1000).toFixed(1)}s · click any card to use it.</span>
      </div>
    </div>
  );
}
