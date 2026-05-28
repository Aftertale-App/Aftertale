// ============================================================================
// AddonImport — drag/drop or click-to-select a Aftertale.lua file
// from WoW's WTF\Account\<acct>\SavedVariables\ folder. Parses it, previews
// character attribution, then hydrates addonEventStore for the active bible.
// ============================================================================

import { useCallback, useRef, useState } from 'react';
import type { CharacterBible } from '../types';
import {
  findBibleByCharacterGuid,
  loadBible,
  setBibleCharacterBinding,
} from '../lib/bibleStore';
import {
  commitImport,
  planImport as buildImportPlan,
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
  return `✓ ${name} · ${result.imported.toLocaleString()} events imported. (${skipped.toLocaleString()} events from other characters skipped.)`;
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

    const loadedBible = loadBible();
    if (!loadedBible) {
      setState({
        status: 'error',
        error: 'No active character bible. Roll or select a hero before importing addon events.',
        fileName: file.name,
        fileModified: file.lastModified,
      });
      return;
    }

    const fileHash = await hashFileContents(text);
    const characterKey = String(loadedBible.createdAt);
    const previousRecord = loadImportRecord(characterKey);
    if (previousRecord?.fileHash === fileHash) {
      setState({
        status: 'up-to-date',
        fileName: file.name,
        fileModified: file.lastModified,
        fileHash,
        fileSize: file.size,
        bible: loadedBible,
        previousRecord,
      });
      return;
    }

    setState({
      status: 'parsing',
      fileName: file.name,
      fileModified: file.lastModified,
      fileHash,
      fileSize: file.size,
      bible: loadedBible,
      previousRecord,
    });

    try {
      const plan = buildImportPlan(text);
      let bible = loadedBible;
      const autoClaim = matchingAutoclaim(plan, bible);
      if (autoClaim) {
        bible = bindBibleToCharacter(bible, autoClaim);
      }

      const prepared: ImportState = {
        status: 'preview',
        plan,
        bible,
        fileName: file.name,
        fileModified: file.lastModified,
        fileHash,
        fileSize: file.size,
        previousRecord,
      };

      if (mode === 'smart' && shouldSmartAutoCommit(plan, bible)) {
        commitPreparedImport(prepared);
        return;
      }

      setState(prepared);
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

  return {
    state,
    handleFile,
    commitPreparedImport,
    bindCharacter,
    cancelPreview,
    planImport: buildImportPlan,
    commitImport,
  };
}

export function AddonImport() {
  const { state, handleFile, commitPreparedImport, bindCharacter, cancelPreview } = useAftertaleLuaImport({ mode: 'preview' });
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
      className="at-panel"
      style={{
        marginTop: '1rem',
        padding: '1rem 1.25rem',
        border: dragging
          ? '2px dashed var(--cp-accent, #b11f4b)'
          : '2px dashed var(--cp-border, #dedede)',
        borderRadius: '0.75rem',
        background: dragging ? 'var(--cp-accent-soft, rgba(177,31,75,0.06))' : 'transparent',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {state.status === 'preview' && state.plan && state.bible && (
        <ImportPreviewCard
          state={state}
          onImport={() => commitPreparedImport()}
          onCancel={cancelPreview}
          onBind={bindCharacter}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <p className="at-kicker">Import from WoW</p>
          <h3 style={{ margin: '0.1rem 0 0.35rem' }}>Drop your Aftertale.lua here</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Find it under{' '}
            <code style={{ wordBreak: 'break-all' }}>
              WoW\WTF\Account\&lt;you&gt;\SavedVariables\Aftertale.lua
            </code>
            . The addon writes this on <code>/reload</code> or logout. Importing here keeps your{' '}
            raw <code>ts</code> + <code>args</code> intact so the <code>/aftertale sync</code>{' '}
            round-trip lands.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="at-btn at-btn-primary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {importButtonLabel(state)}
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
      </div>

      {state.status === 'up-to-date' && (
        <ImportInlineMessage tone="passive">
          No new entries — your save file matches your last import.
        </ImportInlineMessage>
      )}

      {state.status === 'done' && state.message && (
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

export function ImportPreviewCard({
  state,
  onImport,
  onCancel,
  onBind,
}: {
  state: ImportState;
  onImport: () => void;
  onCancel: () => void;
  onBind: (character: ImportCharacter) => void;
}) {
  if (!state.plan || !state.bible) return null;
  const { plan, bible } = state;
  const isLegacy = plan.schemaVersion < 2 || plan.characters.length === 0;
  const fileLabel = state.fileName ?? 'Aftertale.lua';
  const dateLabel = state.fileModified
    ? new Date(state.fileModified).toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'loaded file';

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
      <strong>✦ Import preview — {fileLabel} ({isLegacy ? 'older format, no character tags' : dateLabel})</strong>
      {isLegacy ? (
        <div style={{ marginTop: '0.45rem' }}>
          ⚠ {plan.legacyEventCount.toLocaleString()} untagged events — will all import to "{bible.name}" bible. Update the addon to schemaVersion 2 to enable per-character attribution.
        </div>
      ) : (
        <>
          <div className="muted">
            schemaVersion {plan.schemaVersion} · {plan.totalEvents.toLocaleString()} events total
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.55rem 0 0' }}>
            {plan.characters.map((character) => {
              const isActive = bible.characterGuid === character.guid;
              const boundBible = findBibleByCharacterGuid(character.guid);
              const details = [character.realm ? `of ${character.realm}` : '', [character.wowRace, character.wowClass].filter(Boolean).join(' ')].filter(Boolean).join(' ');
              return (
                <li key={character.guid} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <span>{isActive ? '✓' : '⚠'} {character.name}{details ? ` ${details}` : ''}</span>
                  <span className="muted">· {character.eventCount.toLocaleString()} events</span>
                  {isActive ? (
                    <span style={{ color: 'var(--cp-success, #2f8f46)' }}>→ import to this bible</span>
                  ) : (
                    <span className="muted">· {boundBible ? `bound to ${boundBible.name}` : 'no bible bound'}</span>
                  )}
                  {/* TODO(multi-bible): let the importer target/bind non-active bibles from this row. */}
                  {!isActive && !bible.characterGuid && (
                    <button type="button" className="at-btn" style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }} onClick={() => onBind(character)}>
                      Bind '{bible.name}' bible to this character
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {plan.legacyEventCount > 0 && (
            <div className="muted" style={{ marginTop: '0.35rem' }}>
              ⚠ {plan.legacyEventCount.toLocaleString()} untagged legacy events found; schemaVersion 2 imports skip them for safety.
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className="at-btn at-btn-primary" onClick={onImport}>Import</button>
        <button type="button" className="at-btn" onClick={onCancel}>Cancel</button>
      </div>
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
        padding: '0.55rem 0.75rem',
        borderRadius: '0.55rem',
        background: tone === 'fresh'
          ? 'rgba(164,122,209,0.18)'
          : 'var(--cp-surface-soft, rgba(0,0,0,0.04))',
        border: tone === 'fresh'
          ? '1px solid rgba(164,122,209,0.35)'
          : '1px solid rgba(255,255,255,0.12)',
        fontSize: '0.85rem',
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}
