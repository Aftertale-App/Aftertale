// ============================================================================
// The "meet your hero" reveal ceremony.
//
// The magic moment: a captured skeleton becomes a living hero. Three phases:
//   - conjuring: generation is running (~10-15s) — a held, anticipatory beat
//     with a rotating status so the wait feels like craft, not loading.
//   - reveal: the portrait paints in and the backstory / voice / quote unfurl.
//   - error: the ceremony couldn't finish. We STAY on this full-screen surface
//     (never bounce the player back to the dense Chronicle reader, which makes
//     no sense to a brand-new hero) and offer a calm retry + an escape hatch.
//
// Presentational only — ChronicleReader owns the generation + persistence and
// drives `phase`. Degrades gracefully if the portrait failed (no image).
// ============================================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterBible } from '../types';

const CONJURE_STEPS = [
  'Reading the deeds you left behind…',
  'Tracing the roads they walked…',
  'Listening for how they speak…',
  'Painting their likeness…',
  'Inking the first page of their saga…',
];

interface Props {
  phase: 'conjuring' | 'reveal' | 'error';
  heroName: string;
  bible: CharacterBible | null;
  /** Persist the (possibly edited) bible and dismiss the reveal. */
  onSave: (bible: CharacterBible) => void;
  /** Player-facing reason the ceremony failed (only meaningful when phase === 'error'). */
  errorMessage?: string | null;
  /** Re-run the ceremony from the error state. */
  onRetry?: () => void;
  /** Leave the ceremony without a hero (error escape hatch — routes to Heroes). */
  onDismiss?: () => void;
}

export function HeroReveal({ phase, heroName, bible, onSave, errorMessage, onRetry, onDismiss }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  // The reveal is a "read it back to yourself" beat — let the player tweak the
  // prose before it's theirs. Drafts seed from the generated bible.
  const [editing, setEditing] = useState(false);
  const [draftBackstory, setDraftBackstory] = useState('');
  const [draftQuote, setDraftQuote] = useState('');

  useEffect(() => {
    if (phase !== 'conjuring') return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx((i) => Math.min(i + 1, CONJURE_STEPS.length - 1)), 2400);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (bible) {
      setDraftBackstory(bible.backstory);
      setDraftQuote(bible.coreQuote ?? '');
    }
  }, [bible]);

  const paragraphs = draftBackstory.split(/\n{2,}/).filter((p) => p.trim());

  return createPortal(
    <div className="at-reveal-backdrop" role="dialog" aria-modal="true" aria-label="Bringing your hero to life">
      {phase === 'conjuring' && (
        <div className="at-reveal-conjure">
          <div className="at-reveal-sigil" aria-hidden="true">✦</div>
          <p className="at-reveal-conjure-name">Composing {heroName}'s bible…</p>
          <p className="at-reveal-conjure-step" key={stepIdx}>{CONJURE_STEPS[stepIdx]}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="at-reveal-conjure at-reveal-error" role="alert">
          <div className="at-reveal-sigil at-reveal-sigil-still" aria-hidden="true">✦</div>
          <p className="at-reveal-conjure-name">{heroName} is still waiting</p>
          <p className="at-reveal-error-msg">
            {errorMessage || 'The forge stalled before their story took shape.'}
          </p>
          <div className="at-reveal-actions">
            <button type="button" className="at-btn at-btn-primary at-reveal-cta" onClick={() => onRetry?.()}>
              ✦ Try again
            </button>
            <button type="button" className="at-btn at-btn-ghost" onClick={() => onDismiss?.()}>
              ← Back to my heroes
            </button>
          </div>
        </div>
      )}

      {phase === 'reveal' && bible && (
        <div className="at-reveal-card">
          <div className="at-reveal-portrait-wrap">
            <div className="at-reveal-portrait-glow" aria-hidden="true" />
            {bible.portraitUrl ? (
              <img
                className="at-reveal-portrait"
                src={bible.portraitUrl}
                alt={`${bible.name}, a ${bible.race} ${bible.class}`}
              />
            ) : (
              <div className="at-reveal-portrait at-reveal-portrait-fallback" aria-hidden="true">✦</div>
            )}
          </div>

          <p className="at-reveal-kicker">✦ A hero takes shape</p>
          <h2 className="at-reveal-name">{bible.name}</h2>
          <p className="at-reveal-sub">
            {bible.race} {bible.class}
            {bible.homeland ? ` · ${bible.homeland}` : ''}
          </p>

          {editing ? (
            <input
              className="at-reveal-edit at-reveal-edit-quote"
              value={draftQuote}
              onChange={(e) => setDraftQuote(e.target.value)}
              placeholder="A line they'd actually say…"
              aria-label="Core quote"
            />
          ) : (
            draftQuote && <p className="at-reveal-quote">“{draftQuote}”</p>
          )}

          <div className="at-reveal-backstory">
            {editing ? (
              <textarea
                className="at-reveal-edit at-reveal-edit-backstory"
                value={draftBackstory}
                onChange={(e) => setDraftBackstory(e.target.value)}
                rows={14}
                aria-label="Backstory"
              />
            ) : (
              paragraphs.map((para, i) => (
                <p key={i} style={{ animationDelay: `${0.5 + i * 0.6}s` }}>
                  {para}
                </p>
              ))
            )}
          </div>

          {(bible.beliefs?.length || bible.motivations?.length) && (
            <div
              className="at-reveal-traits"
              style={{ animationDelay: `${0.5 + paragraphs.length * 0.6 + 0.2}s` }}
            >
              {bible.beliefs?.length ? (
                <div>
                  <h4>Beliefs</h4>
                  <ul>{bible.beliefs.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              ) : null}
              {bible.motivations?.length ? (
                <div>
                  <h4>Driven by</h4>
                  <ul>{bible.motivations.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              ) : null}
            </div>
          )}

          <div className="at-reveal-actions">
            <button
              type="button"
              className="at-btn at-btn-ghost at-reveal-edit-toggle"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? '✓ Done editing' : '✎ Edit details'}
            </button>
            <button
              type="button"
              className="at-btn at-btn-primary at-reveal-cta"
              onClick={() =>
                onSave({
                  ...bible,
                  backstory: draftBackstory.trim() || bible.backstory,
                  coreQuote: draftQuote.trim() || undefined,
                })
              }
            >
              ✦ Enter {bible.name}'s Chronicle →
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
