import { useEffect, useMemo, useState } from 'react';
import { MODEL_CHOICES, useSelectedModelIdx } from '../lib/modelChoices';
import { appendSessionRecapHistoryEntry, removeAddonHistoryEntriesByEventIds, removeSessionRecapHistoryEntry } from '../lib/bibleStore';
import { removeAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import { ENRICHMENTS_UPDATED_EVENT, loadEnrichments, removeEnrichments, toParagraphMap } from '../lib/enrichmentStore';
import { loadSessionRecaps, removeSessionRecap, saveSessionRecap, SESSION_RECAPS_UPDATED_EVENT, type SessionRecapMap, type SessionRecapRecord } from '../lib/sessionRecapStore';
import { entryId } from '../lib/chronicleExport';
import { eventFactLine, type ChronicleSession } from '../lib/sessionHistory';
import { getSeedMode, type SeedMode } from '../lib/featureFlags';
import { beatGlyph, beatLabel, pickStoryBeats } from '../lib/storyBeats';
import type { CharacterBible, HistoryEntry, LLMResponse } from '../types';

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

async function requestCampfireRecap(modelIdx: number, prompt: string): Promise<LLMResponse> {
  const choice = MODEL_CHOICES[modelIdx];
  const provider = await choice.factory();
  return provider.chat({
    task: 'summary',
    model: choice.pricingKey,
    maxTokens: 1800,
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
          'STYLE RULES (strict):',
          '- Never use em dashes (—) or en dashes (–). If you would reach for one, use a comma, semicolon, or period instead. Two hyphens (--) are also forbidden.',
          '- Avoid ellipses unless quoting a character. No "..." for dramatic pauses.',
          '- Avoid the cliche "not X, but Y" construction. Vary sentence rhythm.',
          '- Prefer concrete nouns and verbs over abstract sentiment. Show, don\'t narrate the feeling.',
          '',
          'OUTPUT FORMAT (strict):',
          '- Line 1: a single chapter title in the form `# <Title>`. The title must be 3 to 7 words drawn from the actual events of THIS session (the specific NPC, item, deed, or beat that defines it). Do NOT use the zone name alone, do NOT use generic phrases like "A Day\'s Work" or "Coldridge Errands".',
          '- One blank line.',
          '- 3 to 5 short paragraphs of prose, each separated by a blank line.',
          '- One blank line.',
          '- A final closing section. Use the heading `What lingers:` on its own line, then 2 to 3 short bullets starting with `- `. Each bullet is one sentence about what this session leaves with the hero: a debt, a question, a face they will see again, a small change in how they carry themselves. Do NOT use "So what changed".',
        ].join('\n'),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
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

  const committedEntries = useMemo(() => {
    const entries = new Map<string, HistoryEntry>();
    for (const e of bible.history ?? []) {
      if (typeof e.id === 'string' && e.id.startsWith('recap_')) {
        entries.set(e.id.slice('recap_'.length), e);
      }
    }
    return entries;
  }, [bible.history]);

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
    onSessionFocus?.(sessionId);
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

  function isPublished(session: ChronicleSession, recap?: SessionRecapRecord): boolean {
    const committedId = recap?.committedAsHistoryEntryId;
    return Boolean(committedId && committedEntries.get(session.id)?.id === committedId);
  }

  function writeRecapToChronicle(session: ChronicleSession, text: string) {
    const title = extractRecapTitle(text);
    return appendSessionRecapHistoryEntry(
      session.id,
      cleanRecapText(text),
      session.startedAt,
      session.endZone ?? session.startZone,
      session.endLevel ?? session.startLevel,
      title ?? undefined,
    );
  }

  async function generateSelectedSessionRecap(session: ChronicleSession) {
    const recap = sessionRecaps[session.id];
    const published = isPublished(session, recap);
    if (published && !window.confirm('This will replace your current chapter for this session. Continue?')) return;
    setBusySessionId(session.id);
    setSessionError(null);
    try {
      const res = await requestCampfireRecap(modelIdx, buildSessionRecapPrompt(bible, session));
      const committed = published ? writeRecapToChronicle(session, res.text) : null;
      saveSessionRecap(characterKey, session.id, {
        text: res.text,
        savedAt: Date.now(),
        modelId: res.model,
        committedAsHistoryEntryId: committed?.id ?? undefined,
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySessionId(null);
    }
  }

  function commitRecapToChronicle(session: ChronicleSession) {
    const recap = sessionRecaps[session.id];
    if (!recap) return;
    const committed = writeRecapToChronicle(session, recap.text);
    saveSessionRecap(characterKey, session.id, {
      ...recap,
      committedAsHistoryEntryId: committed?.id,
    });
  }

  function removeRecapFromChronicle(session: ChronicleSession) {
    const recap = sessionRecaps[session.id];
    removeSessionRecapHistoryEntry(session.id);
    if (recap) {
      const { committedAsHistoryEntryId: _committedAsHistoryEntryId, ...draft } = recap;
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

  return (
    <section className="at-chronicle-book at-session-trail">
      <header>
        <div>
          <p className="at-kicker">The Inkwell</p>
          <h3>Session cards</h3>
        </div>
        <span className="at-chronicle-count">{sessions.length} sessions</span>
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
                <strong>{enrichedHere}</strong> of <strong>{totalBeats}</strong> story beats have a Scribe’s Note.
              </span>
              {enrichedHere > 0 && enrichedHere < totalBeats && (
                <span className="at-chronicle-enrich-nudge-actions">
                  <button type="button" className="at-btn at-btn-primary" onClick={jumpToEnrichedSession}>
                    Jump to scribed session ↓
                  </button>
                </span>
              )}
            </div>
          )}
          {sessions.map((session) => {
            const recap = sessionRecaps[session.id];
            const published = isPublished(session, recap);
            return (
              <SessionCard
                key={session.id}
                session={session}
                recap={recap}
                published={published}
                committedEntry={committedEntries.get(session.id)}
                selected={selectedSessionId === session.id}
                busy={busySessionId === session.id}
                sessionError={selectedSessionId === session.id ? sessionError : null}
                characterKey={characterKey}
                enrichments={enrichments}
                manualEntries={manualEntriesBySession.get(session.id) ?? []}
                onSelect={() => focusSession(session.id)}
                onGenerate={() => generateSelectedSessionRecap(session)}
                onCommit={() => commitRecapToChronicle(session)}
                onUnpublish={() => removeRecapFromChronicle(session)}
                onDiscard={() => discardRecap(session)}
                onRead={() => readInChronicle(session)}
              />
            );
          })}
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
  selected,
  busy,
  sessionError,
  characterKey,
  enrichments,
  manualEntries,
  onSelect,
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
  selected: boolean;
  busy: boolean;
  sessionError: string | null;
  characterKey: string;
  enrichments: Record<string, string>;
  manualEntries: HistoryEntry[];
  onSelect: () => void;
  onGenerate: () => void;
  onCommit: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
  onRead: () => void;
}) {
  const stateLabel = published ? 'Published' : recap ? 'Draft' : 'Unwritten';
  const slimTitle = recap ? extractRecapTitle(recap.text) ?? session.title : session.title;
  return (
    <details
      id={`at-session-${session.id}`}
      className={`at-session-card at-session-card-${stateLabel.toLowerCase()}`}
      open={!published || selected}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          onSelect();
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
              <button type="button" className="at-btn at-btn-ghost at-btn-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGenerate(); }}>
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
            <p className="muted">The scribe draws from story beats, manual notes, and session context to shape a proper chapter.</p>
          </div>
          <div className="at-chronicle-generate-controls">
            {!published && (
              <button className="at-btn at-btn-primary" onClick={recap ? onCommit : onGenerate} disabled={busy}>
                {busy ? 'Dipping the quill…' : recap ? '📖 Publish to Chronicle' : '✨ Generate session recap'}
              </button>
            )}
            {recap && !published && (
              <>
                <button className="at-btn at-btn-secondary" onClick={onGenerate} disabled={busy}>🔄 Regenerate</button>
                <button className="at-btn at-btn-ghost" onClick={onDiscard}>🗑 Discard draft</button>
              </>
            )}
          </div>
        </div>

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
        removeSessionRecapHistoryEntry(session.id);
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
  const cleaned = cleanRecapText(record.text);
  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const savedWhen = new Date(record.savedAt);
  return (
    <article className="at-chronicle-article at-session-campfire-article">
      <div className="at-session-recap-body">
        {paragraphs.length > 0 ? paragraphs.map((para, i) => <p key={i}>{para}</p>) : <p>{cleaned}</p>}
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
            title="Show only story beats with a Scribe's Note"
          >
            ✦ Scribe's notes ({scribedCount})
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
                    <span className="at-enriched-chip" title="Generated at The Inkwell">✦ Scribe’s Note</span>
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
