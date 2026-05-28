// ============================================================================
// SpendBar — the unified top-of-app header strip.
//
// One row, three balanced zones:
//
//   [ logo ]    [ Playing as · {hero} ]    [ account ] [ ⚙ model ]
//
// We intentionally do NOT show a token counter in the public header. The bar
// felt cluttered explaining empty zeros to people who'd never look at them,
// and the OpenRouter dashboard is one click away from settings if a user
// wants the audit trail.
//
// Dev (`npm run dev`, DEV_TOOLS_ENABLED) gets a second muted sub-strip with
// today's tokens / $ estimate that expands into the full per-task breakdown
// drawer — same instrument as before, just demoted out of the user-facing
// chrome.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  computeAverages,
  exportCsv,
  loadTodayRecords,
  purgeOldRecords,
  SPEND_RETENTION_DAYS,
  sumCost,
} from '../lib/spendTracker';
import { MODEL_CHOICES, useSelectedModelIdx } from '../lib/modelChoices';
import { DEV_TOOLS_ENABLED } from '../lib/devTools';
import { assetUrl } from '../lib/assetUrl';
import { AccountMenu } from './AccountMenu';
import { CharacterSelector } from './CharacterSelector';
import type { SettingsSectionId } from './SettingsPanel';

interface SpendBarProps {
  onOpenSettings?: (section?: SettingsSectionId) => void;
  hasAnyKey?: boolean;
}

export function SpendBar({ onOpenSettings, hasAnyKey = true }: SpendBarProps = {}) {
  const [modelIdx] = useSelectedModelIdx();
  const activeModelLabel = MODEL_CHOICES[modelIdx]?.label ?? 'Model';

  return (
    <div className="at-tokenbar" role="banner">
      <div className="at-tokenbar-row">
        <a
          href="/"
          className="at-tokenbar-brand"
          aria-label="Aftertale — home"
        >
          <img
            src={assetUrl('aftertale-logo.png')}
            alt="Aftertale"
            className="at-tokenbar-logo"
          />
        </a>

        <div className="at-tokenbar-center">
          <CharacterSelector />
        </div>

        <div className="at-tokenbar-right">
          <AccountMenu onOpenSettings={onOpenSettings} />
          {onOpenSettings && (
            <button
              type="button"
              className={`at-btn at-btn-sm ${hasAnyKey ? 'at-btn-secondary' : 'at-btn-primary'}`}
              onClick={() => onOpenSettings(hasAnyKey ? undefined : 'apiKeys')}
              title={hasAnyKey ? 'Settings' : 'Set up an API key to start using the app'}
              aria-label={hasAnyKey ? 'Settings' : 'Add OpenRouter key'}
            >
              {hasAnyKey ? '⚙' : '⚙ Add OpenRouter key'}
            </button>
          )}
        </div>
      </div>

      {DEV_TOOLS_ENABLED && (
        <DevSpendStrip
          activeModelLabel={activeModelLabel}
          onOpenModelPicker={onOpenSettings ? () => onOpenSettings('models') : undefined}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Dev-only sub-strip: today's tokens, $ estimate, expandable per-task drawer.
// Never rendered in production builds.
// ----------------------------------------------------------------------------
function DevSpendStrip({
  activeModelLabel,
  onOpenModelPicker,
}: {
  activeModelLabel: string;
  onOpenModelPicker?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setTick((n) => n + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('at:usage-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('at:usage-updated', handler);
    };
  }, []);

  const records = useMemo(() => loadTodayRecords(), [tick]);
  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const r of records) {
      input += r.inputTokens;
      output += r.outputTokens;
    }
    return { input, output };
  }, [records]);

  const today = useMemo(() => sumCost(records), [records]);
  const averages = useMemo(() => computeAverages(records), [records]);
  const todayColor = today > 1 ? '#e85d4d' : today > 0.5 ? '#e8c14d' : '#7dd87a';

  function handleExport() {
    const csv = exportCsv(records);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `at-spend-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePurgeOldRecords() {
    const ok = window.confirm(
      `Remove spend-tracking buckets older than ${SPEND_RETENTION_DAYS} days?\n\n` +
        'Recent spend records, character bibles, NPC chats, and API keys will not be touched.',
    );
    if (!ok) return;
    const removed = purgeOldRecords();
    setTick((n) => n + 1);
    setHistoryMessage(
      removed === 1
        ? `Removed 1 spend bucket older than ${SPEND_RETENTION_DAYS} days.`
        : `Removed ${removed} spend buckets older than ${SPEND_RETENTION_DAYS} days.`,
    );
  }

  return (
    <>
      <div
        className="at-tokenbar-devbar"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
        title="Dev-only spend tracker (hidden in production builds)"
      >
        <span className="at-tokenbar-devbar-tag">DEV</span>
        {onOpenModelPicker ? (
          <button
            type="button"
            className="at-tokenbar-devbar-modellink"
            onClick={(e) => {
              e.stopPropagation();
              onOpenModelPicker();
            }}
            title={`Active model: ${activeModelLabel} — click to switch`}
          >
            {activeModelLabel}
          </button>
        ) : (
          <span className="at-tokenbar-devbar-stat">{activeModelLabel}</span>
        )}
        <span className="at-tokenbar-devbar-sep" aria-hidden="true">·</span>
        <span className="at-tokenbar-devbar-stat">
          {formatTokens(totals.input)} in · {formatTokens(totals.output)} out · {records.length} call
          {records.length === 1 ? '' : 's'}
        </span>
        <span className="at-tokenbar-devbar-stat" style={{ color: todayColor }}>
          ${today.toFixed(4)}
        </span>
        <span className="at-tokenbar-devbar-caret" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {expanded && (
        <div className="at-tokenbar-drawer">
          <p className="at-tokenbar-dev-note">
            <strong>Dev-only:</strong> cost columns use the static pricing table at <code>src/pricing.ts</code>.
            Hidden from users in production builds.
          </p>
          {averages.length === 0 ? (
            <p className="at-tokenbar-empty">No usage yet today. Make an LLM call to see data.</p>
          ) : (
            <table className="at-tokenbar-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Model</th>
                  <th style={{ textAlign: 'right' }}>Calls</th>
                  <th style={{ textAlign: 'right' }}>Avg in</th>
                  <th style={{ textAlign: 'right' }}>Avg cached</th>
                  <th style={{ textAlign: 'right' }}>Avg out</th>
                  <th style={{ textAlign: 'right' }}>Avg $</th>
                  <th style={{ textAlign: 'right' }}>Total $</th>
                </tr>
              </thead>
              <tbody>
                {averages.map((a) => (
                  <tr key={`${a.task}::${a.model}`}>
                    <td>{a.task}</td>
                    <td>{a.model}</td>
                    <td style={{ textAlign: 'right' }}>{a.calls}</td>
                    <td style={{ textAlign: 'right' }}>{a.avgInput.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>{a.avgCached.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>{a.avgOutput.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>${a.avgCostUsd.toFixed(5)}</td>
                    <td style={{ textAlign: 'right' }}>${a.totalCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="at-tokenbar-actions">
            <button className="at-btn at-btn-secondary at-btn-sm" onClick={handleExport}>
              Export CSV
            </button>
            <button
              className="at-btn at-btn-secondary at-btn-sm"
              onClick={handlePurgeOldRecords}
              title={`Remove only spend buckets older than ${SPEND_RETENTION_DAYS} days`}
            >
              Purge old spend records
            </button>
          </div>
          {historyMessage && <p className="at-tokenbar-history">{historyMessage}</p>}
        </div>
      )}
    </>
  );
}

function formatTokens(n: number): string {
  if (n < 1_000) return n.toLocaleString();
  if (n < 10_000) return `${(n / 1_000).toFixed(2)}k`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
