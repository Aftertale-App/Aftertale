import { useMemo, useState, useEffect } from 'react';
import {
  computeAverages,
  exportCsv,
  loadTodayRecords,
  sumCost,
} from '../lib/spendTracker';

export function SpendBar() {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Re-read on storage events (other tabs) AND custom in-tab events.
  useEffect(() => {
    const handler = () => setTick((n) => n + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('coa:usage-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('coa:usage-updated', handler);
    };
  }, []);

  const records = useMemo(() => loadTodayRecords(), [tick]);
  const today = useMemo(() => sumCost(records), [records]);
  const averages = useMemo(() => computeAverages(records), [records]);
  const lastCall = records.at(-1);

  const todayColor = today > 1 ? '#e85d4d' : today > 0.5 ? '#e8c14d' : '#7dd87a';

  function handleExport() {
    const csv = exportCsv(records);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coa-spend-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        background: '#22180f',
        borderBottom: '1px solid #3a2a1a',
        padding: '0.5rem 1rem',
        fontFamily: 'Consolas, monospace',
        fontSize: 13,
        color: '#d4c8a8',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          <strong>Today:</strong>{' '}
          <span style={{ color: todayColor }}>${today.toFixed(4)}</span>
        </span>
        <span>
          <strong>Calls:</strong> {records.length}
        </span>
        {lastCall && (
          <span style={{ opacity: 0.75 }}>
            <strong>Last:</strong> {lastCall.inputTokens} in / {lastCall.outputTokens} out → $
            {lastCall.costUsd.toFixed(4)} ({lastCall.model}, {lastCall.tier})
          </span>
        )}
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>
          {expanded ? '▼ click to collapse' : '▶ click for breakdown'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
          {averages.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No usage yet today. Make an LLM call to see data.</p>
          ) : (
            <>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a2a1a', textAlign: 'left' }}>
                    <th style={th}>Task</th>
                    <th style={th}>Model</th>
                    <th style={thR}>Calls</th>
                    <th style={thR}>Avg in</th>
                    <th style={thR}>Avg cached</th>
                    <th style={thR}>Avg out</th>
                    <th style={thR}>Avg $</th>
                    <th style={thR}>Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {averages.map((a) => (
                    <tr key={`${a.task}::${a.model}`} style={{ borderBottom: '1px solid #2a2018' }}>
                      <td style={td}>{a.task}</td>
                      <td style={td}>{a.model}</td>
                      <td style={tdR}>{a.calls}</td>
                      <td style={tdR}>{a.avgInput.toFixed(0)}</td>
                      <td style={tdR}>{a.avgCached.toFixed(0)}</td>
                      <td style={tdR}>{a.avgOutput.toFixed(0)}</td>
                      <td style={tdR}>${a.avgCostUsd.toFixed(5)}</td>
                      <td style={tdR}>${a.totalCostUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport();
                }}
                style={{
                  marginTop: '0.75rem',
                  background: '#3a2a1a',
                  color: '#d4c8a8',
                  border: '1px solid #5a4a3a',
                  padding: '0.25rem 0.75rem',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                Export CSV
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '0.25rem 0.5rem', fontWeight: 600 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '0.25rem 0.5rem' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
