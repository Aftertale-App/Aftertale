// ============================================================================
// AddonImport — drag/drop or click-to-select a Aftertale.lua file
// from WoW's WTF\Account\<acct>\SavedVariables\ folder. Parses it, hydrates
// the addonEventStore with `source: 'wow-addon'` events that preserve the
// addon's raw ts + args so the chronicle export round-trip works.
// ============================================================================

import { useCallback, useRef, useState } from 'react';
import { loadBible } from '../lib/bibleStore';
import {
  appendAddonEventRecord,
  hasAddonEvent,
  loadAddonEventRecords,
} from '../lib/addonEventStore';
import {
  hashFileContents,
  loadImportRecord,
  saveImportRecord,
  type ImportRecord,
} from '../lib/importTracker';
import {
  ingestChroniclesSavedVariablesText,
  type IngestSummary,
} from '../lib/savedVariablesIngest';

export interface ImportState {
  status: 'idle' | 'checking' | 'parsing' | 'done' | 'up-to-date' | 'error';
  summary?: IngestSummary;
  imported?: number;
  duplicates?: number;
  error?: string;
  fileName?: string;
  newEvents?: number;
  previousRecord?: ImportRecord | null;
}

export function importButtonLabel(state: ImportState, idleLabel = '⬆ Choose file'): string {
  if (state.status === 'checking') return 'Checking...';
  if (state.status === 'parsing') return 'Parsing...';
  if (state.status === 'up-to-date') return 'Already up to date';
  return idleLabel;
}

export function useAftertaleLuaImport() {
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  const handleFile = useCallback(async (file: File) => {
    setState({ status: 'checking', fileName: file.name });
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        fileName: file.name,
      });
      return;
    }

    const bible = loadBible();
    const characterKey = bible ? String(bible.createdAt) : null;
    const fileHash = await hashFileContents(text);
    const previousRecord = loadImportRecord(characterKey);

    if (previousRecord?.fileHash === fileHash) {
      setState({
        status: 'up-to-date',
        fileName: file.name,
        previousRecord,
      });
      return;
    }

    setState({ status: 'parsing', fileName: file.name, previousRecord });

    try {
      const result = ingestChroniclesSavedVariablesText(text);
      const eventCount = result.events.length;
      const latestEventAt = result.events.reduce(
        (latest, event) => Math.max(latest, event.timestamp || 0),
        0,
      );
      const savedAt = Date.now();

      if (characterKey) {
        saveImportRecord(characterKey, {
          fileHash,
          fileSize: file.size,
          importedAt: savedAt,
          eventCount,
          latestEventAt,
        });
      }

      // Use a snapshot of existing IDs so the dedupe check is O(1) across the
      // batch. hasAddonEvent re-reads localStorage each call.
      const existing = new Set(loadAddonEventRecords().map((r) => r.event.id));
      let imported = 0;
      let duplicates = 0;
      for (const event of result.events) {
        if (existing.has(event.id) || hasAddonEvent(event.id)) {
          duplicates++;
          continue;
        }
        appendAddonEventRecord({
          event,
          characterKey,
          result: {
            status: 'ingested',
            message: 'Imported from SavedVariables.',
            changes: [],
            characterKey: characterKey ?? undefined,
          },
          savedAt,
        });
        existing.add(event.id);
        imported++;
      }

      const newEvents = previousRecord && eventCount > previousRecord.eventCount
        ? eventCount - previousRecord.eventCount
        : eventCount;

      setState({
        status: 'done',
        summary: result.summary,
        imported,
        duplicates,
        fileName: file.name,
        newEvents,
        previousRecord,
      });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        fileName: file.name,
        previousRecord,
      });
    }
  }, []);

  return { state, handleFile };
}

export function AddonImport() {
  const { state, handleFile } = useAftertaleLuaImport();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
            disabled={state.status === 'checking' || state.status === 'parsing'}
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

      {state.status === 'done' && typeof state.newEvents === 'number' && (
        <ImportInlineMessage tone="fresh">
          ✨ Picked up {state.newEvents.toLocaleString()} new events since your last import
        </ImportInlineMessage>
      )}

      {state.status === 'done' && state.summary && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.6rem 0.8rem',
            borderRadius: '0.5rem',
            background: 'var(--cp-surface-soft, rgba(0,0,0,0.04))',
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          <strong>{state.fileName}</strong>
          <div>
            Found {state.summary.found} addon events · imported{' '}
            <strong>{state.imported ?? 0}</strong> · skipped duplicates{' '}
            {state.duplicates ?? 0} · skipped malformed {state.summary.skipped}
            {state.summary.schemaVersion !== null
              ? ` · schemaVersion ${state.summary.schemaVersion}`
              : ''}
          </div>
          {state.summary.warnings.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
              {state.summary.warnings.map((w, i) => (
                <li key={i} className="muted">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
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
