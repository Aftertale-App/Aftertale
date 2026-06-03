// ===========================================================================
// Meet Your Heroes — the account-level hub (primary page).
//
// Import lives here (sync every character from one Aftertale.lua), and the
// roster shows every character: STARTED heroes you can open, and CAPTURED
// characters (moments saved, not yet begun) grayed with a "Start" CTA. Picking
// a hero makes them active and routes to their Chronicle. Authoring stays
// per-hero in The Inkwell; the top dropdown only ever shows started heroes.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  type BibleRosterEntry,
  getBibleByKey,
  listBibles,
  setActiveBible,
  startBible,
} from '../lib/bibleStore';
import { heroMomentCount, heroSessionStatus } from '../lib/heroStatus';
import { AddonImport } from './AddonImport';
import { CharacterCreation } from './CharacterCreation';

// TODO(jeff): point at the real addon distribution (CurseForge / GitHub release)
// once it's published. Placeholder so the install step has a target.
const ADDON_DOWNLOAD_URL = 'https://www.curseforge.com/wow/addons/aftertale';

interface HeroCard {
  entry: BibleRosterEntry;
  level?: number;
  moments: number;
  unwritten: number;
}

function buildCards(): HeroCard[] {
  return listBibles().map((entry) => {
    const bible = getBibleByKey(entry.key);
    const status = heroSessionStatus(entry.key, entry.name);
    return {
      entry,
      level: bible?.level,
      moments: heroMomentCount(entry.key),
      unwritten: status.unwritten,
    };
  });
}

function openHero(key: string, isCaptured: boolean): void {
  // Starting a captured hero graduates it (active ⇒ started); opening a started
  // one just switches. Either way we land on their Chronicle.
  if (isCaptured) startBible(key);
  else setActiveBible(key);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('at:request-tab', { detail: 'chronicle' }));
  }
}

export function MeetYourHeroes() {
  const [cards, setCards] = useState<HeroCard[]>(() => buildCards());
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const refresh = () => setCards(buildCards());
    window.addEventListener('at:bible-roster-updated', refresh);
    window.addEventListener('at:bible-updated', refresh);
    window.addEventListener('at:addon-events-updated', refresh);
    window.addEventListener('at:session-recaps-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('at:bible-roster-updated', refresh);
      window.removeEventListener('at:bible-updated', refresh);
      window.removeEventListener('at:addon-events-updated', refresh);
      window.removeEventListener('at:session-recaps-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const started = useMemo(() => cards.filter((c) => c.entry.started), [cards]);
  const captured = useMemo(
    () => cards.filter((c) => !c.entry.started).sort((a, b) => b.moments - a.moments),
    [cards],
  );

  if (manual) {
    return (
      <div>
        <button
          type="button"
          className="at-btn at-btn-secondary at-btn-sm"
          style={{ marginBottom: '1rem' }}
          onClick={() => setManual(false)}
        >
          ← Back to your heroes
        </button>
        <div className="at-callout" style={{ marginBottom: '1rem' }}>
          <strong style={{ color: 'var(--gold-bright)' }}>Rolling a hero by hand?</strong>{' '}
          <span className="muted">
            To capture this character's real play later, create one with the{' '}
            <em>same name</em> in World of Warcraft — imports attach by name.
          </span>
        </div>
        <CharacterCreation />
      </div>
    );
  }

  // First run: no heroes yet. Don't dump an empty roster — lead the player
  // through the capture-first path (install → play → import).
  if (cards.length === 0) {
    return <FirstRunOnboarding onManual={() => setManual(true)} />;
  }

  return (
    <div className="at-heroes">
      <header className="at-heroes-intro">
        <p className="at-kicker">✦ Your roster</p>
        <h2 className="at-section-headline">Meet your heroes</h2>
        <p className="at-section-sub">
          Sync your characters from one save file, then begin whichever you like. Your other
          heroes keep recording in the background until you do.
        </p>
      </header>

      <AddonImport />

      {started.length > 0 && (
        <section className="at-heroes-section">
          <h3 className="at-heroes-group-title">Your heroes</h3>
          <div className="at-heroes-grid">
            {started.map((c) => (
              <HeroCardView key={c.entry.key} card={c} onPick={() => openHero(c.entry.key, false)} />
            ))}
          </div>
        </section>
      )}

      {captured.length > 0 && (
        <section className="at-heroes-section">
          <h3 className="at-heroes-group-title">Characters waiting</h3>
          <p className="muted at-heroes-group-sub">
            Their moments are saved and still recording. Begin any of them whenever you like —
            everything they've lived will be waiting.
          </p>
          <div className="at-heroes-grid">
            {captured.map((c, i) => (
              <HeroCardView
                key={c.entry.key}
                card={c}
                captured
                lead={i === 0}
                onPick={() => openHero(c.entry.key, true)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="at-heroes-sidedoor">
        <button type="button" className="at-btn at-btn-ghost at-btn-sm" onClick={() => setManual(true)}>
          Roll a hero by hand →
        </button>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          You'll need a matching character in WoW for imports to attach.
        </span>
      </div>
    </div>
  );
}

/**
 * First-run onboarding. A brand-new player has no play data yet, so we lead with
 * the capture-first path — install → play → import — rather than an empty
 * roster. Step 3 is the real import drop zone; once anything imports, the hub
 * takes over. Pre-author is the clearly-warned side door.
 */
function FirstRunOnboarding({ onManual }: { onManual: () => void }) {
  return (
    <div className="at-onboard">
      <header className="at-heroes-intro">
        <p className="at-kicker">✦ Begin your tale</p>
        <h2 className="at-section-headline">Three steps to your first chronicle</h2>
        <p className="at-section-sub">
          Aftertale turns your real play into a written saga. Here's how it gets made — only
          the last step happens here.
        </p>
      </header>

      <ol className="at-onboard-steps">
        <li className="at-onboard-step">
          <span className="at-onboard-num">1</span>
          <div className="at-onboard-body">
            <h3 className="at-onboard-step-title">Install the Aftertale addon</h3>
            <p className="at-onboard-step-sub">
              It records your adventures quietly while you play — quests, kills, levels, the
              moments that matter. It never controls your character.
            </p>
            <a
              className="at-btn at-btn-primary at-btn-sm"
              href={ADDON_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
            >
              Get the addon →
            </a>
          </div>
        </li>

        <li className="at-onboard-step">
          <span className="at-onboard-num">2</span>
          <div className="at-onboard-body">
            <h3 className="at-onboard-step-title">Play World of Warcraft</h3>
            <p className="at-onboard-step-sub">
              Just play. Aftertale is watching and remembering — your save file fills with your
              story as you go.
            </p>
          </div>
        </li>

        <li className="at-onboard-step at-onboard-step-active">
          <span className="at-onboard-num">3</span>
          <div className="at-onboard-body">
            <h3 className="at-onboard-step-title">Import your save file</h3>
            <p className="at-onboard-step-sub">
              Already played? Drop your <code>Aftertale.lua</code> below and meet your heroes.
            </p>
            <AddonImport />
          </div>
        </li>
      </ol>

      <div className="at-heroes-sidedoor">
        <button type="button" className="at-btn at-btn-ghost at-btn-sm" onClick={onManual}>
          Roll a hero by hand →
        </button>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          Prefer to start writing before you play? You'll need a matching character in WoW for
          imports to attach later.
        </span>
      </div>
    </div>
  );
}

function HeroCardView({
  card,
  captured,
  lead,
  onPick,
}: {
  card: HeroCard;
  captured?: boolean;
  lead?: boolean;
  onPick: () => void;
}) {
  const { entry, level, moments, unwritten } = card;
  const meta = [entry.race, entry.class].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={`at-hero-card${captured ? ' at-hero-card-captured' : ''}${lead ? ' at-hero-card-lead' : ''}`}
      onClick={onPick}
    >
      <div className="at-hero-card-top">
        <span className="at-hero-card-name">{entry.name}</span>
        {lead && <span className="at-hero-card-lead-tag">most-adventured</span>}
        {captured && !lead && <span className="at-hero-card-captured-tag">captured</span>}
      </div>
      <div className="at-hero-card-meta">
        {typeof level === 'number' ? `Level ${level}` : 'Level —'}
        {meta ? ` · ${meta}` : ''}
      </div>
      <div className="at-hero-card-stats">
        <span>{moments.toLocaleString()} moments</span>
        {unwritten > 0 && (
          <span className="at-hero-card-todo">{unwritten} to write</span>
        )}
      </div>
      <div className="at-hero-card-cta">{captured ? `✦ Start ${entry.name}` : 'Open →'}</div>
    </button>
  );
}
