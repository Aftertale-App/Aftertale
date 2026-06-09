import { useEffect, useMemo, useState } from 'react';
import { MODEL_CHOICES, useSelectedModelIdx } from '../lib/modelChoices';
import { getKeyStatus } from '../lib/apiKeys';
import { appendSessionRecapChapters, removeAddonHistoryEntriesByEventIds, removeSessionRecapEntries } from '../lib/bibleStore';
import { parseChapters, recapSessionId } from '../lib/chapterParse';
import { renderEntryParagraphs } from './ChronicleReader';
import { threadContextForSession, formatThreadContext } from '../lib/threadLedger';
import { loadArcState, saveArcState, formatArcForPrompt, parseArcUpdate, applyArcUpdate } from '../lib/arcLedger';
import { removeAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import { ENRICHMENTS_UPDATED_EVENT, loadEnrichments, removeEnrichments, toParagraphMap } from '../lib/enrichmentStore';
import { loadSessionRecaps, removeSessionRecap, saveSessionRecap, SESSION_RECAPS_UPDATED_EVENT, type SessionRecapMap, type SessionRecapRecord } from '../lib/sessionRecapStore';
import { entryId } from '../lib/chronicleExport';
import { eventFactLine, type ChronicleSession } from '../lib/sessionHistory';
import { getSeedMode, type SeedMode } from '../lib/featureFlags';
import { pronounLine } from '../lib/pronouns';
import {
  beatGlyph, beatLabel, pickStoryBeats,
  sessionNarrativeScore, recommendChapterLength,
  CHAPTER_LENGTHS, CHAPTER_LENGTH_ORDER,
  type ChapterLength, type ChapterLengthId,
} from '../lib/storyBeats';
import type { SessionRegister } from '../lib/storyBeats';
import type { CharacterBible, HistoryEntry, LLMResponse, LLMProvider } from '../types';

// Strip the LLM's markdown formatting before we display the recap as a
// chronicle chapter. The model loves to lead with a `# Title` line and bold
// the "So what changed" bullet header — both look like garbage when rendered
// as plain text in the chapter list.
function cleanRecapText(raw: string): string {
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
function extractRecapTitle(raw: string): string | null {
  const m = raw.replace(/\r\n/g, '\n').trimStart().match(/^#{1,6}\s+([^\n]+)/);
  if (!m) return null;
  const title = m[1].trim().replace(/[—–]/g, '-');
  return title || null;
}

// The voice a chapter is written in, chosen by the session's register. This is
// the heart of landing non-combat storytelling: a fishing night must read like
// a fishing night, a battleground like a battle. See capture-expansion-scope §1.
const REGISTER_VOICE: Record<SessionRegister, string[]> = {
  adventuring: [
    'VOICE — Adventuring: the hero\'s-journey register. Momentum and stakes: the road taken, the choice made, what it cost and what it opened. Forward motion.',
  ],
  downtime: [
    'VOICE — Downtime (slice-of-life): this was a quiet session of craft, trade, or provisioning, NOT combat. Write it that way. Patience, mastery, the texture of the work — the heat of the forge, the lake at first light, the weight of coin earned honestly. Small triumphs land as small triumphs. Contemplative and grounded; do NOT manufacture danger or epic stakes that were not there. The quiet between adventures is the story.',
  ],
  martial: [
    'VOICE — Martial (glory and rivalry): this session was player-versus-player combat. Write the rush and the cost — the choke point held, the flag run, the rival who kept finding you, the hard-fought loss as much as the win. Name opponents where the facts give names; let rivalries carry across the prose. Visceral and tense, with the honor and bitterness real PvP carries.',
  ],
};

async function requestCampfireRecap(
  modelIdx: number,
  prompt: string,
  length: ChapterLength,
  register: SessionRegister,
  includeArc: boolean,
  continuity: string | null,
  innerJourney: string | null,
): Promise<LLMResponse> {
  // BYOK users author on their own key + model; keyless users go through the
  // hosted free gateway (the same path the cold-reveal generation uses).
  let provider: LLMProvider;
  if (getKeyStatus('openrouter').hasKey) {
    provider = await MODEL_CHOICES[modelIdx].factory();
  } else {
    const { GatewayProvider } = await import('../providers/GatewayProvider');
    provider = new GatewayProvider();
  }
  return provider.chat({
    task: 'summary',
    model: MODEL_CHOICES[modelIdx].pricingKey,
    maxTokens: length.maxTokens,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: [
          'You are the in-world chronicler for Aftertale.',
          'Write polished story prose from structured character-history notes.',
          'Use only the provided facts. Do not invent completed quests, locations, NPC relationships, or outcomes.',
          'Keep the hero as the subject. Do not mention prompts, models, localStorage, UI tabs, or the app.',
          '',
          ...REGISTER_VOICE[register],
          '- If a chapter covers a different kind of activity than the rest (e.g. a PvP fight inside a questing session), shift THAT chapter\'s voice to match: adventuring = the hero\'s journey; downtime = slice-of-life craft; martial = glory and rivalry.',
          '',
          'STYLE RULES (strict):',
          '- Never use em dashes (—) or en dashes (–). If you would reach for one, use a comma, semicolon, or period instead. Two hyphens (--) are also forbidden.',
          '- Avoid ellipses unless quoting a character. No "..." for dramatic pauses.',
          '- Avoid the cliche "not X, but Y" construction. Vary sentence rhythm.',
          '- Prefer concrete nouns and verbs over abstract sentiment. Show, don\'t narrate the feeling.',
          '',
          'PACING (important):',
          '- Scale the writing to what actually happened. Give each consequential beat (a death, a boss kill, an achievement, a hard-won quest completion, a dungeon cleared) its own moment on the page; do not summarize the big moments away.',
          '- Group or compress routine errands and repeated chores so they do not crowd out the moments that matter.',
          '- If there are more beats than the length allows, prioritize the most consequential and touch the rest briefly. Never silently drop a death, a boss kill, or a finished quest chain.',
          '',
          'SEGMENTATION:',
          '- Write this session as ONE OR MORE chapters. MOST sessions are a SINGLE chapter. Begin a new chapter ONLY at a genuine scene change: a new zone, a shift between questing / crafting / PvP, the completion of a quest arc, or a turning point (a death, a boss, a hard-won goal). A short or single-threaded session is ONE chapter. Never invent chapters to fill space.',
          `- ${length.chapterHint}`,
          '',
          continuity
            ? 'CONTINUITY (this chronicle is a serial — earlier chapters happened):\n- Some threads below were opened in earlier chapters. If this session RESOLVES one, write that chapter as the PAYOFF: acknowledge the time that passed and bring it to a close, without re-explaining it from scratch — the reader remembers.\n- Threads still open may be touched lightly in "What lingers" if relevant.\n- A long-abandoned thread may earn a brief, honest acknowledgment as character texture; never force it.\n'
            : '',
          '',
          'OUTPUT FORMAT (strict) — repeat this whole block for EACH chapter, with one blank line between chapters:',
          '- A title line: `# <Title>` (3 to 7 words drawn from THIS chapter\'s actual events — the specific NPC, item, deed, or beat. Never the zone name alone, never generic phrases like "A Day\'s Work").',
          '- One blank line.',
          `- ${length.paraSpec} short paragraphs of prose for this chapter, each separated by a blank line.`,
          '- One blank line.',
          '- `What lingers:` on its own line, then 1 to 3 short bullets starting with `- `, on what this chapter leaves IN THE WORLD: a debt, a face they will see again, a question, a loose end. Do NOT use "So what changed".',
          includeArc
            ? '- One blank line, then `The longer road:` on its own line, then 1 to 2 sentences on the INTERIOR: what the hero felt but did not say, and how this leg moved their OWN journey — a step toward or away from who they fear becoming, drawn from their Hero\'s truth, fears, and flaws, and continuing the inner journey so far (if given) rather than restarting it. This is about the character they are becoming, not the quest.'
            : '',
          includeArc && innerJourney ? `\n${innerJourney}` : '',
          includeArc
            ? '\nAFTER the final chapter, output a hidden bookkeeping block EXACTLY in this form and write nothing after it. The reader never sees it:\n<<ARC>>\ntrend: <one short clause on where the hero is trending internally now>\nquestions: <0 to 2 open internal questions separated by " | ", or "none">\nmovement: <one sentence on how THIS session moved the hero\'s own journey>\n<</ARC>>'
            : '',
        ].filter(Boolean).join('\n'),
      },
      {
        role: 'user',
        content: continuity ? `${prompt}\n\n---\n${continuity}` : prompt,
      },
    ],
  });
}

type SortKey = 'oldest' | 'newest' | 'duration' | 'levels' | 'quests';
type StatusFilter = 'all' | 'unpublished' | 'published';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'oldest', label: 'Oldest first' },
  { key: 'newest', label: 'Newest first' },
  { key: 'duration', label: 'Longest session' },
  { key: 'levels', label: 'Most levels' },
  { key: 'quests', label: 'Most quests' },
];

function sessionDuration(s: ChronicleSession): number {
  return Math.max(0, s.finishedAt - s.startedAt);
}

export function SessionTrail({
  sessions,
  bible,
  defaultSessionId,
  onSessionFocus,
}: {
  sessions: ChronicleSession[];
  bible: CharacterBible;
  defaultSessionId?: string;
  onSessionFocus?: (sessionId: string) => void;
}) {
  const [modelIdx] = useSelectedModelIdx();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(defaultSessionId ?? null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // Every card starts collapsed; opening one (click, deep-link, or "jump to")
  // adds it here. This is independent collapse, not an accordion — open as many
  // as you like.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(defaultSessionId ? [defaultSessionId] : []),
  );
  const [sortKey, setSortKey] = useState<SortKey>('oldest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const characterKey = String(bible.createdAt);
  const [sessionRecaps, setSessionRecaps] = useState<SessionRecapMap>(() =>
    loadSessionRecaps(characterKey),
  );

  useEffect(() => {
    setSessionRecaps(loadSessionRecaps(characterKey));
    const refresh = () => setSessionRecaps(loadSessionRecaps(characterKey));
    window.addEventListener(SESSION_RECAPS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_RECAPS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [characterKey]);

  // sessionId -> its committed recap chapter entries (1..N), oldest first.
  const committedEntries = useMemo(() => {
    const entries = new Map<string, HistoryEntry[]>();
    for (const e of bible.history ?? []) {
      const sid = recapSessionId(e.id);
      if (!sid) continue;
      const list = entries.get(sid) ?? [];
      list.push(e);
      entries.set(sid, list);
    }
    for (const list of entries.values()) list.sort((a, b) => a.timestamp - b.timestamp);
    return entries;
  }, [bible.history]);

  // Whether this character's bible is rich enough to earn "The longer road"
  // (the character-arc closing). Thin bibles degrade gracefully — see scope.
  const includeArc = useMemo(
    () => Boolean(bible.coreQuote?.trim()) || (bible.beliefs?.length ?? 0) > 0 || (bible.fears?.length ?? 0) > 0,
    [bible.coreQuote, bible.beliefs, bible.fears],
  );

  const manualEntriesBySession = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of bible.history ?? []) {
      if (!entry.sessionId) continue;
      const list = map.get(entry.sessionId) ?? [];
      list.push(entry);
      map.set(entry.sessionId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.timestamp - b.timestamp);
    return map;
  }, [bible.history]);

  const [enrichments, setEnrichments] = useState<Record<string, string>>(() =>
    toParagraphMap(loadEnrichments(characterKey)),
  );
  useEffect(() => {
    setEnrichments(toParagraphMap(loadEnrichments(characterKey)));
    const refresh = () => setEnrichments(toParagraphMap(loadEnrichments(characterKey)));
    window.addEventListener(ENRICHMENTS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ENRICHMENTS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [characterKey]);

  function focusSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSessionError(null);
    setOpenIds((prev) => (prev.has(sessionId) ? prev : new Set(prev).add(sessionId)));
    onSessionFocus?.(sessionId);
  }

  // Summary click: collapse if open, otherwise expand + focus (so generate /
  // error state attaches to the card the user just opened).
  function toggleSession(sessionId: string) {
    const willOpen = !openIds.has(sessionId);
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (willOpen) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
    if (willOpen) {
      setSelectedSessionId(sessionId);
      setSessionError(null);
      onSessionFocus?.(sessionId);
    }
  }

  useEffect(() => {
    if (!defaultSessionId || !sessions.some((s) => s.id === defaultSessionId)) return;
    focusSession(defaultSessionId);
    requestAnimationFrame(() => scrollSessionIntoView(defaultSessionId));
  }, [defaultSessionId, sessions]);

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (selectedSessionId && !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(null);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    const onScrollRequest = (event: Event) => {
      const targetId = (event as CustomEvent<string>).detail;
      if (!targetId || !sessions.some((s) => s.id === targetId)) return;
      focusSession(targetId);
      requestAnimationFrame(() => scrollSessionIntoView(targetId));
    };
    window.addEventListener('at:scroll-to-session', onScrollRequest);
    return () => window.removeEventListener('at:scroll-to-session', onScrollRequest);
  }, [sessions]);

  function jumpToEnrichedSession() {
    const target = sessions.find((s) => pickStoryBeats(s.records).some((r) => enrichments[entryId(r.event)]));
    if (!target) return;
    focusSession(target.id);
    requestAnimationFrame(() => scrollSessionIntoView(target.id));
  }

  function requestTab(tab: string) {
    window.dispatchEvent(new CustomEvent('at:request-tab', { detail: tab }));
  }

  function isPublished(session: ChronicleSession): boolean {
    return (committedEntries.get(session.id)?.length ?? 0) > 0;
  }

  // Parse a recap record into chapters (prefer the stored parse; fall back to
  // splitting the raw text for legacy records).
  function recapChapters(recap: SessionRecapRecord): Array<{ title: string; text: string }> {
    if (recap.chapters && recap.chapters.length > 0) return recap.chapters;
    return parseChapters(recap.text).map((c) => ({ title: c.title, text: cleanRecapText(c.text) }));
  }

  // Publish all of a session's chapters at once (publish-as-a-set).
  function writeRecapToChronicle(session: ChronicleSession, recap: SessionRecapRecord): string[] {
    const chapters = recapChapters(recap).map((c) => ({ title: c.title, text: cleanRecapText(c.text) }));
    const entries = appendSessionRecapChapters(
      session.id,
      chapters,
      session.startedAt,
      session.endZone ?? session.startZone,
      session.endLevel ?? session.startLevel,
    );
    return entries.map((e) => e.id);
  }

  async function generateSelectedSessionRecap(session: ChronicleSession, length: ChapterLength) {
    const published = isPublished(session);
    if (published && !window.confirm('This will replace your current chapter(s) for this session. Continue?')) return;
    setBusySessionId(session.id);
    setSessionError(null);
    try {
      const now = Date.now();
      const allRecords = sessions.flatMap((s) => s.records);
      const continuity = formatThreadContext(threadContextForSession(session, allRecords, now), now);
      const priorArc = includeArc ? loadArcState(characterKey) : null;
      const innerJourney = includeArc ? formatArcForPrompt(priorArc) : null;
      const res = await requestCampfireRecap(modelIdx, buildSessionRecapPrompt(bible, session), length, session.register, includeArc, continuity, innerJourney);
      // Pull the hidden arc-update block out before parsing chapters, and carry
      // the inner journey forward for the next chapter.
      const { stripped, update } = parseArcUpdate(res.text);
      if (includeArc && update) saveArcState(characterKey, applyArcUpdate(priorArc, update, now));
      const chapters = parseChapters(stripped).map((c) => ({ title: c.title, text: cleanRecapText(c.text) }));
      const record: SessionRecapRecord = { text: stripped, chapters, savedAt: Date.now(), modelId: res.model };
      // If it was already published, re-publish the fresh set in place.
      if (published) record.committedEntryIds = writeRecapToChronicle(session, record);
      saveSessionRecap(characterKey, session.id, record);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySessionId(null);
    }
  }

  function commitRecapToChronicle(session: ChronicleSession) {
    const recap = sessionRecaps[session.id];
    if (!recap) return;
    const ids = writeRecapToChronicle(session, recap);
    saveSessionRecap(characterKey, session.id, { ...recap, committedEntryIds: ids });
  }

  function removeRecapFromChronicle(session: ChronicleSession) {
    const recap = sessionRecaps[session.id];
    removeSessionRecapEntries(session.id);
    if (recap) {
      const { committedEntryIds: _ids, committedAsHistoryEntryId: _legacy, ...draft } = recap;
      saveSessionRecap(characterKey, session.id, draft);
    }
  }

  function discardRecap(session: ChronicleSession) {
    removeRecapFromChronicle(session);
    removeSessionRecap(characterKey, session.id);
  }

  function readInChronicle(session: ChronicleSession) {
    window.dispatchEvent(new CustomEvent('at:chronicle-mode', { detail: 'full' }));
    requestTab('chronicle');
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent('at:read-session-chapter', { detail: `recap_${session.id}_chapter` }),
      );
    });
  }

  const totalBeats = sessions.reduce((sum, s) => sum + pickStoryBeats(s.records).length, 0);
  const enrichedHere = sessions.reduce(
    (sum, s) => sum + pickStoryBeats(s.records).filter((r) => enrichments[entryId(r.event)]).length,
    0,
  );

  const publishedCount = useMemo(
    () => sessions.filter((s) => isPublished(s)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, committedEntries],
  );

  // Filter by publish status, then sort. Oldest-first is the default so a new
  // player reads their saga in the order they lived it.
  const visibleSessions = useMemo(() => {
    const filtered = sessions.filter((s) => {
      if (statusFilter === 'published') return isPublished(s);
      if (statusFilter === 'unpublished') return !isPublished(s);
      return true;
    });
    const arr = [...filtered];
    switch (sortKey) {
      case 'newest': arr.sort((a, b) => b.startedAt - a.startedAt); break;
      case 'duration': arr.sort((a, b) => sessionDuration(b) - sessionDuration(a)); break;
      case 'levels': arr.sort((a, b) => b.stats.levelsGained - a.stats.levelsGained); break;
      case 'quests': arr.sort((a, b) => b.stats.questsCompleted - a.stats.questsCompleted); break;
      case 'oldest':
      default: arr.sort((a, b) => a.startedAt - b.startedAt); break;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sortKey, statusFilter, committedEntries]);

  const statusFilters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: sessions.length },
    { key: 'unpublished', label: 'To write', count: sessions.length - publishedCount },
    { key: 'published', label: 'Published', count: publishedCount },
  ];

  return (
    <section className="at-chronicle-book at-session-trail">
      <header>
        <div>
          <p className="at-kicker">The Inkwell</p>
          <h3>Session cards</h3>
        </div>
        <span className="at-chronicle-count">
          {visibleSessions.length === sessions.length
            ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}`
            : `${visibleSessions.length} of ${sessions.length}`}
        </span>
      </header>

      {sessions.length === 0 ? (
        <p className="muted">
          No addon-observed sessions yet. Import your <code>Aftertale.lua</code> in The Inkwell to populate them.
        </p>
      ) : (
        <div className="at-session-list">
          {totalBeats > 0 && (
            <div className={enrichedHere === totalBeats ? 'at-chronicle-enrich-nudge at-chronicle-enrich-nudge-done' : 'at-chronicle-enrich-nudge'} role="status">
              <span>
                <strong>{enrichedHere}</strong> of <strong>{totalBeats}</strong> story beats have a Loremaster’s Note.
              </span>
              {enrichedHere > 0 && enrichedHere < totalBeats && (
                <span className="at-chronicle-enrich-nudge-actions">
                  <button type="button" className="at-btn at-btn-primary" onClick={jumpToEnrichedSession}>
                    Jump to authored session ↓
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="at-session-sortbar">
            <div className="at-session-sortbar-group" role="group" aria-label="Filter sessions">
              <span className="at-session-sortbar-label">Show</span>
              {statusFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`at-pill ${statusFilter === f.key ? 'at-pill-active' : ''}`}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
            <div className="at-session-sortbar-group" role="group" aria-label="Sort sessions">
              <span className="at-session-sortbar-label">Sort</span>
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`at-pill ${sortKey === o.key ? 'at-pill-active' : ''}`}
                  onClick={() => setSortKey(o.key)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {visibleSessions.length === 0 ? (
            <p className="muted at-session-empty-filter">No sessions match this filter.</p>
          ) : (
            visibleSessions.map((session) => {
              const recap = sessionRecaps[session.id];
              const published = isPublished(session);
              return (
                <SessionCard
                  key={session.id}
                  session={session}
                  recap={recap}
                  published={published}
                  committedEntry={committedEntries.get(session.id)?.[0]}
                  open={openIds.has(session.id)}
                  busy={busySessionId === session.id}
                  sessionError={selectedSessionId === session.id ? sessionError : null}
                  characterKey={characterKey}
                  enrichments={enrichments}
                  manualEntries={manualEntriesBySession.get(session.id) ?? []}
                  onToggle={() => toggleSession(session.id)}
                  onGenerate={(length) => generateSelectedSessionRecap(session, length)}
                  onCommit={() => commitRecapToChronicle(session)}
                  onUnpublish={() => removeRecapFromChronicle(session)}
                  onDiscard={() => discardRecap(session)}
                  onRead={() => readInChronicle(session)}
                />
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function SessionCard({
  session,
  recap,
  published,
  committedEntry,
  open,
  busy,
  sessionError,
  characterKey,
  enrichments,
  manualEntries,
  onToggle,
  onGenerate,
  onCommit,
  onUnpublish,
  onDiscard,
  onRead,
}: {
  session: ChronicleSession;
  recap?: SessionRecapRecord;
  published: boolean;
  committedEntry?: HistoryEntry;
  open: boolean;
  busy: boolean;
  sessionError: string | null;
  characterKey: string;
  enrichments: Record<string, string>;
  manualEntries: HistoryEntry[];
  onToggle: () => void;
  onGenerate: (length: ChapterLength) => void;
  onCommit: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
  onRead: () => void;
}) {
  const stateLabel = published ? 'Published' : recap ? 'Draft' : 'Unpublished';
  const slimTitle = recap ? extractRecapTitle(recap.text) ?? session.title : session.title;

  // Narrative weight → recommended chapter length (the player can override).
  const recommendedId = useMemo(() => recommendChapterLength(sessionNarrativeScore(session.records)), [session.records]);
  const [lengthId, setLengthId] = useState<ChapterLengthId>(recommendedId);
  const chosen = CHAPTER_LENGTHS[lengthId];
  const significance = describeSessionSignificance(session, recommendedId);
  return (
    <details
      id={`at-session-${session.id}`}
      className={`at-session-card at-session-card-${stateLabel.toLowerCase()}`}
      open={open}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}
      >
        <div>
          <span className="at-chronicle-chapter-num">{stateLabel}</span>
          <h4>{published ? slimTitle : session.title}</h4>
          <p>
            {published && committedEntry ? `Published ${relativeTime(committedEntry.timestamp)}` : `${formatDateRange(session.startedAt, session.finishedAt)} · ${formatDuration(session.finishedAt - session.startedAt)}`}
          </p>
        </div>
        <div className="at-session-card-summary-right">
          {published ? (
            <span className="at-session-scribed-badge">PUBLISHED {committedEntry ? relativeTime(committedEntry.timestamp) : ''}</span>
          ) : (
            <strong>{session.stats.questsCompleted} quests · +{session.stats.levelsGained} levels</strong>
          )}
          {published && (
            <>
              <button type="button" className="at-btn at-btn-ghost at-btn-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRead(); }}>
                ▸ Read in Chronicle
              </button>
              <button type="button" className="at-btn at-btn-ghost at-btn-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGenerate(chosen); }}>
                🔄 Regenerate
              </button>
              <button type="button" className="at-btn at-btn-ghost at-btn-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnpublish(); }}>
                ↩ Unpublish
              </button>
            </>
          )}
          <PurgeSessionButton session={session} characterKey={characterKey} />
        </div>
      </summary>

      <section className="at-session-campfire-hero">
        <div className="at-session-campfire-head">
          <div>
            <p className="at-kicker">✒ At The Inkwell</p>
            <h4>{published ? 'Published chapter' : recap ? 'Draft chapter' : 'Ink this chapter into the Chronicle'}</h4>
            <p className="muted">The loremaster draws from story beats, manual notes, and session context to shape a proper chapter.</p>
          </div>
          <div className="at-chronicle-generate-controls">
            {!published && (
              <button className="at-btn at-btn-primary" onClick={recap ? onCommit : () => onGenerate(chosen)} disabled={busy}>
                {busy ? 'Dipping the quill…' : recap ? '📖 Publish to Chronicle' : '✨ Generate session recap'}
              </button>
            )}
            {recap && !published && (
              <>
                <button className="at-btn at-btn-secondary" onClick={() => onGenerate(chosen)} disabled={busy}>🔄 Regenerate</button>
                <button className="at-btn at-btn-ghost" onClick={onDiscard}>🗑 Discard draft</button>
              </>
            )}
          </div>
        </div>

        {!published && (
          <ChapterLengthControl
            significance={significance}
            chosenId={lengthId}
            recommendedId={recommendedId}
            onPick={setLengthId}
            disabled={busy}
          />
        )}

        {sessionError && (
          <div className="at-callout-danger at-chronicle-error">
            <strong>The quill slipped:</strong> {sessionError}
          </div>
        )}

        {recap ? (
          <SavedSessionRecapArticle record={recap} published={published} />
        ) : (
          <p className="at-session-campfire-empty">The parchment is still blank. Generate a recap to turn these story beats into a title, prose, and a closing reflection.</p>
        )}
      </section>

      <div className="at-session-stats">
        <article><span>The hours kept</span><strong>{formatEntryTime(session.startedAt)} → {session.isOpen ? 'quill still in hand' : formatEntryTime(session.finishedAt)}</strong><p>{formatDuration(session.finishedAt - session.startedAt)}</p></article>
        <article><span>Levels earned</span><strong>{levelRange(session)}</strong><p>{session.stats.levelsGained > 0 ? `${session.stats.levelsGained} level gains observed` : 'No level-up delta observed'}</p></article>
        <article><span>Errands run</span><strong>{session.stats.questsCompleted} completed</strong><p>{session.stats.questsAccepted} accepted during the session</p></article>
        <article><span>Road hazards</span><strong>{session.stats.deaths} deaths</strong><p>{session.stats.kills} notable kills · {session.stats.npcsMet} NPCs met</p></article>
      </div>

      <div className="at-session-meta">
        <span>Zones traveled: {session.stats.zonesVisited.length > 0 ? session.stats.zonesVisited.join(' → ') : 'none recorded'}</span>
        {session.stats.notableItems.length > 0 && <span>Items: {session.stats.notableItems.join(', ')}</span>}
        {session.stats.notableUnits.length > 0 && <span>Foes: {session.stats.notableUnits.join(', ')}</span>}
      </div>

      <SessionMarginNotes session={session} enrichments={enrichments} manualEntries={manualEntries} />
    </details>
  );
}


// Per-register lead phrasing, indexed by chapter size.
const REGISTER_LEAD: Record<SessionRegister, Record<ChapterLengthId, string>> = {
  adventuring: { quick: 'A quick run', full: 'A solid session', epic: 'A big night' },
  downtime: { quick: 'A quiet hour', full: 'A productive evening', epic: 'A long evening of patient work' },
  martial: { quick: 'A quick scrap', full: 'A night in the fray', epic: 'A long night of battle' },
};

// Plain-language read of the session: recognition of the player's own deeds +
// the size of chapter that earns. No scores, no weights, no jargon. The
// highlights pulled depend on the session's register so a craft night reads
// like a craft night.
function describeSessionSignificance(session: ChronicleSession, lengthId: ChapterLengthId): string {
  const highlights =
    session.register === 'downtime'
      ? downtimeHighlights(session)
      : session.register === 'martial'
        ? martialHighlights(session)
        : adventuringHighlights(session);

  const lead = REGISTER_LEAD[session.register][lengthId];
  const tail =
    lengthId === 'epic'
      ? "This one's earned a long, multi-part chapter."
      : lengthId === 'full'
        ? 'Good for a full chapter.'
        : "We'll keep this one short and sweet.";

  if (highlights.length === 0) return `${lead}. We'll shape what we caught into a chapter.`;

  const top = highlights.slice(0, 3);
  const list =
    top.length === 1 ? top[0] : top.length === 2 ? `${top[0]} and ${top[1]}` : `${top[0]}, ${top[1]}, and ${top[2]}`;
  return `${lead} — ${list}. ${tail}`;
}

function adventuringHighlights(session: ChronicleSession): string[] {
  const st = session.stats;
  const dungeonCleared = session.records.some((r) => r.event.kind === 'instance_complete');
  const bossKills = session.records.filter((r) => r.event.kind === 'boss_kill').length;
  const h: string[] = [];
  if (st.questsCompleted > 0) h.push(`wrapped ${st.questsCompleted} quest${st.questsCompleted === 1 ? '' : 's'}`);
  if (st.levelsGained > 0) {
    h.push(typeof session.endLevel === 'number' ? `reached level ${session.endLevel}` : `gained ${st.levelsGained} level${st.levelsGained === 1 ? '' : 's'}`);
  }
  if (dungeonCleared) h.push('cleared a dungeon');
  else if (bossKills > 0) h.push(`felled ${bossKills} boss${bossKills === 1 ? '' : 'es'}`);
  if (st.deaths > 0) h.push(st.deaths === 1 ? 'met death once' : `died ${st.deaths} times`);
  if (h.length === 0 && st.notableItems.length > 0) h.push(`found ${st.notableItems[0]}`);
  return h;
}

function downtimeHighlights(session: ChronicleSession): string[] {
  const h: string[] = [];
  for (const r of session.records) {
    const e = r.event;
    if (e.kind === 'profession_session' && e.profession?.skill && typeof e.profession.from === 'number' && typeof e.profession.to === 'number') {
      h.push(`${e.profession.skill} ${e.profession.from} to ${e.profession.to}`);
    } else if (e.kind === 'profession_rank' && e.profession?.skill && e.profession?.rank) {
      h.push(`made ${e.profession.rank} in ${e.profession.skill}`);
    } else if (e.kind === 'profession_first' && e.profession?.skill) {
      h.push(`took up ${e.profession.skill}`);
    } else if (e.kind === 'recipe_learned' && e.profession?.recipe) {
      h.push(`learned ${e.profession.recipe}`);
    } else if (e.kind === 'crafted_notable' && (e.profession?.itemName || e.itemName)) {
      h.push(`crafted ${e.profession?.itemName ?? e.itemName}`);
    } else if (e.kind === 'wealth_milestone' && e.wealth?.aspiration) {
      h.push(e.wealth.aspiration);
    }
  }
  return dedupe(h);
}

function martialHighlights(session: ChronicleSession): string[] {
  const h: string[] = [];
  let bgWins = 0, bgLosses = 0, duels = 0, kills = 0;
  for (const r of session.records) {
    const e = r.event;
    if (e.kind === 'battleground') { e.pvp?.won ? bgWins++ : bgLosses++; }
    else if (e.kind === 'arena_match') { h.push(`an arena bout (${e.pvp?.won ? 'won' : 'lost'})`); }
    else if (e.kind === 'rating_milestone' && e.pvp?.ratingMilestone) { h.push(`reached ${e.pvp.ratingMilestone} rating`); }
    else if (e.kind === 'duel') { duels++; }
    else if (e.kind === 'world_pvp') { kills += e.pvp?.killStreak ?? 1; }
    else if (e.kind === 'honor_milestone' && e.pvp?.honorMilestone) { h.push(`earned the rank of ${e.pvp.honorMilestone}`); }
  }
  if (bgWins + bgLosses > 0) {
    const total = bgWins + bgLosses;
    h.unshift(`fought ${total} battleground${total === 1 ? '' : 's'}${bgWins > 0 ? ` (${bgWins} won)` : ''}`);
  }
  if (kills > 0) h.push(`felled ${kills} in open-world combat`);
  if (duels > 0) h.push(`settled ${duels} duel${duels === 1 ? '' : 's'}`);
  return dedupe(h);
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function ChapterLengthControl({
  significance,
  chosenId,
  recommendedId,
  onPick,
  disabled,
}: {
  significance: string;
  chosenId: ChapterLengthId;
  recommendedId: ChapterLengthId;
  onPick: (id: ChapterLengthId) => void;
  disabled: boolean;
}) {
  return (
    <div className="at-chapter-length">
      <p className="at-chapter-length-read">{significance}</p>
      <div className="at-chapter-length-label">Chapter length</div>
      <div className="at-chapter-length-options" role="group" aria-label="Chapter length">
        {CHAPTER_LENGTH_ORDER.map((id) => {
          const len = CHAPTER_LENGTHS[id];
          const isChosen = chosenId === id;
          const isRec = recommendedId === id;
          return (
            <button
              key={id}
              type="button"
              className={`at-chapter-length-opt${isChosen ? ' is-chosen' : ''}`}
              aria-pressed={isChosen}
              disabled={disabled}
              onClick={() => onPick(id)}
              title={len.blurb}
            >
              <span className="at-chapter-length-opt-label">{len.label}</span>
              <span className="at-chapter-length-opt-cost">{len.blurb}</span>
              {isRec && <span className="at-chapter-length-rec">Recommended</span>}
            </button>
          );
        })}
      </div>
      <p className="at-chapter-length-help">
        Longer chapters capture more of what happened.
      </p>
    </div>
  );
}

function entryContext(entry: HistoryEntry): string {
  return [
    typeof entry.level === 'number' ? `Lvl ${entry.level}` : null,
    entry.zone,
  ]
    .filter(Boolean)
    .join(' · ');
}

function levelRange(session: ChronicleSession): string {
  if (typeof session.startLevel === 'number' && typeof session.endLevel === 'number') {
    return `Lvl ${session.startLevel} -> ${session.endLevel}`;
  }
  if (typeof session.endLevel === 'number') return `Lvl ${session.endLevel}`;
  return 'Level not captured';
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

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatPromptTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildSessionRecapPrompt(bible: CharacterBible, session: ChronicleSession): string {
  const historyEntries = (bible.history ?? []).filter((entry) =>
    session.records.some((record) => entry.id === `addon_${record.event.id}`),
  );
  const mode = getSeedMode();

  return [
    `Hero: ${bible.name}, ${bible.faction} ${bible.race} ${bible.class}`,
    pronounLine(bible.sex) ? `Pronouns: ${pronounLine(bible.sex)}` : null,
    typeof bible.level === 'number' ? `Current level: ${bible.level}` : null,
    bible.currentZone ? `Current zone: ${bible.currentZone}` : null,
    bible.homeland ? `Homeland: ${bible.homeland}` : null,
    bible.coreQuote ? `Hero's truth: ${bible.coreQuote}` : null,
    '',
    'Voice:',
    bible.voice,
    '',
    'Backstory:',
    bible.backstory,
    '',
    'Beliefs:',
    ...bible.beliefs.map((belief) => `- ${belief}`),
    '',
    'Motivations:',
    ...bible.motivations.map((motivation) => `- ${motivation}`),
    ...(bible.fears && bible.fears.length > 0
      ? ['', 'Fears:', ...bible.fears.map((fear) => `- ${fear}`)]
      : []),
    ...(bible.flaws && bible.flaws.length > 0
      ? ['', 'Flaws:', ...bible.flaws.map((flaw) => `- ${flaw}`)]
      : []),
    '',
    'Scope: selected addon-observed play session from The Inkwell.',
    'Write this as character story, not a stats dashboard. Use counters only when they support the narrative.',
    'Write entirely ORIGINAL prose in the hero\'s own voice. Any line marked "reference lore" is context you may be inspired by but must NEVER copy or closely paraphrase — translate it into wholly original wording.',
    // C arm: pull grounding from the model's OWN trained lore knowledge instead of
    // sending Blizzard's quest text. IP-safe.
    mode === 'C'
      ? 'These quests, NPCs, and zones have established in-world lore. Where you recognize the specific quest, NPC, or location named in the facts below, you MAY draw on that established lore from your own knowledge to ground the scene with accurate detail (motivations, geography, stakes). Invent nothing that contradicts the captured facts; if you are unsure of a detail, stay general rather than fabricate.'
      : null,
    `Session title: ${session.title}`,
    `Session window: ${formatDateRange(session.startedAt, session.finishedAt)}`,
    `Duration: ${formatDuration(session.finishedAt - session.startedAt)}`,
    `Level movement: ${levelRange(session)}`,
    session.startZone || session.endZone ? `Zone movement: ${session.startZone ?? 'unknown'} -> ${session.endZone ?? 'unknown'}` : null,
    session.stats.zonesVisited.length > 0 ? `Zones observed: ${session.stats.zonesVisited.join(' -> ')}` : null,
    `Session facts: ${session.stats.questsAccepted} quests accepted, ${session.stats.questsCompleted} quests completed, ${session.stats.levelsGained} levels gained, ${session.stats.deaths} deaths, ${session.stats.kills} notable kills, ${session.stats.npcsMet} NPCs met.`,
    session.stats.notableUnits.length > 0 ? `Notable foes: ${session.stats.notableUnits.join(', ')}` : null,
    session.stats.notableItems.length > 0 ? `Notable items: ${session.stats.notableItems.join(', ')}` : null,
    session.isOpen ? 'Session status: still active; do not write it as fully resolved.' : 'Session status: closed.',
    '',
    historyEntries.length > 0 ? 'Chronicle entries from this session, oldest first:' : null,
    ...historyEntries.map((entry) => `- ${formatPromptTimestamp(entry.timestamp)}${entryContext(entry) ? ` (${entryContext(entry)})` : ''}: ${entry.text}`),
    historyEntries.length > 0 ? '' : null,
    'Addon-observed facts from this session, oldest first (telemetry included for context):',
    ...session.records.map((record) => sessionRecordPromptLine(record, mode)),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function sessionRecordPromptLine(record: AddonEventRecord, mode: SeedMode): string {
  const event = record.event;
  const story = event.storyCard
    ? [
        `story moment: ${event.storyCard.moment}`,
        `setup: ${event.storyCard.setup}`,
        `player action: ${event.storyCard.playerAction}`,
        `outcome: ${event.storyCard.outcome}`,
        `emotional weight: ${event.storyCard.emotionalWeight}`,
        `chronicle entry: ${event.storyCard.chronicleEntry}`,
      ].join('; ')
    : null;
  const questText = event.questTextEnrichment?.text.trim()
    ? `quest text note: ${event.questTextEnrichment.text.trim()}`
    : null;
  // B (dev only): verbatim Blizzard quest prose, fed as REFERENCE the model may be
  // inspired by but must never reproduce. Only in mode 'B', which is hard-gated to
  // dev builds, so this can never reach the LLM in production.
  let richText: string | null = null;
  if (mode === 'B' && event.questRichText) {
    const rt = event.questRichText;
    const parts = [
      rt.description ? `desc: ${rt.description}` : null,
      rt.progress ? `progress: ${rt.progress}` : null,
      rt.reward ? `turn-in: ${rt.reward}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
    if (parts) richText = `reference lore (inspiration only — do NOT reproduce or closely paraphrase): ${parts}`;
  }
  return [
    `- ${formatPromptTimestamp(event.timestamp)}: ${eventFactLine(event)}`,
    story ? ` [${story}]` : '',
    questText ? ` [${questText}]` : '',
    richText ? ` [${richText}]` : '',
  ].join('');
}

function PurgeSessionButton({
  session,
  characterKey,
}: {
  session: ChronicleSession;
  characterKey: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

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
        const eventIds = session.records.map((r) => r.event.id);
        const enrichmentIds = session.records.map((r) => entryId(r.event));
        removeAddonEventRecords(eventIds);
        removeEnrichments(characterKey, enrichmentIds);
        removeAddonHistoryEntriesByEventIds(eventIds);
        removeSessionRecap(characterKey, session.id);
        removeSessionRecapEntries(session.id);
        setArmed(false);
      }}
      title={
        armed
          ? 'Click again to confirm — this session only'
          : `Purge this session (${session.records.length} event${session.records.length === 1 ? '' : 's'})`
      }
      aria-label={armed ? 'Confirm purge this session' : 'Purge this session'}
    >
      {armed ? '⚠ Confirm' : '✕'}
    </button>
  );
}

const KIND_LABEL: Record<string, string> = {
  session_start: 'Logins',
  session_end: 'Logouts',
  player_death: 'Deaths',
  quest_accepted: 'Quests accepted',
  quest_turned_in: 'Quests turned in',
  quest_objective_progress: 'Quest progress',
  quest_detail: 'Quest details',
  zone_changed: 'Zone changes',
  level_up: 'Level-ups',
  unit_kill: 'Kills',
  gossip_show: 'Gossip',
  unknown: 'Chatter',
};

function SavedSessionRecapArticle({
  record,
  published,
}: {
  record: SessionRecapRecord;
  published: boolean;
}) {
  // Render the recap as its 1..N chapters, each with its own title heading.
  const chapters = record.chapters && record.chapters.length > 0
    ? record.chapters
    : parseChapters(record.text);
  const savedWhen = new Date(record.savedAt);
  return (
    <article className="at-chronicle-article at-session-campfire-article">
      <div className="at-session-recap-body">
        {chapters.map((chapter, ci) => (
          <section key={ci} className="at-session-recap-chapter">
            {chapter.title && <h5 className="at-session-recap-chapter-title">{chapter.title}</h5>}
            {renderEntryParagraphs(chapter.text)}
          </section>
        ))}
      </div>
      <footer className="at-session-recap-footer">
        <div className="at-session-recap-meta">
          <span>Penned {savedWhen.toLocaleString()}</span>
          {record.modelId && <span>· {record.modelId}</span>}
          {published && <span className="at-session-recap-committed">· ✦ In the Chronicle</span>}
        </div>
      </footer>
    </article>
  );
}

function SessionMarginNotes({
  session,
  enrichments,
  manualEntries,
}: {
  session: ChronicleSession;
  enrichments: Record<string, string>;
  manualEntries: HistoryEntry[];
}) {
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [scribedOnly, setScribedOnly] = useState(false);
  const beats = useMemo(() => pickStoryBeats(session.records), [session.records]);

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of beats) counts[r.event.kind] = (counts[r.event.kind] || 0) + 1;
    return counts;
  }, [beats]);

  const kindsPresent = useMemo(
    () => Object.keys(kindCounts).sort((a, b) => kindCounts[b] - kindCounts[a]),
    [kindCounts],
  );

  const scribedCount = useMemo(
    () => beats.filter((r) => Boolean(enrichments[entryId(r.event)])).length,
    [beats, enrichments],
  );

  const filtered = useMemo(() => {
    return beats.filter((r) => {
      if (selectedKinds.size > 0 && !selectedKinds.has(r.event.kind)) return false;
      if (scribedOnly && !enrichments[entryId(r.event)]) return false;
      return true;
    });
  }, [beats, selectedKinds, scribedOnly, enrichments]);

  const toggleKind = (kind: string) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const clearAll = () => {
    setSelectedKinds(new Set());
    setScribedOnly(false);
  };

  const hasFilters = selectedKinds.size > 0 || scribedOnly;

  return (
    <details className="at-session-events" open>
      <summary className="at-session-events-summary">
        <span className="at-kicker">Story beats</span>
        <span className="at-session-events-count">
          {hasFilters ? `${filtered.length} / ${beats.length}` : beats.length}
        </span>
      </summary>

      <div className="at-session-event-filters" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={`at-pill ${!hasFilters ? 'at-pill-active' : ''}`} onClick={clearAll}>
          All ({beats.length})
        </button>
        {scribedCount > 0 && (
          <button
            type="button"
            className={`at-pill at-pill-scribed ${scribedOnly ? 'at-pill-active' : ''}`}
            onClick={() => setScribedOnly((v) => !v)}
            title="Show only story beats with a Loremaster's Note"
          >
            ✦ Loremaster's notes ({scribedCount})
          </button>
        )}
        {kindsPresent.map((kind) => (
          <button key={kind} type="button" className={`at-pill ${selectedKinds.has(kind) ? 'at-pill-active' : ''}`} onClick={() => toggleKind(kind)}>
            {KIND_LABEL[kind] ?? kind} ({kindCounts[kind]})
          </button>
        ))}
      </div>

      {manualEntries.length > 0 && (
        <ol className="at-session-manual-beats">
          {manualEntries.map((entry) => (
            <li key={entry.id} className="at-session-event-enriched">
              <span>{formatEntryTime(entry.timestamp)}</span>
              <div className="at-enriched-block">
                <p className="at-enriched-prose">{entry.text}</p>
                <small className="at-enriched-fact">Manual chronicle entry</small>
                <span className="at-enriched-chip">✦ Manual</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {filtered.length === 0 ? (
        <p className="at-session-events-empty">No story beats match this filter.</p>
      ) : (
        <ol>
          {filtered.map((record) => {
            const prose = enrichments[entryId(record.event)];
            return (
              <li key={record.event.id} className={prose ? 'at-session-event-enriched' : undefined}>
                <span>{formatEntryTime(record.event.timestamp)}</span>
                {prose ? (
                  <div className="at-enriched-block">
                    <p className="at-enriched-prose">{prose}</p>
                    <small className="at-enriched-fact">{beatGlyph(record.event.kind)} {beatLabel(record.event)} · {eventFactLine(record.event)}</small>
                    <span className="at-enriched-chip" title="Generated at The Inkwell">✦ Loremaster’s Note</span>
                  </div>
                ) : (
                  <p><strong>{beatGlyph(record.event.kind)} {beatLabel(record.event)}</strong><br /><small>{eventFactLine(record.event)}</small></p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

function scrollSessionIntoView(sessionId: string): void {
  document.getElementById(`at-session-${sessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}
