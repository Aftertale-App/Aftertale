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

  // First run (no heroes) leads with the capture-first three steps; once
  // anything imports, the hub header takes over. CRUCIAL: the <AddonImport/>
  // stays a single, stable sibling across that transition — if it remounted
  // when the roster populates, the just-finished import's state would be lost
  // and the new instance would ask the player to drop the file all over again.
  const empty = cards.length === 0;

  return (
    <div className="at-heroes">
      {empty ? (
        <FirstRunSteps />
      ) : (
        <header className="at-heroes-intro">
          <p className="at-kicker">✦ Your roster</p>
          <h2 className="at-section-headline">Meet your heroes</h2>
          <p className="at-section-sub">
            Sync your characters from one save file, then begin whichever you like. Your other
            heroes keep recording in the background until you do.
          </p>
        </header>
      )}

      {/* The roster below is the source of truth for results, so the import's
          own receipt is suppressed here. On the first-run screen it's the full
          drop zone (step 3); once heroes exist it collapses to a small button so
          the hero cards are the centerpiece. The single stable instance keeps
          the loading beat from being interrupted mid-import. */}
      <AddonImport compact={!empty} hideReceipt />

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
          Introduce a Hero Manually →
        </button>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          Create their profile now, then let their true story unfold in World of Warcraft.
        </span>
      </div>
    </div>
  );
}

/**
 * First-run framing: the capture-first three steps. Steps 1 & 2 are guidance;
 * step 3 points at the real import drop zone, which is rendered as a STABLE
 * sibling just below this (not inside it) so it survives the empty→hub
 * transition without remounting.
 */
function FirstRunSteps() {
  return (
    <>
      <header className="at-heroes-intro">
        <p className="at-kicker">✦ Begin your tale</p>
        <h2 className="at-section-headline">Three steps to your first chronicle</h2>
        <p className="at-section-sub">
          Aftertale turns the adventures you actually play into a written saga. Your journey
          begins in World of Warcraft and continues here.
        </p>
      </header>

      <ol className="at-onboard-steps">
        <li className="at-onboard-step">
          <span className="at-onboard-num">1</span>
          <div className="at-onboard-body">
            <h3 className="at-onboard-step-title">Install the Aftertale addon</h3>
            <p className="at-onboard-step-sub">
              Aftertale quietly records the story of your play: quests completed, foes defeated,
              places explored, levels earned, and moments worth remembering.
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
              Adventure as you normally would. As your hero travels through Azeroth, Aftertale
              gathers the raw threads of their unfolding story.
            </p>
          </div>
        </li>

        <li className="at-onboard-step at-onboard-step-active">
          <span className="at-onboard-num">3</span>
          <div className="at-onboard-body">
            <h3 className="at-onboard-step-title">Import your story</h3>
            <p className="at-onboard-step-sub">
              Already begun your journey? Drop your <code>Aftertale.lua</code> file below to bring
              your heroes and their adventures into Aftertale.
            </p>
          </div>
        </li>
      </ol>
    </>
  );
}

// Stub heroes carry these placeholder identity values until real race/class is
// known — don't surface them as "Unknown Adventurer".
const PLACEHOLDER_IDENTITY = new Set(['Unknown', 'Adventurer', '']);

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
  const identity = [entry.race, entry.class]
    .filter((v) => v && !PLACEHOLDER_IDENTITY.has(v))
    .join(' ');
  const monogram = entry.name.trim().charAt(0).toUpperCase() || '✦';
  const faction = entry.faction === 'Horde' ? 'horde' : entry.faction === 'Alliance' ? 'alliance' : 'neutral';

  return (
    <button
      type="button"
      className={`at-hero-card${captured ? ' at-hero-card-captured' : ''}${lead ? ' at-hero-card-lead' : ''}`}
      onClick={onPick}
    >
      <div className="at-hero-card-head">
        <span className="at-hero-card-emblem" data-faction={faction} aria-hidden>
          {monogram}
        </span>
        <div className="at-hero-card-headtext">
          <span className="at-hero-card-name">{entry.name}</span>
          <span className="at-hero-card-meta">
            {typeof level === 'number' ? `Level ${level}` : 'New hero'}
            {identity ? ` · ${identity}` : ''}
          </span>
        </div>
        {lead && <span className="at-hero-card-lead-tag">most-adventured</span>}
        {captured && !lead && <span className="at-hero-card-captured-tag">captured</span>}
      </div>

      <div className="at-hero-card-stats">
        <span>{moments.toLocaleString()} moments</span>
        {unwritten > 0 && <span className="at-hero-card-todo">{unwritten} to write</span>}
      </div>

      <span className="at-hero-card-cta">{captured ? `✦ Start ${entry.name}` : 'Open →'}</span>
    </button>
  );
}
