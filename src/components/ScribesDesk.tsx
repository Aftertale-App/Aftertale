// ============================================================================
// The Inkwell — the Free/BYOK authoring workflow page.
//
// Flow: (1) Import save file → (2) Write session cards. The session cards own
// generate / publish / unpublish / per-beat enrichment. Story-beat curation
// lives in lib/storyBeats.ts; the only user-tunable curation knob (loot
// quality floor) sits inline next to "Add manual entry".
//
// Free-tier users live here. Paid Companion+ users get this all done for
// them by the desktop daemon (which produces the same .lua restore file).
//
// See docs/companion-architecture.md for the bigger picture.
//
// Refactored out of ChronicleReader.tsx (which is now pure-read) on
// 2026-05-26. Bulk filter/enrich/export panels removed on 2026-05-28 in
// favor of per-session card authoring.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AddonImport,
  ImportDoneSummary,
  ImportInlineMessage,
  MultiHeroImportCard,
  importButtonLabel,
  useAftertaleLuaImport,
} from './AddonImport';
import ManualEntryDialog from './ManualEntryDialog';
import { SessionTrail } from './SessionTrail';
import { loadBible } from '../lib/bibleStore';
import {
  clearFileHandle,
  ensureReadPermission,
  isFileSystemAccessSupported,
  loadFileHandle,
  pickFileWithHandle,
  saveFileHandle,
} from '../lib/fileHandleStore';
import {
  IMPORT_TRACKER_UPDATED_EVENT,
  loadImportRecord,
  type ImportRecord,
} from '../lib/importTracker';
import { loadAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import { buildChronicleSessions } from '../lib/sessionHistory';
import {
  DEFAULT_STORY_BEAT_SETTINGS,
  loadStoryBeatSettings,
  saveStoryBeatSettings,
  STORY_BEAT_SETTINGS_UPDATED_EVENT,
  type LootQuality,
} from '../lib/storyBeatSettings';
import type { CharacterBible } from '../types';

/**
 * Shown in Step 2 when the active hero has no observed play. A web-made hero
 * (or one not in your save file) gets a story two ways — authored by hand here,
 * or played in WoW and imported. No "switch to another hero" — that routing now
 * lives in the import roster above; this is purely about *this* hero.
 */
function NoPlayYetPrompt({ heroName, onAuthor }: { heroName: string; onAuthor: () => void }) {
  return (
    <div
      className="at-callout"
      style={{
        borderColor: 'rgba(212, 163, 115, 0.4)',
        background: 'rgba(212, 163, 115, 0.08)',
      }}
    >
      <strong style={{ color: 'var(--gold-bright)', fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>
        {heroName} has no recorded play yet.
      </strong>
      <p className="muted" style={{ fontSize: '0.92rem', margin: '0.4rem 0 0.6rem', lineHeight: 1.5 }}>
        This character isn't in your imported save file. Give {heroName} a story two ways:
      </p>
      <ul style={{ margin: '0 0 0.9rem', paddingLeft: '1.1rem', fontSize: '0.92rem', lineHeight: 1.6 }}>
        <li>
          <strong>Author by hand</strong> — write {heroName}'s chapters yourself, right here.
        </li>
        <li>
          <strong>Play in World of Warcraft</strong> — create {heroName} in-game, play, then
          import your <code>Aftertale.lua</code> to capture it.
        </li>
      </ul>
      <button type="button" className="at-btn at-btn-primary" onClick={onAuthor}>
        ✍ Author by hand
      </button>
    </div>
  );
}

export function ScribesDesk() {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  const [records, setRecords] = useState<AddonEventRecord[]>(() => loadAddonEventRecords());
  const [manualOpen, setManualOpen] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string | undefined>();
  const characterKey = bible ? String(bible.createdAt) : null;
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(() =>
    loadImportRecord(characterKey),
  );

  useEffect(() => {
    const onBible = (e: Event) => {
      const detail = (e as CustomEvent<CharacterBible | null>).detail;
      setBible(detail ?? loadBible());
    };
    window.addEventListener('at:bible-updated', onBible);
    return () => window.removeEventListener('at:bible-updated', onBible);
  }, []);

  useEffect(() => {
    const onAddon = () => setRecords(loadAddonEventRecords());
    window.addEventListener('at:addon-events-updated', onAddon);
    window.addEventListener('storage', onAddon);
    return () => {
      window.removeEventListener('at:addon-events-updated', onAddon);
      window.removeEventListener('storage', onAddon);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setImportRecord(loadImportRecord(characterKey));
    refresh();
    window.addEventListener(IMPORT_TRACKER_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(IMPORT_TRACKER_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [characterKey]);

  useEffect(() => {
    const onOpenSession = (event: Event) => {
      const sessionId = (event as CustomEvent<string>).detail;
      if (!sessionId) return;
      setFocusedSessionId(sessionId);
      window.dispatchEvent(new CustomEvent('at:scroll-to-session', { detail: sessionId }));
    };
    window.addEventListener('at:open-inkwell-session', onOpenSession);
    return () => window.removeEventListener('at:open-inkwell-session', onOpenSession);
  }, []);

  const scopedRecords = useMemo(
    () => (characterKey ? records.filter((r) => r.characterKey === characterKey) : []),
    [records, characterKey],
  );
  const sessions = useMemo(
    () => (bible ? buildChronicleSessions(scopedRecords, bible.name) : []),
    [bible, scopedRecords],
  );

  return (
    <>
      <style>{`
        .desk-main {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          min-width: 0;
        }
        .inkwell-cards-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .inkwell-import-strip {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 0.9rem;
          border: 1px solid rgba(164,122,209,0.3);
          border-radius: 0.75rem;
          background: linear-gradient(135deg, rgba(164,122,209,0.16), rgba(164,122,209,0.05));
        }
        .inkwell-import-strip-copy {
          flex: 1 1 320px;
          min-width: 0;
        }
        .inkwell-import-strip-copy p {
          margin: 0;
          line-height: 1.45;
        }
        .inkwell-import-link {
          background: none;
          border: none;
          padding: 0;
          color: var(--gold);
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
          font: inherit;
        }
        .inkwell-import-link:hover {
          color: var(--gold-bright);
        }
        .inkwell-import-strip-action {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 0.5rem;
        }
      `}</style>
      <div className="desk-main">
          <header className="at-desk-intro">
            <p className="at-kicker">✦ The Inkwell</p>
            <h2 className="at-section-headline">Turn your sessions into chapters</h2>
            <p className="at-section-sub">
              Each session you've imported is waiting below. Open one, let the loremaster draft it
              into prose in your hero's voice, add notes of your own, then publish the chapter to
              your Chronicle. Nothing reaches the page until you say so.
            </p>
          </header>

          {importRecord && (
            <InkwellImportStrip importRecord={importRecord} sessionCount={sessions.length} />
          )}

          {/* Only ask for the file when nothing has been imported yet. Once a save
              is in (the strip above shows "last imported"), re-imports happen from
              that strip's button — never re-prompt the full drop zone again. */}
          {!importRecord && scopedRecords.length === 0 && (
            <Step
              number={1}
              title="Import your save file"
              helper="The importer will walk you through where to find it."
            >
              <AddonImport />
            </Step>
          )}

          {bible && (
            sessions.length === 0 ? (
              <NoPlayYetPrompt heroName={bible.name} onAuthor={() => setManualOpen(true)} />
            ) : (
              <section className="inkwell-cards-section">
                {characterKey && (
                  <div className="inkwell-cards-controls">
                    <LootFloorPicker characterKey={characterKey} />
                  </div>
                )}
                <SessionTrail
                  sessions={sessions}
                  bible={bible}
                  defaultSessionId={focusedSessionId}
                  onSessionFocus={setFocusedSessionId}
                />
              </section>
            )
          )}

          {!bible && (
            <div className="at-callout" style={{ padding: '0.75rem 1rem' }}>
              Roll or select a character first — The Inkwell needs a codex to know whose voice it's writing in.
            </div>
          )}
      </div>

      {bible && (
        <ManualEntryDialog
          bible={bible}
          open={manualOpen}
          onClose={() => setManualOpen(false)}
          defaultSessionId={focusedSessionId}
        />
      )}
    </>
  );
}

function InkwellImportStrip({
  importRecord,
  sessionCount,
}: {
  importRecord: ImportRecord | null;
  sessionCount: number;
}) {
  const {
    state,
    handleFile,
    commitAll,
    addHero,
    openHero,
    cancelPreview,
  } = useAftertaleLuaImport({ mode: 'smart' });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isBusy = state.status === 'checking' || state.status === 'parsing' || state.status === 'committing';
  const bible = loadBible();
  const characterKey = bible ? String(bible.createdAt) : null;
  const [hasRememberedHandle, setHasRememberedHandle] = useState<boolean>(false);
  const fsaSupported = isFileSystemAccessSupported();

  useEffect(() => {
    let cancelled = false;
    if (!characterKey || !fsaSupported) {
      setHasRememberedHandle(false);
      return;
    }
    void loadFileHandle(characterKey).then((h) => {
      if (!cancelled) setHasRememberedHandle(Boolean(h));
    });
    return () => {
      cancelled = true;
    };
  }, [characterKey, fsaSupported, importRecord]);

  async function tryReadRememberedHandle(): Promise<boolean> {
    if (!characterKey || !fsaSupported) return false;
    const handle = await loadFileHandle(characterKey);
    if (!handle) return false;
    const ok = await ensureReadPermission(handle);
    if (!ok) return false;
    try {
      const file = await handle.getFile();
      await handleFile(file);
      return true;
    } catch {
      // Handle is stale (file moved/deleted) — drop it so the next click
      // re-prompts the picker.
      await clearFileHandle(characterKey);
      setHasRememberedHandle(false);
      return false;
    }
  }

  async function onImportClick() {
    // Path 1: we already remember this character's .lua → instant re-read.
    if (await tryReadRememberedHandle()) return;

    // Path 2: File System Access API available but no remembered handle →
    // show the picker, remember the handle, read the file.
    if (fsaSupported) {
      const picked = await pickFileWithHandle();
      if (picked) {
        if (characterKey) {
          await saveFileHandle(characterKey, picked.handle);
          setHasRememberedHandle(true);
        }
        await handleFile(picked.file);
        return;
      }
      // User cancelled. Don't fall through to the input — they meant cancel.
      return;
    }

    // Path 3: legacy browser — fall back to <input type="file">.
    inputRef.current?.click();
  }

  async function onChangeFile() {
    if (characterKey) {
      await clearFileHandle(characterKey);
      setHasRememberedHandle(false);
    }
    // Immediately re-trigger the picker so it's one click, not two.
    if (fsaSupported) {
      const picked = await pickFileWithHandle();
      if (picked && characterKey) {
        await saveFileHandle(characterKey, picked.handle);
        setHasRememberedHandle(true);
        await handleFile(picked.file);
      }
    } else {
      inputRef.current?.click();
    }
  }

  return (
    <section className="inkwell-import-strip" aria-label="Import latest Aftertale.lua">
      <div className="inkwell-import-strip-copy">
        {importRecord ? (
          <p>
            📜 Last imported {timeAgo(importRecord.importedAt)}.{' '}
            {sessionCount.toLocaleString()} session{sessionCount === 1 ? '' : 's'} in the Chronicle{' '}
            from this file.
            {hasRememberedHandle && (
              <>
                {' '}
                <button type="button" className="inkwell-import-link" onClick={onChangeFile}>
                  Change file
                </button>
              </>
            )}
          </p>
        ) : (
          <p>📜 Start your saga — import your Aftertale.lua to see your sessions appear here.</p>
        )}
        {state.status === 'up-to-date' && (
          <ImportInlineMessage tone="passive">
            No new entries — your save file matches your last import.
          </ImportInlineMessage>
        )}
        {state.status === 'done' && typeof state.newEvents === 'number' && (
          <ImportInlineMessage tone="fresh">
            ✨ Picked up {state.newEvents.toLocaleString()} new events since your last import
          </ImportInlineMessage>
        )}
        {state.status === 'preview' && state.plan && (
          <MultiHeroImportCard
            state={state}
            onImport={(sel) => commitAll(sel)}
            onCancel={cancelPreview}
          />
        )}
        {state.status === 'done' && state.multiResult && (
          <ImportDoneSummary state={state} onOpen={openHero} onAddHero={addHero} />
        )}
        {state.status === 'error' && (
          <div
            className="at-callout-danger"
            style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem' }}
          >
            <strong>Import failed:</strong> {state.error}
          </div>
        )}
      </div>
      <div className="inkwell-import-strip-action">
        <button
          type="button"
          className="at-btn at-btn-primary"
          onClick={() => void onImportClick()}
          disabled={isBusy}
          title={
            hasRememberedHandle
              ? 'Re-reads the same Aftertale.lua you imported before — no picker.'
              : undefined
          }
        >
          {importButtonLabel(
            state,
            hasRememberedHandle ? '📜 Pull latest from saved file' : '📜 Import latest Aftertale.lua',
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".lua,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}

function timeAgo(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return 'just now';
  if (elapsed < hour) {
    const value = Math.floor(elapsed / minute);
    return `${value} minute${value === 1 ? '' : 's'} ago`;
  }
  if (elapsed < day) {
    const value = Math.floor(elapsed / hour);
    return `${value} hour${value === 1 ? '' : 's'} ago`;
  }
  const value = Math.floor(elapsed / day);
  return `${value} day${value === 1 ? '' : 's'} ago`;
}

// ----------------------------------------------------------------------------
// Tier upsell — production-ready pitch card. Sits above the workflow steps so
// users see the magic moment + the tier comparison before they roll up their
// sleeves. Pricing is the launch straw-man; revisit before billing goes live.
//
// CTAs are wired to a `at:upgrade-clicked` window event for now — Stripe
// Checkout will replace this handler when billing lands.
// ----------------------------------------------------------------------------

interface TierDef {
  id: string;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  pitch: string;
  bullets: string[];
  closer?: string;
  cta: string;
  highlight?: boolean;
  ctaVariant?: 'primary' | 'secondary' | 'ghost';
}

export const TIERS: TierDef[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'The Artisan writes their own story.',
    pitch:
      "No subscription. No automation. Just you, your OpenRouter key, and a blank chronicle waiting to be filled.",
    bullets: [
      '1 hero',
      'Manual import — you control what goes in',
      'Your OpenRouter key, your model choice — Claude, Gemini, whatever you prefer',
      'Desktop reader included',
    ],
    closer: 'Free stays free. Your chronicle stays yours.',
    cta: 'Save your chronicle',
    ctaVariant: 'secondary',
  },
  {
    id: 'companion',
    name: 'Companion',
    price: '$12',
    cadence: '/ month',
    tagline: 'The Companion is with you.',
    pitch:
      "Your session ends. Your story doesn't. Automation handles everything — your run becomes a chapter, your phone gets the ping.",
    bullets: [
      '3 heroes',
      'Gameplay monitoring — no manual import, ever',
      'AI turns your session into cinematic prose',
      'Cloud sync, mobile delivery, and a push notification the moment your chapter is ready',
    ],
    cta: 'Begin the chronicle',
    highlight: true,
    ctaVariant: 'primary',
  },
  {
    id: 'chronicler',
    name: 'Chronicler',
    price: '$24',
    cadence: '/ month',
    tagline: 'The Chronicler keeps the record.',
    pitch:
      'Everything in Companion — plus your chronicle becomes a permanent artifact. A real book you can hold, send, or save for someone who matters.',
    bullets: [
      '10 heroes',
      'ePub & PDF export — put it on a Kindle, send it to your dad, save it for your daughter',
      "Chapter regeneration — didn't love a chapter? Try another take. Keep the best one.",
      'Hero codex polish — AI helps you deepen and evolve your character as the story grows',
      "Saga memory — your hero's arc carries forward across every chapter, automatically",
    ],
    cta: 'Keep the book',
    ctaVariant: 'secondary',
  },
  {
    id: 'loremaster',
    name: 'Loremaster',
    price: '$49',
    cadence: '/ month',
    tagline: 'The Loremaster owns the canon.',
    pitch:
      'Everything in Chronicler — plus your hero earns a name in the world. A URL. A voice.',
    bullets: [
      'Unlimited heroes',
      'Public hero page — chronicles.gg/youralvarius — your story as a polished web read, shareable with anyone',
      'Audio narration — every chapter as a listenable cut, with consistent per-NPC voices',
      'Priority access — first in line for everything we ship next',
    ],
    cta: 'Claim your canon',
    ctaVariant: 'secondary',
  },
];

export function TierCard({ tier, onUpgrade }: { tier: TierDef; onUpgrade: () => void }) {
  const isHighlight = !!tier.highlight;
  return (
    <article
      style={{
        position: 'relative',
        border: isHighlight
          ? '2px solid var(--cp-accent, #a47ad1)'
          : '1px solid rgba(255,255,255,0.18)',
        borderRadius: '0.6rem',
        padding: '1.1rem 1.1rem 1.1rem',
        background: isHighlight
          ? 'rgba(107,74,142,0.22)'
          : 'rgba(0,0,0,0.32)',
        color: 'var(--cp-text, #f0e6d2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: isHighlight ? '0 4px 16px rgba(107,74,142,0.25)' : 'none',
      }}
    >
      {isHighlight && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            right: 12,
            background: 'var(--cp-accent, #a47ad1)',
            color: '#1a0e2e',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '3px 10px',
            borderRadius: 999,
          }}
        >
          Most popular · Best story
        </span>
      )}

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p
          style={{
            margin: 0,
            fontSize: 10.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.65,
            fontWeight: 600,
          }}
        >
          {tier.name} · {tier.cadence === 'forever' ? 'forever' : tier.cadence.replace('/ ', '')}
        </p>
        <h4
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            color: 'inherit',
            lineHeight: 1.2,
          }}
        >
          {tier.tagline}
        </h4>
        <p style={{ margin: '0.15rem 0 0', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'inherit' }}>{tier.price}</span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>{tier.cadence}</span>
        </p>
      </header>

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, opacity: 0.95 }}>
        {tier.pitch}
      </p>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        {tier.bullets.map((b, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 8,
              fontSize: 13.5,
              lineHeight: 1.5,
              opacity: 0.95,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: '0 0 auto',
                color: 'var(--cp-accent, #a47ad1)',
                fontWeight: 700,
                paddingTop: 1,
              }}
            >
              ✦
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {tier.closer && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontStyle: 'italic',
            opacity: 0.85,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            paddingTop: '0.6rem',
          }}
        >
          {tier.closer}
        </p>
      )}

      <div style={{ flex: 1 }} />
      <button
        type="button"
        className={tier.ctaVariant === 'primary' ? 'at-btn at-btn-primary' : 'at-btn at-btn-secondary'}
        onClick={onUpgrade}
        disabled={tier.ctaVariant === 'ghost'}
        style={{ marginTop: 4 }}
      >
        {tier.cta}
      </button>
    </article>
  );
}

function Step({
  number,
  title,
  helper,
  children,
}: {
  number: number;
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--cp-border, rgba(0,0,0,0.12))',
        borderRadius: '0.6rem',
        padding: '1rem 1.1rem',
        background: 'var(--cp-surface-soft, rgba(0,0,0,0.02))',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--cp-accent, #6b4a8e)',
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            flex: '0 0 auto',
          }}
        >
          {number}
        </span>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{title}</h3>
      </header>
      {helper && (
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: 13 }}>
          {helper}
        </p>
      )}
      {children}
    </section>
  );
}

// ----------------------------------------------------------------------------
// LootFloorPicker — the single curation knob users still get over what
// surfaces as a story beat. Everything else is locked to STORY_BEAT_KINDS.
// ----------------------------------------------------------------------------

const LOOT_FLOOR_LABELS: Record<LootQuality, string> = {
  common: 'Common+',
  uncommon: 'Uncommon+',
  rare: 'Rare+',
  epic: 'Epic+',
  legendary: 'Legendary only',
};

function LootFloorPicker({ characterKey }: { characterKey: string }) {
  const [floor, setFloor] = useState<LootQuality>(
    () => loadStoryBeatSettings(characterKey).lootQualityFloor,
  );

  useEffect(() => {
    setFloor(loadStoryBeatSettings(characterKey).lootQualityFloor);
    const onUpdate = () => setFloor(loadStoryBeatSettings(characterKey).lootQualityFloor);
    window.addEventListener(STORY_BEAT_SETTINGS_UPDATED_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(STORY_BEAT_SETTINGS_UPDATED_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [characterKey]);

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontSize: '0.82rem',
        color: 'var(--cp-text-muted, #888)',
      }}
      title="Loot below this quality is treated as telemetry, not a story beat."
    >
      <span aria-hidden="true">🎁</span>
      Loot floor:
      <select
        value={floor}
        onChange={(e) => {
          const next = e.target.value as LootQuality;
          setFloor(next);
          saveStoryBeatSettings(characterKey, {
            ...loadStoryBeatSettings(characterKey),
            lootQualityFloor: next,
          });
        }}
        style={{ fontSize: '0.82rem', padding: '0.15rem 0.35rem' }}
      >
        {(Object.keys(LOOT_FLOOR_LABELS) as LootQuality[]).map((q) => (
          <option key={q} value={q}>
            {LOOT_FLOOR_LABELS[q]}
          </option>
        ))}
      </select>
      {floor !== DEFAULT_STORY_BEAT_SETTINGS.lootQualityFloor && (
        <span style={{ opacity: 0.6 }}>· default {LOOT_FLOOR_LABELS[DEFAULT_STORY_BEAT_SETTINGS.lootQualityFloor]}</span>
      )}
    </label>
  );
}
