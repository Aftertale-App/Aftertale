// ============================================================================
// AddonImport — drag/drop or click-to-select a Aftertale.lua file
// from WoW's WTF\Account\<acct>\SavedVariables\ folder. Parses it, previews
// character attribution, then hydrates addonEventStore for the active bible.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterBible } from '../types';
import {
  findBibleByCharacterGuid,
  loadBible,
  setActiveBible,
  setBibleCharacterBinding,
} from '../lib/bibleStore';
import { heroSessionStatus } from '../lib/heroStatus';
import {
  commitImport,
  commitImportAll,
  planImport as buildImportPlan,
  STUB_MIN_EVENTS,
  type CommitAllResult,
  type CommitResult,
  type ImportCharacter,
  type ImportPlan,
} from '../lib/addonIngest';
import {
  hashFileContents,
  loadImportRecord,
  saveImportRecord,
  type ImportRecord,
} from '../lib/importTracker';

export interface ImportState {
  status: 'idle' | 'checking' | 'parsing' | 'preview' | 'committing' | 'done' | 'up-to-date' | 'error';
  plan?: ImportPlan;
  bible?: CharacterBible | null;
  imported?: number;
  skipped?: number;
  error?: string;
  fileName?: string;
  fileModified?: number;
  fileHash?: string;
  fileSize?: number;
  newEvents?: number;
  previousRecord?: ImportRecord | null;
  message?: string;
  /** Per-hero outcome of a multi-alt fan-out import. */
  multiResult?: CommitAllResult;
}

export function importButtonLabel(state: ImportState, idleLabel = '⬆ Choose file'): string {
  if (state.status === 'checking') return 'Checking...';
  if (state.status === 'parsing') return 'Parsing...';
  if (state.status === 'committing') return 'Importing...';
  if (state.status === 'up-to-date') return 'Already up to date';
  return idleLabel;
}

type HookMode = 'preview' | 'smart';

interface UseAftertaleLuaImportOptions {
  mode?: HookMode;
}

function matchingAutoclaim(plan: ImportPlan, bible: CharacterBible): ImportCharacter | null {
  if (bible.characterGuid || plan.characters.length !== 1) return null;
  const [character] = plan.characters;
  return character.name.localeCompare(bible.name, undefined, { sensitivity: 'accent' }) === 0
    || character.name.toLocaleLowerCase() === bible.name.toLocaleLowerCase()
    ? character
    : null;
}

function bindBibleToCharacter(bible: CharacterBible, character: ImportCharacter): CharacterBible {
  return setBibleCharacterBinding(bible, {
    guid: character.guid,
    realm: character.realm,
    wowClass: character.wowClass,
    wowRace: character.wowRace,
    charName: character.name,
  });
}

function importableEvents(plan: ImportPlan, bible: CharacterBible): number {
  if (plan.schemaVersion < 2) return plan.legacyEventCount;
  const guid = bible.characterGuid;
  if (!guid) return 0;
  return plan.characters.find((c) => c.guid === guid)?.eventCount ?? 0;
}

function latestImportableEventAt(plan: ImportPlan, bible: CharacterBible): number {
  const guid = bible.characterGuid;
  return plan.rawEvents.reduce((latest, event) => {
    const shouldCount = event.char ? event.char === guid : plan.schemaVersion < 2;
    return shouldCount ? Math.max(latest, event.timestamp || 0) : latest;
  }, 0);
}

function shouldSmartAutoCommit(plan: ImportPlan, bible: CharacterBible): boolean {
  if (plan.schemaVersion < 2) return true;
  if (!bible.characterGuid || plan.legacyEventCount > 0) return false;
  const matched = plan.characters.find((c) => c.guid === bible.characterGuid);
  if (!matched) return false;
  return plan.characters.every((c) => c.guid === bible.characterGuid);
}

function resultMessage(plan: ImportPlan, bible: CharacterBible, result: CommitResult): string {
  const name = plan.schemaVersion < 2
    ? bible.name
    : plan.characters.find((c) => c.guid === bible.characterGuid)?.name ?? bible.name;
  const skipped = Math.max(0, result.skipped);
  const refreshedSuffix = result.refreshed > 0
    ? ` (${result.refreshed.toLocaleString()} refreshed)`
    : '';
  return `✓ ${name} · ${result.imported.toLocaleString()} events imported${refreshedSuffix}. (${skipped.toLocaleString()} events from other characters skipped.)`;
}

/** How long the "reading your adventures" animation stays up, minimum, so a
 *  fast parse reads as a beat of work rather than a flicker or a frozen hang. */
const MIN_LOADING_MS = 850;

/** Resolve after the browser has had a chance to paint. Two rAFs guarantees the
 *  loading state is committed + painted before we run blocking synchronous work
 *  (plan build + commit), which would otherwise freeze the UI with no feedback. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      resolve();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Hold the loading animation until at least MIN_LOADING_MS has elapsed. */
function holdLoading(startedAt: number): Promise<void> {
  const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remaining));
}

export function useAftertaleLuaImport(options: UseAftertaleLuaImportOptions = {}) {
  const mode = options.mode ?? 'preview';
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  const commitPreparedImport = useCallback((nextState?: ImportState) => {
    const current = nextState ?? state;
    if (!current.plan || !current.bible) return null;

    setState({ ...current, status: 'committing' });
    try {
      const bible = loadBible() ?? current.bible;
      const result = commitImport(current.plan, {
        bible,
        acceptGuids: [bible.characterGuid].filter((guid): guid is string => Boolean(guid)),
        includeLegacy: current.plan.schemaVersion < 2,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('at:addon-events-updated'));
      }

      const eligibleCount = importableEvents(current.plan, bible);
      if (current.fileHash) {
        saveImportRecord(result.characterKey, {
          fileHash: current.fileHash,
          fileSize: current.fileSize ?? 0,
          importedAt: Date.now(),
          eventCount: eligibleCount,
          latestEventAt: latestImportableEventAt(current.plan, bible),
        });
      }

      const newEvents = current.previousRecord && eligibleCount > current.previousRecord.eventCount
        ? eligibleCount - current.previousRecord.eventCount
        : eligibleCount;
      const doneState: ImportState = {
        ...current,
        status: 'done',
        bible,
        imported: result.imported,
        skipped: result.skipped,
        newEvents,
        message: resultMessage(current.plan, bible, result),
      };
      setState(doneState);
      return result;
    } catch (err) {
      setState({
        ...current,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }, [state]);

  const handleFile = useCallback(async (file: File) => {
    setState({ status: 'checking', fileName: file.name, fileModified: file.lastModified });
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        fileName: file.name,
        fileModified: file.lastModified,
      });
      return;
    }

    // No active-bible requirement up front: an account-level import of a tagged
    // file captures every character by GUID and needs no active hero — that's
    // the brand-new-player first import. Legacy/single-hero paths below still
    // require one (they attribute events to the active hero), guarded inline.
    const loadedBible = loadBible();

    const fileHash = await hashFileContents(text);
    const characterKey = loadedBible ? String(loadedBible.createdAt) : null;
    const previousRecord = characterKey ? loadImportRecord(characterKey) : null;

    setState({
      status: 'parsing',
      fileName: file.name,
      fileModified: file.lastModified,
      fileHash,
      fileSize: file.size,
      bible: loadedBible,
      previousRecord,
    });

    // Let the loading animation paint before we run the blocking plan-build +
    // commit, then keep it up for a beat so it reads as work, not a freeze.
    const loadingStartedAt = Date.now();
    await nextPaint();

    try {
      const plan = buildImportPlan(text);
      let bible = loadedBible;

      // The active-hero fast paths only apply when there *is* an active hero.
      if (bible) {
        const autoClaim = matchingAutoclaim(plan, bible);
        if (autoClaim) {
          bible = bindBibleToCharacter(bible, autoClaim);
        }

        // Single-hero fast path: the file holds only the active hero's events.
        // Nothing to adjudicate — just catch the hero up and show a receipt.
        if (shouldSmartAutoCommit(plan, bible)) {
          if (previousRecord?.fileHash === fileHash) {
            setState({
              status: 'up-to-date',
              fileName: file.name,
              fileModified: file.lastModified,
              fileHash,
              fileSize: file.size,
              bible,
              previousRecord,
            });
            return;
          }
          await holdLoading(loadingStartedAt);
          commitPreparedImport({
            status: 'preview',
            plan,
            bible,
            fileName: file.name,
            fileModified: file.lastModified,
            fileHash,
            fileSize: file.size,
            previousRecord,
          });
          return;
        }
      }

      // Legacy untagged files can't attribute events per character — they need
      // an active hero to land on. Confirm via the preview card; error if none.
      if (plan.schemaVersion < 2) {
        if (!bible) {
          setState({
            status: 'error',
            error: 'This is an older, untagged save file — open or start a hero first so we know whose events these are.',
            fileName: file.name,
            fileModified: file.lastModified,
            fileHash,
            fileSize: file.size,
          });
          return;
        }
        setState({
          status: 'preview',
          plan,
          bible,
          fileName: file.name,
          fileModified: file.lastModified,
          fileHash,
          fileSize: file.size,
          previousRecord,
        });
        return;
      }

      // Tagged multi-hero file: capture is account-wide. Every character's
      // moments are banked immediately — established heroes update their own
      // chronicle, and every other toon (≥ threshold) gets a *captured* record
      // (started:false), out of the dropdown until the player begins it. Quiet
      // bank alts below threshold stay a footnote. No decline, no decision.
      const active = loadBible();
      const result = commitImportAll(plan, {
        legacyBibleKey: active ? String(active.createdAt) : null,
        includeLegacy: false,
      });
      for (const c of result.characters) {
        saveImportRecord(c.key, {
          fileHash,
          fileSize: file.size,
          importedAt: Date.now(),
          eventCount: c.imported + c.refreshed,
          latestEventAt: 0,
        });
      }
      await holdLoading(loadingStartedAt);
      setState({
        status: 'done',
        plan,
        bible,
        fileName: file.name,
        fileModified: file.lastModified,
        fileHash,
        fileSize: file.size,
        previousRecord,
        multiResult: result,
      });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        fileName: file.name,
        fileModified: file.lastModified,
        fileHash,
        fileSize: file.size,
        bible: loadedBible,
        previousRecord,
      });
    }
  }, [commitPreparedImport, mode]);

  const bindCharacter = useCallback((character: ImportCharacter) => {
    setState((current) => {
      const bible = loadBible() ?? current.bible;
      if (!bible) return current;
      const updated = bindBibleToCharacter(bible, character);
      return { ...current, bible: updated };
    });
  }, []);

  const cancelPreview = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  // Multi-hero fan-out: import every chosen alt in the file at once, each to its
  // own chronicle. Draft heroes are minted for new toons. Active hero is left
  // untouched — the done screen lets the player choose who to view.
  const commitAll = useCallback((selection?: { acceptGuids?: string[]; declineGuids?: string[] }) => {
    const current = state;
    if (!current.plan) return null;
    setState({ ...current, status: 'committing' });
    try {
      const active = loadBible();
      const result = commitImportAll(current.plan, {
        legacyBibleKey: active ? String(active.createdAt) : null,
        includeLegacy: current.plan.schemaVersion < 2,
        acceptGuids: selection?.acceptGuids,
        declineGuids: selection?.declineGuids,
      });
      if (current.fileHash) {
        for (const c of result.characters) {
          saveImportRecord(c.key, {
            fileHash: current.fileHash,
            fileSize: current.fileSize ?? 0,
            importedAt: Date.now(),
            eventCount: c.imported + c.refreshed,
            latestEventAt: 0,
          });
        }
      }
      setState({ ...current, status: 'done', multiResult: result });
      return result;
    } catch (err) {
      setState({
        ...current,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }, [state]);

  // Opt-in mint of a single new toon from the receipt. Creates its draft hero,
  // routes its events, and folds the outcome into the existing done summary.
  const addHero = useCallback((guid: string) => {
    const current = state;
    if (!current.plan) return null;
    const result = commitImportAll(current.plan, { acceptGuids: [guid] });
    if (current.fileHash) {
      for (const c of result.characters) {
        saveImportRecord(c.key, {
          fileHash: current.fileHash,
          fileSize: current.fileSize ?? 0,
          importedAt: Date.now(),
          eventCount: c.imported + c.refreshed,
          latestEventAt: 0,
        });
      }
    }
    setState((prev) => {
      const merged = [...(prev.multiResult?.characters ?? [])];
      for (const c of result.characters) {
        const idx = merged.findIndex((m) => m.guid === c.guid);
        if (idx >= 0) merged[idx] = c;
        else merged.push(c);
      }
      return {
        ...prev,
        multiResult: {
          characters: merged,
          belowThreshold: prev.multiResult?.belowThreshold ?? result.belowThreshold,
          legacyImported: prev.multiResult?.legacyImported ?? 0,
          legacySkipped: prev.multiResult?.legacySkipped ?? 0,
        },
      };
    });
    return result;
  }, [state]);

  // Open a hero from the import roster: make them active and route to The
  // Inkwell so their session cards show below. The roster itself stays put —
  // it's the account-level "pick who to work on" surface, not a one-shot.
  const openHero = useCallback((key: string) => {
    setActiveBible(key);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('at:request-tab', { detail: 'desk' }));
    }
  }, []);

  return {
    state,
    handleFile,
    commitPreparedImport,
    commitAll,
    addHero,
    openHero,
    bindCharacter,
    cancelPreview,
    planImport: buildImportPlan,
    commitImport,
  };
}

/**
 * The "reading your adventures" beat shown while a dropped Aftertale.lua is
 * parsed and committed. Cycles through phase copy so the wait reads as the app
 * working through the file, not a hang.
 */
export function ImportLoading({ fileName }: { fileName?: string }) {
  const phases = [
    'Reading your adventures…',
    'Sorting your heroes…',
    'Catching up each chronicle…',
  ];
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % phases.length), 700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="at-import-loading">
      <span className="at-import-emblem" aria-hidden>
        ✦
      </span>
      <div className="at-import-phase" key={phase}>
        {phases[phase]}
      </div>
      {fileName && <div className="at-import-file">{fileName}</div>}
      <div className="at-import-bar" aria-hidden />
    </div>
  );
}

export function AddonImport({
  hideReceipt = false,
  compact = false,
}: {
  hideReceipt?: boolean;
  /** Render as a small button (the populated hub) instead of the full drop zone. */
  compact?: boolean;
} = {}) {
  const { state, handleFile, commitAll, addHero, openHero, cancelPreview } = useAftertaleLuaImport({ mode: 'preview' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = state.status === 'checking' || state.status === 'parsing' || state.status === 'committing';

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return (
    <section
      className={compact ? 'at-import-compact' : 'at-import'}
      data-drag={dragging ? 'true' : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {state.status === 'preview' && state.plan && (
        <MultiHeroImportCard
          state={state}
          onImport={(sel) => commitAll(sel)}
          onCancel={cancelPreview}
        />
      )}

      {!hideReceipt && state.status === 'done' && state.multiResult && (
        <ImportDoneSummary state={state} onOpen={openHero} onAddHero={addHero} />
      )}

      {/* While a file is being read/committed, replace the static instructions
          with the loading beat. Once a result/receipt is showing, the "where to
          find it" copy is dead weight — collapse to a slim re-import affordance.
          In compact mode (the populated hub) it's just a small button — the big
          drop zone only belongs on the first-run screen. */}
      {busy ? (
        <ImportLoading fileName={state.fileName} />
      ) : compact ? (
        // Returning player: offer a re-sync. But right after a fresh import
        // ('done') it's redundant — the roster already updated — so hide it then.
        state.status === 'done' ? null : (
          <div className="at-import-compact-row">
            <button
              className="at-btn at-btn-secondary at-btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              ⬆ Sync from your save file
            </button>
          </div>
        )
      ) : state.status === 'done' || state.status === 'preview' ? (
        <div className="at-import-rescan">
          <button
            className="at-btn at-btn-secondary at-btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            ↑ Import another file
          </button>
        </div>
      ) : (
        <div className="at-import-drop">
          <span className="at-import-emblem" aria-hidden>
            ✦
          </span>
          <p className="at-import-kicker">Import from WoW</p>
          <h3 className="at-import-title">Drop your Aftertale.lua here</h3>
          <p className="at-import-hint">
            The addon writes this file on <code>/reload</code> or logout. Drop it in and
            we'll catch every hero up — your raw timeline stays intact.
          </p>
          <code className="at-import-path">
            WoW\WTF\Account\&lt;you&gt;\SavedVariables\Aftertale.lua
          </code>
          <button
            className="at-btn at-btn-primary at-import-cta"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {importButtonLabel(state)}
          </button>
        </div>
      )}

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

      {!compact && state.status === 'up-to-date' && (
        <ImportInlineMessage tone="passive">
          No new entries — your save file matches your last import.
        </ImportInlineMessage>
      )}

      {!compact && state.status === 'done' && state.message && (
        <ImportInlineMessage tone="fresh">{state.message}</ImportInlineMessage>
      )}

      {state.status === 'error' && (
        <div
          className="at-callout-danger"
          style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem' }}
        >
          <strong>Import failed:</strong> {state.error}
        </div>
      )}
    </section>
  );
}

type HeroRowKind = 'update' | 'new' | 'quiet';

interface HeroRow {
  character: ImportCharacter;
  kind: HeroRowKind;
  boundName?: string;
}

function describeCharacter(c: ImportCharacter): string {
  const bits = [c.wowRace, c.wowClass].filter(Boolean).join(' ');
  const realm = c.realm ? `of ${c.realm}` : '';
  return [bits, realm].filter(Boolean).join(' ');
}

/**
 * Multi-hero import preview. One Aftertale.lua holds every alt — this lists each
 * one and where its events will land: established heroes update their chronicle,
 * active-enough new toons become draft heroes, and quiet toons (bank alts/mules)
 * are surfaced but skipped. The player can opt any hero out before importing.
 */
export function MultiHeroImportCard({
  state,
  onImport,
  onCancel,
}: {
  state: ImportState;
  onImport: (selection: { declineGuids: string[] }) => void;
  onCancel: () => void;
}) {
  const [declined, setDeclined] = useState<Set<string>>(() => new Set());
  if (!state.plan) return null;
  const { plan } = state;
  const activeName = state.bible?.name;
  const isLegacy = plan.schemaVersion < 2 || plan.characters.length === 0;
  const fileLabel = state.fileName ?? 'Aftertale.lua';

  const rows: HeroRow[] = plan.characters.map((character) => {
    const bound = findBibleByCharacterGuid(character.guid);
    if (bound) return { character, kind: 'update', boundName: bound.name };
    if (character.eventCount >= STUB_MIN_EVENTS) return { character, kind: 'new' };
    return { character, kind: 'quiet' };
  });

  const toggle = (guid: string) => {
    setDeclined((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  };

  const eligible = rows.filter((r) => r.kind !== 'quiet');
  const selectedCount = eligible.filter((r) => !declined.has(r.character.guid)).length;

  return (
    <div
      style={{
        marginBottom: '0.9rem',
        padding: '0.8rem 0.9rem',
        borderRadius: '0.65rem',
        border: '1px solid rgba(164,122,209,0.35)',
        background: 'rgba(164,122,209,0.12)',
        fontSize: '0.88rem',
        lineHeight: 1.5,
      }}
    >
      {isLegacy ? (
        <>
          <strong>✦ Import — {fileLabel} (older format)</strong>
          <div style={{ marginTop: '0.45rem' }}>
            ⚠ {plan.legacyEventCount.toLocaleString()} untagged events — these import to your active hero
            {activeName ? ` "${activeName}"` : ''}. Update the addon to enable per-character attribution.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="at-btn at-btn-primary" onClick={() => onImport({ declineGuids: [] })}>Import</button>
            <button type="button" className="at-btn" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <strong>✦ {rows.length} hero{rows.length === 1 ? '' : 'es'} in this file</strong>
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            Each lands in its own chronicle — we'll update the right hero for you.
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.6rem 0 0' }}>
            {rows.map(({ character, kind, boundName }) => {
              const details = describeCharacter(character);
              const isDeclined = declined.has(character.guid);
              const selectable = kind !== 'quiet';
              return (
                <li
                  key={character.guid}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                    alignItems: 'center',
                    marginTop: '0.3rem',
                    opacity: kind === 'quiet' || isDeclined ? 0.55 : 1,
                  }}
                >
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={!isDeclined}
                      onChange={() => toggle(character.guid)}
                      style={{ accentColor: 'var(--cp-accent, #a47ad1)' }}
                      aria-label={`Include ${character.name}`}
                    />
                  )}
                  <span style={{ fontWeight: 600 }}>{character.name}</span>
                  {details && <span className="muted">· {details}</span>}
                  <span className="muted">· {character.eventCount.toLocaleString()} events</span>
                  {kind === 'update' && (
                    <span style={{ color: 'var(--cp-success, #2f8f46)' }}>
                      → updates {boundName === activeName ? 'this chronicle' : `${boundName}'s chronicle`}
                    </span>
                  )}
                  {kind === 'new' && (
                    <span style={{ color: 'var(--cp-accent, #a47ad1)' }}>✦ new draft hero</span>
                  )}
                  {kind === 'quiet' && (
                    <span className="muted" title={`Fewer than ${STUB_MIN_EVENTS} events`}>
                      · too quiet to chronicle yet
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.some((r) => r.kind === 'quiet') && (
            <div className="muted" style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
              Quiet toons (bank alts, mules) are skipped until they've actually adventured.
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="at-btn at-btn-primary"
              disabled={selectedCount === 0}
              onClick={() => onImport({ declineGuids: Array.from(declined) })}
            >
              {selectedCount <= 1 ? 'Import' : `Import ${selectedCount} heroes`}
            </button>
            <button type="button" className="at-btn" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Account-level import roster. Import is not "as" the active hero — it's a sync
 * of the whole save file. This screen shows every character it found, each with
 * what's new and what's left to write, and lets the player pick who to work on
 * (Open → makes them active + routes to The Inkwell). Brand-new toons are an
 * opt-in start; quiet bank alts are a one-line footnote.
 */
export function ImportDoneSummary({
  state,
  onOpen,
  onAddHero,
}: {
  state: ImportState;
  onOpen: (key: string) => void;
  onAddHero: (guid: string) => void;
}) {
  const result = state.multiResult;
  if (!result) return null;

  const synced = result.characters
    .filter((c) => c.imported + c.refreshed > 0 || c.created)
    .map((c) => ({ ...c, status: heroSessionStatus(c.key, c.name) }))
    .sort((a, b) => b.imported - a.imported);

  // New toons surfaced by the file but not yet chronicled — offered, not minted.
  const committed = new Set(result.characters.map((c) => c.guid));
  const newToons = (state.plan?.characters ?? [])
    .filter(
      (c) =>
        c.eventCount >= STUB_MIN_EVENTS &&
        !committed.has(c.guid) &&
        !findBibleByCharacterGuid(c.guid),
    )
    .sort((a, b) => b.eventCount - a.eventCount);

  return (
    <div className="at-import-receipt">
      <div className="at-import-receipt-head">
        <span className="star" aria-hidden>✦</span>
        Synced from your save file
      </div>

      {synced.length > 0 && (
        <div>
          {synced.map((c) => {
            const bits: string[] = [];
            if (typeof c.level === 'number') bits.push(`lvl ${c.level}`);
            bits.push(
              c.imported > 0
                ? `+${c.imported.toLocaleString()} new moment${c.imported === 1 ? '' : 's'}`
                : 'up to date',
            );
            return (
              <div key={c.key} className="at-import-hero">
                <span className="at-import-hero-name">{c.name}</span>
                <span className="at-import-hero-meta">{bits.join(' · ')}</span>
                {c.status.unwritten > 0 ? (
                  <span className="at-import-hero-todo">
                    {c.status.unwritten} session{c.status.unwritten === 1 ? '' : 's'} to write
                  </span>
                ) : c.status.total > 0 ? (
                  <span className="at-import-hero-done">all written</span>
                ) : null}
                {!c.started && <span className="at-import-hero-tag">captured</span>}
                <button
                  type="button"
                  className={`at-btn at-btn-sm at-import-hero-action ${c.started ? 'at-btn-secondary' : 'at-btn-assist'}`}
                  onClick={() => onOpen(c.key)}
                >
                  {c.started ? `Open ${c.name} →` : `✦ Start ${c.name}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {newToons.length > 0 && (
        <div className="at-import-newgroup">
          <div className="at-import-newgroup-label">
            {synced.length > 0 ? 'Also in this file — ' : ''}character
            {newToons.length === 1 ? '' : 's'} we haven't met yet. Start{' '}
            {newToons.length === 1 ? 'their' : 'a'} chronicle, or leave them be — they'll keep recording.
          </div>
          {newToons.map((c) => {
            const details = describeCharacter(c);
            return (
              <div key={c.guid} className="at-import-newrow">
                <span className="at-import-newrow-name">{c.name}</span>
                {details && <span className="at-import-hero-meta">· {details}</span>}
                <span className="at-import-hero-meta">· {c.eventCount.toLocaleString()} moments</span>
                <button
                  type="button"
                  className="at-btn at-btn-assist at-btn-sm at-import-hero-action"
                  onClick={() => onAddHero(c.guid)}
                >
                  <span className="sparkle">✦</span> Start {c.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {result.belowThreshold.length > 0 && (
        <div className="at-import-skipped">
          {result.belowThreshold.length} quiet toon
          {result.belowThreshold.length === 1 ? '' : 's'} skipped ({result.belowThreshold.map((b) => b.name).join(', ')}) — too little activity to chronicle yet.
        </div>
      )}
    </div>
  );
}

export function ImportInlineMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'fresh' | 'passive';
}) {
  return (
    <div
      style={{
        marginTop: '0.75rem',
        padding: '0.6rem 0.85rem',
        borderRadius: 'var(--r-md)',
        background: tone === 'fresh'
          ? 'rgba(212, 163, 115, 0.10)'
          : 'var(--bg-inset)',
        border: tone === 'fresh'
          ? '1px solid rgba(212, 163, 115, 0.32)'
          : '1px solid var(--border-strong)',
        color: tone === 'fresh' ? 'var(--fg)' : 'var(--fg-muted)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.92rem',
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}
