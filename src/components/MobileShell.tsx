import { useEffect, useMemo, useState } from 'react';
import { ChronicleReader } from './ChronicleReader';
import { AccountMenu } from './AccountMenu';
import { loadBible } from '../lib/bibleStore';
import { getMagnusDemoBible } from '../lib/demoChronicle';
import { useAuth } from '../lib/auth';
import type { CharacterBible } from '../types';

// ============================================================================
// MobileShell — the phone surface of Aftertale.
//
// Mobile is a READ / react / notify / share client (see the mobile design
// thesis). It is NOT the desktop authoring workshop at a smaller width. So this
// shell deliberately exposes only four things via a bottom nav — Chronicle,
// Tavern (premium NPC chat, gated), Hero (read-only sheet), and You (sign in +
// notifications) — and never prompts for a BYOK key. Capture and bible-building
// happen on PC; where a phone user would hit one of those, we hand them off.
//
// A brand-new visitor with no hero lands on the Magnus DEMO chronicle (real,
// readable content) with a push-to-sign-in CTA — never a setup wall.
// ============================================================================

type MobileTab = 'chronicle' | 'tavern' | 'hero' | 'you';

// Local mirror of App's active-bible subscription (App's copy isn't exported).
function useActiveBible(): CharacterBible | null {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  useEffect(() => {
    function refresh() { setBible(loadBible()); }
    window.addEventListener('at:bible-updated', refresh);
    window.addEventListener('at:bible-roster-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('at:bible-updated', refresh);
      window.removeEventListener('at:bible-roster-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return bible;
}

const TABS: Array<{ id: MobileTab; label: string; glyph: string }> = [
  { id: 'chronicle', label: 'Chronicle', glyph: '📖' },
  { id: 'tavern', label: 'Tavern', glyph: '💬' },
  { id: 'hero', label: 'Hero', glyph: '🛡' },
  { id: 'you', label: 'You', glyph: '✦' },
];

export function MobileShell() {
  const [tab, setTab] = useState<MobileTab>('chronicle');
  const realBible = useActiveBible();
  // No real hero yet → read the demo. Memoized so the reader's identity-stable.
  const demoBible = useMemo(() => (realBible ? null : getMagnusDemoBible()), [realBible]);
  const isDemo = demoBible != null;
  const heroBible = realBible ?? demoBible;

  return (
    <div className="at-mobile">
      <header className="at-mobile-topbar">
        <span className="at-mobile-wordmark">AFTERTALE</span>
        {isDemo && <span className="at-mobile-demo-tag">Demo</span>}
      </header>

      <main className="at-mobile-body">
        {tab === 'chronicle' && (
          <MobileChronicle isDemo={isDemo} demoBible={demoBible} onGoToAccount={() => setTab('you')} />
        )}
        {tab === 'tavern' && <MobileTavern onGoToAccount={() => setTab('you')} />}
        {tab === 'hero' && <MobileHero bible={heroBible} isDemo={isDemo} onGoToAccount={() => setTab('you')} />}
        {tab === 'you' && <MobileYou />}
      </main>

      <nav className="at-mobile-nav" role="tablist" aria-label="Aftertale">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`at-mobile-navitem${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="at-mobile-navglyph" aria-hidden="true">{t.glyph}</span>
            <span className="at-mobile-navlabel">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Chronicle tab ───────────────────────────────────────────────────────────
function MobileChronicle({
  isDemo, demoBible, onGoToAccount,
}: { isDemo: boolean; demoBible: CharacterBible | null; onGoToAccount: () => void }) {
  return (
    <div className="at-mobile-pane">
      {isDemo && <DemoBanner onGoToAccount={onGoToAccount} />}
      <ChronicleReader demoBible={demoBible} readOnly />
    </div>
  );
}

// ── Tavern tab (premium, gated) ──────────────────────────────────────────────
function MobileTavern({ onGoToAccount }: { onGoToAccount: () => void }) {
  const { status } = useAuth();
  const canSignIn = status !== 'disabled';
  return (
    <div className="at-mobile-pane">
      <div className="at-mobile-locked">
        <div className="at-mobile-locked-glyph" aria-hidden="true">💬</div>
        <p className="at-kicker">✦ The Tavern</p>
        <h2 className="at-mobile-locked-title">Talk to the people in your story</h2>
        <p className="at-mobile-locked-body">
          Sit down with the NPCs you've met and talk through your adventures — in their
          voice, with memory of what you did together. A premium companion to your chronicle.
        </p>
        <div className="at-mobile-locked-badge">Premium · coming soon</div>
        {canSignIn && (
          <button className="at-btn at-btn-primary" onClick={onGoToAccount}>
            Sign in to get early access
          </button>
        )}
      </div>
    </div>
  );
}

// ── Hero tab (read-only sheet) ───────────────────────────────────────────────
function MobileHero({
  bible, isDemo, onGoToAccount,
}: { bible: CharacterBible | null; isDemo: boolean; onGoToAccount: () => void }) {
  if (!bible) {
    return (
      <div className="at-mobile-pane">
        <div className="at-mobile-handoff">
          <p className="at-kicker">✦ Your hero</p>
          <h2 className="at-mobile-locked-title">No hero yet</h2>
          <p className="at-mobile-locked-body">
            Heroes are born on your PC — install the Aftertale addon and play, or roll one
            in the desktop app. Your chronicle then follows you here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="at-mobile-pane">
      <article className="at-mobile-hero">
        <header className={`at-mobile-hero-head at-faction-${(bible.faction || '').toLowerCase()}`}>
          <h2>{bible.name}</h2>
          <div className="at-mobile-hero-pills">
            <span>{bible.faction}</span>
            <span>{bible.race} {bible.class}</span>
            {typeof bible.level === 'number' && <span>Lvl {bible.level}</span>}
            {bible.currentZone && <span>{bible.currentZone}</span>}
          </div>
        </header>

        {bible.coreQuote && <p className="at-mobile-hero-quote">"{bible.coreQuote}"</p>}

        {bible.backstory && (
          <section className="at-mobile-hero-section">
            <h3>Backstory</h3>
            {bible.backstory.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
          </section>
        )}

        <HeroList title="Beliefs" items={bible.beliefs} />
        <HeroList title="Motivations" items={bible.motivations} />
        <HeroList title="Fears" items={bible.fears} />
        <HeroList title="Flaws" items={bible.flaws} />

        {bible.voice && (
          <section className="at-mobile-hero-section">
            <h3>Voice</h3>
            <p>{bible.voice}</p>
          </section>
        )}

        {isDemo ? (
          <div className="at-mobile-hero-foot">
            <p>This is Magnus, our demo hero.</p>
            <button className="at-btn at-btn-primary" onClick={onGoToAccount}>
              Start your own
            </button>
          </div>
        ) : (
          <p className="at-mobile-hero-editnote">
            Edit your hero in the Aftertale desktop app.
          </p>
        )}
      </article>
    </div>
  );
}

function HeroList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="at-mobile-hero-section">
      <h3>{title}</h3>
      <ul>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </section>
  );
}

// ── You tab (account + notifications, NO BYOK) ───────────────────────────────
function MobileYou() {
  const { status, email } = useAuth();

  return (
    <div className="at-mobile-pane">
      <div className="at-mobile-you">
        <p className="at-kicker">✦ Your account</p>
        <h2 className="at-mobile-locked-title">You</h2>

        {status === 'disabled' ? (
          <p className="at-mobile-locked-body">
            Accounts aren't enabled in this build yet. Your chronicle reads locally on this device.
          </p>
        ) : status === 'authed' ? (
          <>
            <p className="at-mobile-locked-body">Signed in as <strong>{email}</strong>. Your chronicle is backed up to the cloud.</p>
            <div className="at-mobile-you-account"><AccountMenu /></div>
          </>
        ) : (
          <>
            <p className="at-mobile-locked-body">
              Sign in to keep your chronicle safe across devices and unlock premium features.
            </p>
            <div className="at-mobile-you-account"><AccountMenu /></div>
          </>
        )}

        <section className="at-mobile-hero-section" style={{ marginTop: '1.5rem', opacity: 0.6 }}>
          <h3>Notifications</h3>
          <p>Get a ping when a new chapter is ready after you log out of WoW. Coming soon.</p>
        </section>
      </div>
    </div>
  );
}

// ── Shared: demo sign-in banner ──────────────────────────────────────────────
function DemoBanner({ onGoToAccount }: { onGoToAccount: () => void }) {
  const { status } = useAuth();
  if (status === 'disabled') {
    return (
      <div className="at-mobile-demobanner">
        <span>You're reading <strong>Magnus</strong>, our demo hero — a taste of what your own chronicle becomes.</span>
      </div>
    );
  }
  return (
    <div className="at-mobile-demobanner">
      <span>This is a demo chronicle. Sign in to start your own.</span>
      <button className="at-btn at-btn-primary at-btn-sm" onClick={onGoToAccount}>Sign in</button>
    </div>
  );
}
