// ============================================================================
// The "meet your hero" reveal ceremony.
//
// The magic moment: a captured skeleton becomes a living hero. Two phases:
//   - conjuring: generation is running (~10-15s) — a held, anticipatory beat
//     with a rotating status so the wait feels like craft, not loading.
//   - reveal: the portrait paints in and the backstory / voice / quote unfurl.
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
  phase: 'conjuring' | 'reveal';
  heroName: string;
  bible: CharacterBible | null;
  onBegin: () => void;
}

export function HeroReveal({ phase, heroName, bible, onBegin }: Props) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (phase !== 'conjuring') return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx((i) => Math.min(i + 1, CONJURE_STEPS.length - 1)), 2400);
    return () => clearInterval(t);
  }, [phase]);

  const paragraphs = bible ? bible.backstory.split(/\n{2,}/).filter((p) => p.trim()) : [];

  return createPortal(
    <div className="at-reveal-backdrop" role="dialog" aria-modal="true" aria-label="Bringing your hero to life">
      {phase === 'conjuring' && (
        <div className="at-reveal-conjure">
          <div className="at-reveal-sigil" aria-hidden="true">✦</div>
          <p className="at-reveal-conjure-name">Bringing {heroName} to life</p>
          <p className="at-reveal-conjure-step" key={stepIdx}>{CONJURE_STEPS[stepIdx]}</p>
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

          {bible.coreQuote && <p className="at-reveal-quote">“{bible.coreQuote}”</p>}

          <div className="at-reveal-backstory">
            {paragraphs.map((para, i) => (
              <p key={i} style={{ animationDelay: `${0.5 + i * 0.6}s` }}>
                {para}
              </p>
            ))}
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

          <button type="button" className="at-btn at-btn-primary at-reveal-cta" onClick={onBegin}>
            ✦ Begin {bible.name}'s chronicle →
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
