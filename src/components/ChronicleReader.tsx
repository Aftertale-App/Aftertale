import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { loadBible, clearAddonHistoryEntries, removeAddonHistoryEntriesByEventIds, deleteHistoryEntry } from '../lib/bibleStore';
import { DEV_TOOLS_ENABLED } from '../lib/devTools';
import { loadAddonEventRecords, clearAddonEventRecords, removeAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import {
  clearEnrichments,
  removeEnrichments,
} from '../lib/enrichmentStore';
import { buildChronicleSessions } from '../lib/sessionHistory';
import { Reveal } from './Reveal';
import ManualEntryDialog from './ManualEntryDialog';
import type { CharacterBible, HistoryEntry } from '../types';

const SESSION_WINDOW_MS = 9 * 60 * 60 * 1000;

type ReaderMode = 'latest' | 'full';

interface Chapter {
  id: string;
  title: string;
  entries: HistoryEntry[];
  zones: string[];
  start: number;
  end: number;
  startLevel?: number;
  endLevel?: number;
}

export function ChronicleReader() {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  const [mode, setMode] = useState<ReaderMode>('latest');
  const [addonRecords, setAddonRecords] = useState<AddonEventRecord[]>(() => loadAddonEventRecords());
  const [manualOpen, setManualOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const chapterRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<CharacterBible | null>).detail;
      setBible(detail ?? loadBible());
    };
    window.addEventListener('at:bible-updated', onUpdate);
    return () => window.removeEventListener('at:bible-updated', onUpdate);
  }, []);

  useEffect(() => {
    const onAddonUpdate = () => setAddonRecords(loadAddonEventRecords());
    window.addEventListener('at:addon-events-updated', onAddonUpdate);
    window.addEventListener('storage', onAddonUpdate);
    return () => {
      window.removeEventListener('at:addon-events-updated', onAddonUpdate);
      window.removeEventListener('storage', onAddonUpdate);
    };
  }, []);

  useEffect(() => {
    const onModeRequest = (event: Event) => {
      const detail = (event as CustomEvent<ReaderMode>).detail;
      if (detail === 'latest' || detail === 'full') {
        setMode(detail);
      }
    };
    window.addEventListener('at:chronicle-mode', onModeRequest);
    return () => window.removeEventListener('at:chronicle-mode', onModeRequest);
  }, []);

  const entries = useMemo(
    () => [...(bible?.history ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [bible],
  );
  const characterKey = bible ? String(bible.createdAt) : null;
  const scopedAddonRecords = useMemo(
    () => (characterKey ? addonRecords.filter((record) => record.characterKey === characterKey) : []),
    [addonRecords, characterKey],
  );
  const sessions = useMemo(
    () => (bible ? buildChronicleSessions(scopedAddonRecords, bible.name) : []),
    [bible, scopedAddonRecords],
  );
  // Ghost pills (Phase 3): sessions the addon observed that haven't been
  // committed as a Chronicle chapter yet. The recap commit path writes a
  // HistoryEntry with the stable id `recap_<sessionId>`, so anything missing
  // that marker is fair game for a "write me up" CTA. Sorted oldest-first to
  // match committed-chapter order in the Arc Map.
  const ghostSessions = useMemo(() => {
    if (sessions.length === 0) return [];
    const committed = new Set<string>();
    for (const e of entries) {
      if (typeof e.id === 'string' && e.id.startsWith('recap_')) {
        committed.add(e.id.slice('recap_'.length));
      }
    }
    return sessions
      .filter((s) => !committed.has(s.id))
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [sessions, entries]);
  const latestEntries = useMemo(() => latestSessionEntries(entries), [entries]);
  const visibleEntries = mode === 'full' ? entries : latestEntries;
  const visibleChapters = useMemo(() => buildChapters(visibleEntries), [visibleEntries]);
  const insight = bible ? buildInsight(bible, visibleEntries, entries, visibleChapters.length) : null;
  const hasStoryData = entries.length > 0 || sessions.length > 0;

  // Arc Map active-pill tracking: watch each rendered chapter heading and mark
  // the most-visible one as active. The pill list highlights it so the user
  // always knows where they are in the scroll.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const refs = chapterRefs.current;
    if (refs.size === 0) return;

    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const id = (change.target as HTMLElement).dataset.chapterId;
          if (!id) continue;
          visibility.set(id, change.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibility) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestRatio > 0) setActiveChapterId(bestId);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of refs.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [mode, visibleChapters]);

  function scrollToChapter(chapterId: string) {
    const el = chapterRefs.current.get(chapterId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveChapterId(chapterId);
  }


  useEffect(() => {
    const onReadSession = (event: Event) => {
      const chapterId = (event as CustomEvent<string>).detail;
      if (!chapterId) return;
      setMode('full');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToChapter(chapterId));
      });
    };
    window.addEventListener('at:read-session-chapter', onReadSession);
    return () => window.removeEventListener('at:read-session-chapter', onReadSession);
  }, [visibleChapters]);

  function jumpToGhostSession(sessionId: string) {
    window.dispatchEvent(new CustomEvent('at:request-tab', { detail: 'desk' }));
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent('at:open-inkwell-session', { detail: sessionId }),
      );
    });
  }

  function requestTab(tab: string) {
    window.dispatchEvent(new CustomEvent('at:request-tab', { detail: tab }));
  }

  if (!bible) {
    return (
      <section className="at-panel at-chronicle-reader at-chronicle-empty-shell">
        <header className="at-section-intro">
          <p className="at-kicker">✦ Story ledger</p>
          <h2 className="at-section-headline">Your Chronicle awaits</h2>
          <p className="at-section-sub">
            Select or roll a hero first. The Chronicle turns quest turn-ins, levels, zones, and manual notes
            into the story you read after a session.
          </p>
          <div className="at-section-ornament" aria-hidden="true">✦</div>
        </header>
        <div className="at-chronicle-empty-actions">
          <button className="at-btn at-btn-primary" onClick={() => requestTab('character')}>
            Choose a hero
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="at-panel at-chronicle-reader">
      <header className="at-chronicle-hero">
        <div>
          <p className="at-kicker">✦ Story ledger</p>
          <h2 className="at-section-headline">{bible.name}'s Chronicle</h2>
          <p className="at-section-sub">
            The "so what" layer: read the session, scan the arc, then generate a campfire recap when the log deserves prose.
          </p>
        </div>
        <div className="at-chronicle-hero-pills">
          <span>{bible.faction}</span>
          <span>{bible.race} {bible.class}</span>
          {typeof bible.level === 'number' && <span>Lvl {bible.level}</span>}
          {bible.currentZone && <span>{bible.currentZone}</span>}
        </div>
      </header>

      <div className="at-chronicle-modebar" role="tablist" aria-label="Chronicle view">
        <button
          className="at-btn at-btn-secondary"
          aria-pressed={mode === 'latest'}
          onClick={() => {
            setMode('latest');
          }}
        >
          Latest session
        </button>
        <button
          className="at-btn at-btn-secondary"
          aria-pressed={mode === 'full'}
          onClick={() => {
            setMode('full');
          }}
        >
          Full saga
        </button>
        <span className="at-chronicle-modebar-spacer" />
        <button
          className="at-btn at-btn-secondary"
          onClick={() => setManualOpen(true)}
          title="Add a chronicle entry by hand"
        >
          ✦ Add manual entry
        </button>
        {scopedAddonRecords.length > 0 && (
          <PurgeChronicleButton
            characterKey={characterKey}
            characterName={bible?.name ?? null}
            recordCount={scopedAddonRecords.length}
          />
        )}
      </div>

      {!hasStoryData ? (
        <div className="at-chronicle-empty">
          <p className="at-kicker">✦ Not yet written</p>
          <h3 className="at-section-headline-sm">No story entries yet</h3>
          <p className="at-section-sub">
            Visit <strong>The Inkwell</strong> to import your <code>Aftertale.lua</code> and start writing your saga.
          </p>
          <div className="at-chronicle-empty-actions" style={{ marginTop: '1rem' }}>
            <button className="at-btn at-btn-primary" onClick={() => requestTab('desk')}>
              Open The Inkwell
            </button>
            {DEV_TOOLS_ENABLED && (
              <button className="at-btn at-btn-secondary" onClick={() => requestTab('addon')}>
                Addon Sim
              </button>
            )}
            <button className="at-btn at-btn-secondary" onClick={() => setManualOpen(true)}>
              Add manual entry
            </button>
          </div>
        </div>
      ) : (
        <>
          {insight && <InsightGrid insight={insight} mode={mode} />}

            <section className="at-chronicle-book">
              <header>
                <div>
                  <p className="at-kicker">{mode === 'latest' ? 'Tonight at the table' : 'The road so far'}</p>
                  <h3>{mode === 'latest' ? latestSessionTitle(visibleEntries) : 'Full saga timeline'}</h3>
                </div>
                <span className="at-chronicle-count">{visibleChapters.length} {visibleChapters.length === 1 ? 'chapter' : 'chapters'}</span>
              </header>

              {visibleChapters.length === 0 ? (
                <p className="muted">No entries fall inside the latest-session window. Switch to Full saga.</p>
              ) : (
                <div className="at-chronicle-chapters">
                  {visibleChapters.map((chapter, i) => (
                    <Reveal key={chapter.id}>
                      <article
                        className="at-chronicle-chapter"
                        data-chapter-id={chapter.id}
                        ref={(el) => {
                          if (el) chapterRefs.current.set(chapter.id, el);
                          else chapterRefs.current.delete(chapter.id);
                        }}
                      >
                        <div className="at-chronicle-chapter-head">
                          <span className="at-chronicle-chapter-num">Chapter {i + 1}</span>
                          <h4>{chapter.title}</h4>
                          <span>{formatDateRange(chapter.start, chapter.end)}</span>
                          {characterKey && (
                            <PurgeChapterButton
                              chapter={chapter}
                              characterKey={characterKey}
                              chapterNumber={i + 1}
                            />
                          )}
                        </div>
                        <ol>
                          {chapter.entries.map((entry) => (
                            <li key={entry.id}>
                              <span>{formatEntryTime(entry.timestamp)}</span>
                              <div className="at-chronicle-entry-body">
                                {renderEntryParagraphs(entry.text)}
                              </div>
                              {entryContext(entry) && <small>{entryContext(entry)}</small>}
                            </li>
                          ))}
                        </ol>
                      </article>
                    </Reveal>
                  ))}
                </div>
              )}
            </section>

          {(visibleChapters.length > 0 || ghostSessions.length > 0) && (
            <section className="at-chronicle-arc-map">
              <p className="at-kicker">Arc map</p>
              <div>
                {visibleChapters.map((chapter, i) => {
                  const isActive = activeChapterId === chapter.id;
                  const prev = visibleChapters[i - 1];
                  const levelGained =
                    prev && typeof prev.endLevel === 'number' && typeof chapter.startLevel === 'number'
                      ? chapter.startLevel - prev.endLevel
                      : 0;
                  return (
                    <Fragment key={chapter.id}>
                      {levelGained > 0 && (
                        <span
                          className="at-arc-levelup"
                          title={`Leveled ${prev?.endLevel} → ${chapter.startLevel} between chapters`}
                          aria-hidden="true"
                        >
                          ⬆ Lvl {chapter.startLevel}
                        </span>
                      )}
                      <button
                        type="button"
                        className={`at-arc-pill${isActive ? ' is-active' : ''}`}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => scrollToChapter(chapter.id)}
                      >
                        {i + 1}. {chapter.title}
                      </button>
                    </Fragment>
                  );
                })}
                {ghostSessions.length > 0 && (
                  <>
                    {visibleChapters.length > 0 && (
                      <span className="at-arc-divider" aria-hidden="true">·</span>
                    )}
                    {ghostSessions.map((session) => {
                      const zone = session.endZone ?? session.startZone ?? 'The road';
                      const lvl =
                        typeof session.endLevel === 'number'
                          ? ` · Lvl ${session.endLevel}`
                          : '';
                      return (
                        <button
                          key={`ghost_${session.id}`}
                          type="button"
                          className="at-arc-pill at-arc-ghost"
                          onClick={() => jumpToGhostSession(session.id)}
                          title="Un-penned session — jump to The Inkwell to recap it"
                        >
                          ✎ {zone}{lvl}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {bible && (
        <ManualEntryDialog
          bible={bible}
          open={manualOpen}
          onClose={() => setManualOpen(false)}
        />
      )}
    </section>
  );
}

function latestSessionEntries(entries: HistoryEntry[]): HistoryEntry[] {
  if (entries.length === 0) return [];
  const latest = entries[entries.length - 1].timestamp;
  return entries.filter((entry) => latest - entry.timestamp <= SESSION_WINDOW_MS);
}


function buildChapters(entries: HistoryEntry[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (const entry of entries) {
    const zone = entry.zone?.trim() || 'The road';
    const last = chapters[chapters.length - 1];
    if (!last || !last.zones.includes(zone)) {
      chapters.push({
        id: `${entry.id}_chapter`,
        title: entry.title?.trim() || zone,
        entries: [entry],
        zones: [zone],
        start: entry.timestamp,
        end: entry.timestamp,
        startLevel: typeof entry.level === 'number' ? entry.level : undefined,
        endLevel: typeof entry.level === 'number' ? entry.level : undefined,
      });
      continue;
    }
    last.entries.push(entry);
    last.end = entry.timestamp;
    if (typeof entry.level === 'number') {
      if (typeof last.startLevel !== 'number') last.startLevel = entry.level;
      last.endLevel = entry.level;
    }
    // Promote a richer title if this entry has one and the chapter is still
    // using its zone fallback.
    if (entry.title?.trim() && last.title === zone) {
      last.title = entry.title.trim();
    }
  }
  return chapters;
}

function buildInsight(bible: CharacterBible, visibleEntries: HistoryEntry[], allEntries: HistoryEntry[], chapterCount: number) {
  const first = visibleEntries[0] ?? allEntries[0];
  const last = visibleEntries[visibleEntries.length - 1] ?? allEntries[allEntries.length - 1];
  const zones = unique(visibleEntries.map((entry) => entry.zone).filter((z): z is string => Boolean(z)));
  const levels = visibleEntries
    .map((entry) => entry.level)
    .filter((level): level is number => typeof level === 'number');
  const firstLevel = levels[0];
  const lastLevel = levels[levels.length - 1];
  const levelDelta =
    typeof firstLevel === 'number' && typeof lastLevel === 'number'
      ? Math.max(0, lastLevel - firstLevel)
      : 0;

  return {
    chapters: chapterCount,
    zones,
    levelDelta,
    firstText: first?.text ?? '',
    lastText: last?.text ?? '',
    pressure:
      bible.coreQuote?.trim()
      || bible.motivations[0]
      || bible.beliefs[0]
      || `${bible.name} is still deciding what kind of hero the road will make.`,
    nextHook: last
      ? `The next NPC should remember this: ${summarizeForHook(last.text)}`
      : 'Pen a session recap from The Inkwell, then this becomes a living story hook.',
  };
}

function summarizeForHook(raw: string, maxChars = 180): string {
  const cleaned = cleanRecapText(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  // Prefer cutting at a sentence boundary.
  const sliced = cleaned.slice(0, maxChars);
  const lastStop = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '));
  if (lastStop > maxChars * 0.5) return sliced.slice(0, lastStop + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trimEnd() + '…';
}

// Strip the LLM's markdown formatting before we display the recap as a
// chronicle chapter. The model loves to lead with a `# Title` line and bold
// the "So what changed" bullet header — both look like garbage when rendered
// as plain text in the chapter list.
export function cleanRecapText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').trim();
  // Drop a leading "# Title" line (and the blank line after it). The chapter
  // already has its own title (either auto-extracted from this line, or
  // zone-based as a fallback) so we don't want it inline.
  text = text.replace(/^#{1,6}\s+[^\n]*\n+/, '');
  // Convert **bold** / __bold__ to plain text.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1');
  // Convert *em* / _em_ to plain text (avoid eating bullet markers).
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2');
  // Normalize bullet lines so they render cleanly when paragraph-split.
  text = text.replace(/^[ \t]*[-*•][ \t]+/gm, '• ');
  // Defang em/en dashes and double-hyphens that the model loves to scatter
  // around. Sentence break ("X — Y") becomes ", "; mid-word ("9–11") becomes
  // a single hyphen.
  text = text.replace(/\s+[—–]\s+/g, ', ');
  text = text.replace(/[—–]/g, '-');
  text = text.replace(/\s+--\s+/g, ', ');
  // Collapse 3+ blank lines into a single paragraph break.
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// Pull the first `# Title` line out of a raw recap, if present. Returns the
// title without the leading hashes. Used so committed session recaps can set
// the chapter banner to something narrative ("The Quartermaster's Ledger")
// rather than just the zone name ("Anvilmar").
export function extractRecapTitle(raw: string): string | null {
  const m = raw.replace(/\r\n/g, '\n').trimStart().match(/^#{1,6}\s+([^\n]+)/);
  if (!m) return null;
  const title = m[1].trim().replace(/[—–]/g, '-');
  return title || null;
}

function renderEntryParagraphs(raw: string) {
  const text = cleanRecapText(raw);
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length === 0) return <p>{text}</p>;
  let leadApplied = false;
  const renderPlainPara = (content: string, key: number) => {
    if (leadApplied) return <p key={key}>{content}</p>;
    leadApplied = true;
    const m = content.match(/^(\S+)(\s+)([\s\S]*)$/);
    if (!m) return <p key={key}><span className="at-entry-leadword">{content}</span></p>;
    const [, lead, gap, rest] = m;
    return (
      <p key={key}>
        <span className="at-entry-leadword">{lead}</span>{gap}{rest}
      </p>
    );
  };
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const bulletLines = lines.filter((l) => l.startsWith('• '));
        const isBulletBlock = bulletLines.length > 0 && bulletLines.length === lines.length;
        if (isBulletBlock) {
          return (
            <ul key={i} className="at-entry-bullets">
              {bulletLines.map((line, li) => (
                <li key={li}>{line.replace(/^•\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        if (lines.length === 1 && lines[0].length < 60 && lines[0].endsWith(':')) {
          return <p key={i} className="at-entry-label">{lines[0]}</p>;
        }
        if (lines.length > 1) {
          // Multi-line non-bullet block; only apply lead-word to the very first line.
          const [firstLine, ...rest] = lines;
          if (!leadApplied) {
            leadApplied = true;
            const m = firstLine.match(/^(\S+)(\s+)([\s\S]*)$/);
            const head = m ? (
              <>
                <span className="at-entry-leadword">{m[1]}</span>{m[2]}{m[3]}
              </>
            ) : (
              <span className="at-entry-leadword">{firstLine}</span>
            );
            return (
              <p key={i}>
                {head}
                {rest.map((line, li) => (
                  <span key={li}><br />{line}</span>
                ))}
              </p>
            );
          }
          return (
            <p key={i}>
              {lines.map((line, li) => (
                <span key={li}>
                  {line}
                  {li < lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          );
        }
        return renderPlainPara(lines[0], i);
      })}
    </>
  );
}

function InsightGrid({
  insight,
  mode,
}: {
  insight: ReturnType<typeof buildInsight>;
  mode: ReaderMode;
}) {
  return (
    <div className="at-chronicle-insights">
      <article>
        <span>Session shape</span>
        <strong>{insight.chapters} {insight.chapters === 1 ? 'chapter' : 'chapters'}</strong>
        <p>
          {mode === 'latest' ? 'Latest-session window' : 'Full chronicle'} ·{' '}
          {insight.zones.length > 0 ? insight.zones.join(' → ') : 'no zone snapshots yet'}
        </p>
      </article>
      <article>
        <span>Power shifted</span>
        <strong>{insight.levelDelta > 0 ? `+${insight.levelDelta} levels` : 'No level jump'}</strong>
        <p>{insight.levelDelta > 0 ? 'The road visibly changed the hero.' : 'The change was story-first, not stats-first.'}</p>
      </article>
      <article>
        <span>Character pressure</span>
        <strong>Why it matters</strong>
        <p>{insight.pressure}</p>
      </article>
      <article>
        <span>Next hook</span>
        <strong>Carry forward</strong>
        <p>{insight.nextHook}</p>
      </article>
    </div>
  );
}

function latestSessionTitle(entries: HistoryEntry[]): string {
  if (entries.length === 0) return 'Latest session';
  const zones = unique(entries.map((entry) => entry.zone).filter((z): z is string => Boolean(z)));
  if (zones.length === 0) return 'Latest session';
  if (zones.length === 1) return `Latest session in ${zones[0]}`;
  return `Latest session: ${zones[0]} to ${zones[zones.length - 1]}`;
}

function entryContext(entry: HistoryEntry): string {
  return [
    typeof entry.level === 'number' ? `Lvl ${entry.level}` : null,
    entry.zone,
  ]
    .filter(Boolean)
    .join(' · ');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function formatEntryTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateRange(start: number, end: number): string {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  if (start === end) return formatPromptTimestamp(start);
  if (sameDay) return `${formatPromptTimestamp(start)} - ${formatEntryTime(end)}`;
  return `${formatPromptTimestamp(start)} - ${formatPromptTimestamp(end)}`;
}

function formatPromptTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ----------------------------------------------------------------------------
// Inline purge controls — double-confirm, no permanent surface noise.
// Both share a 4-second auto-disarm.
// ----------------------------------------------------------------------------

function PurgeChronicleButton({
  characterKey,
  characterName,
  recordCount,
}: {
  characterKey: string | null;
  characterName: string | null;
  recordCount: number;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!characterKey) return null;

  return (
    <button
      type="button"
      className={`at-btn at-btn-danger at-btn-sm${armed ? ' at-btn-danger-armed' : ''}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        clearAddonEventRecords(characterKey);
        clearEnrichments(characterKey);
        clearAddonHistoryEntries();
        setArmed(false);
      }}
      title={
        armed
          ? 'Click again to confirm. Manual entries are preserved.'
          : `Purge all ${recordCount} addon-observed events${characterName ? ` for ${characterName}` : ''} (manual entries kept)`
      }
    >
      {armed ? '⚠ Click again to purge' : '✕ Purge chronicle'}
    </button>
  );
}

function PurgeChapterButton({
  chapter,
  characterKey,
  chapterNumber,
}: {
  chapter: Chapter;
  characterKey: string;
  chapterNumber: number;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const { addonEventIds, manualEntryIds } = useMemo(() => {
    const addon: string[] = [];
    const manual: string[] = [];
    for (const entry of chapter.entries) {
      if (typeof entry.id !== 'string') continue;
      if (entry.id.startsWith('addon_')) addon.push(entry.id.slice('addon_'.length));
      else manual.push(entry.id);
    }
    return { addonEventIds: addon, manualEntryIds: manual };
  }, [chapter.entries]);

  const total = addonEventIds.length + manualEntryIds.length;
  if (total === 0) return null;

  return (
    <button
      type="button"
      className={`at-btn at-btn-danger at-btn-sm at-session-purge${armed ? ' at-btn-danger-armed' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!armed) {
          setArmed(true);
          return;
        }
        if (addonEventIds.length > 0) {
          removeAddonEventRecords(addonEventIds);
          removeEnrichments(characterKey, addonEventIds);
          removeAddonHistoryEntriesByEventIds(addonEventIds);
        }
        for (const id of manualEntryIds) deleteHistoryEntry(id);
        setArmed(false);
      }}
      title={
        armed
          ? `Click again to confirm — wipes Chapter ${chapterNumber} (${total} entr${total === 1 ? 'y' : 'ies'})`
          : `Purge Chapter ${chapterNumber} (${total} entr${total === 1 ? 'y' : 'ies'}${manualEntryIds.length > 0 ? ` — includes ${manualEntryIds.length} manual` : ''})`
      }
      aria-label={armed ? `Confirm purge Chapter ${chapterNumber}` : `Purge Chapter ${chapterNumber}`}
    >
      {armed ? '⚠ Confirm' : '✕'}
    </button>
  );
}
