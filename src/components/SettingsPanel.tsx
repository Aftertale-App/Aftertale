import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  clearApiKey,
  getKeyStatus,
  setApiKey,
  type KeyStatus,
} from '../lib/apiKeys';
import { getShowScribesDesk, setShowScribesDesk } from '../lib/featureFlags';
import { ModelPicker } from './ModelPicker';
import { useSelectedModelIdx } from '../lib/modelChoices';
import { useAuth, signOut } from '../lib/auth';
import { clearAddonEventRecords } from '../lib/addonEventStore';
import { clearEnrichments, ENRICHMENTS_UPDATED_EVENT } from '../lib/enrichmentStore';
import { loadBible, clearAddonHistoryEntries } from '../lib/bibleStore';
import { SaveChronicleModal, type AuthModalMode } from './SaveChronicleModal';

export type SettingsSectionId = 'account' | 'apiKeys' | 'models' | 'data' | 'advanced';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  initialSection?: SettingsSectionId;
}

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'account', label: 'Account', icon: '◆' },
  { id: 'apiKeys', label: 'API Keys', icon: '⚿' },
  { id: 'models', label: 'Models', icon: '⚙' },
  { id: 'data', label: 'Data', icon: '◈' },
  { id: 'advanced', label: 'Advanced', icon: '⚒' },
];

export function SettingsPanel({ open, onClose, initialSection }: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSectionId>(initialSection ?? 'models');

  // Whenever the panel is opened with a new initialSection, jump to it.
  useEffect(() => {
    if (open && initialSection) setSection(initialSection);
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="at-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="at-modal at-settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-settings-title"
      >
        <header className="at-modal-header">
          <h2 id="at-settings-title" style={{ margin: 0 }}>Settings</h2>
          <button
            className="at-modal-close"
            onClick={onClose}
            aria-label="Close settings"
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        <div className="at-settings-shell">
          <nav className="at-settings-sidebar" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`at-settings-navitem${section === s.id ? ' at-settings-navitem-active' : ''}`}
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? 'page' : undefined}
              >
                <span className="at-settings-navitem-icon" aria-hidden="true">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>

          <div className="at-settings-content">
            {section === 'account' && <AccountSection />}
            {section === 'apiKeys' && <ApiKeysSection />}
            {section === 'models' && <ModelsSection />}
            {section === 'data' && <DataSection />}
            {section === 'advanced' && <AdvancedSection />}
          </div>
        </div>

        <footer className="at-modal-footer">
          <button className="at-btn at-btn-secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// --- Section: Account ---------------------------------------------------------

function AccountSection() {
  const { status, email } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('save');

  function openAuthModal(mode: AuthModalMode) {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }

  return (
    <SectionShell
      title="Account"
      kicker="Identity"
      blurb="Your hero lives in this browser until you save them. Saving ties them to an email so they survive a cleared cache or a new device."
    >
      {status === 'disabled' && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Account features are disabled in this build (no Supabase configured).
        </p>
      )}

      {status === 'loading' && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Loading account state…</p>
      )}

      {status === 'anonymous' && (
        <div className="at-settings-stack">
          <div className="at-settings-pair">
            <span className="at-settings-pair-label">Status</span>
            <span className="at-key-badge at-key-badge-missing">Anonymous</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Your chronicle is local-only. Save it to keep your hero across browsers and devices.
          </p>
          <div className="at-settings-row">
            <button
              type="button"
              className="at-btn at-btn-primary"
              onClick={() => openAuthModal('save')}
            >
              ◆ Save your chronicle
            </button>
            <button
              type="button"
              className="at-btn at-btn-secondary"
              onClick={() => openAuthModal('signin')}
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      {status === 'authed' && (
        <div className="at-settings-stack">
          <div className="at-settings-pair">
            <span className="at-settings-pair-label">Signed in as</span>
            <code className="at-settings-pair-value">{email ?? '(unknown)'}</code>
          </div>
          <div className="at-settings-pair">
            <span className="at-settings-pair-label">Status</span>
            <span className="at-key-badge at-key-badge-local">Authenticated</span>
          </div>
          <div className="at-settings-row">
            <button
              type="button"
              className="at-btn at-btn-secondary"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <SaveChronicleModal
        open={authModalOpen}
        mode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSwitchMode={(m) => setAuthModalMode(m)}
      />
    </SectionShell>
  );
}

// --- Section: API Keys --------------------------------------------------------

function ApiKeysSection() {
  const [status, setStatus] = useState<KeyStatus>(() => getKeyStatus('openrouter'));
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);

  function save() {
    const value = draft.trim();
    if (!value) return;
    setApiKey('openrouter', value);
    setStatus(getKeyStatus('openrouter'));
    setDraft('');
  }

  function clear() {
    if (!window.confirm('Remove the saved OpenRouter key from this browser?')) return;
    clearApiKey('openrouter');
    setStatus(getKeyStatus('openrouter'));
  }

  return (
    <SectionShell
      title="API Keys"
      kicker="Provider credentials"
      blurb="Your key is stored only in this browser's localStorage — never sent to any server but the provider itself. It overrides anything baked into the build at deploy time."
    >
      <div className="at-settings-pair">
        <span className="at-settings-pair-label">OpenRouter</span>
        <StatusBadge status={status} />
      </div>
      {status.hasKey && (
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: 13 }}>
          Active key: <code>{status.masked}</code> (from{' '}
          {status.source === 'localStorage' ? 'this browser' : 'build-time env'})
        </p>
      )}
      <div className="at-settings-row">
        <input
          className="at-input"
          type={reveal ? 'text' : 'password'}
          placeholder={status.hasKey ? 'Paste a new key to replace…' : 'Paste your OpenRouter key…'}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button
          type="button"
          className="at-btn at-btn-secondary at-btn-sm"
          onClick={() => setReveal((r) => !r)}
          title={reveal ? 'Hide key' : 'Show key'}
        >
          {reveal ? '🙈' : '👁'}
        </button>
        <button
          type="button"
          className="at-btn at-btn-primary at-btn-sm"
          onClick={save}
          disabled={!draft.trim()}
        >
          Save
        </button>
        {status.source === 'localStorage' && (
          <button
            type="button"
            className="at-btn at-btn-secondary at-btn-sm"
            onClick={clear}
            title="Forget the saved key"
          >
            Forget
          </button>
        )}
      </div>
      <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: 12 }}>
        One key, every model (Claude, GPT, Gemini, …).{' '}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer noopener">
          openrouter.ai/keys
        </a>
        .
      </p>
    </SectionShell>
  );
}

// --- Section: Models ----------------------------------------------------------

function ModelsSection() {
  const [modelIdx, setModelIdx] = useSelectedModelIdx();
  return (
    <SectionShell
      title="Models"
      kicker="Default LLM"
      blurb="One choice for every generate surface (chapters, recaps, NPC chat, Scribe's Notes). Switch here any time — your pick sticks per browser."
    >
      <ModelPicker value={modelIdx} onChange={setModelIdx} label="Active model" />
    </SectionShell>
  );
}

// --- Section: Data ------------------------------------------------------------

function DataSection() {
  const bible = useMemo(() => loadBible(), []);
  const characterKey = bible ? String(bible.createdAt) : null;
  const characterName = bible?.name ?? null;
  const [armed, setArmed] = useState<null | 'character' | 'all'>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  function purgeCharacter() {
    if (!characterKey) return;
    if (armed !== 'character') {
      setArmed('character');
      return;
    }
    const removed = clearAddonEventRecords(characterKey);
    clearEnrichments(characterKey);
    clearAddonHistoryEntries();
    setArmed(null);
    setFlash(
      `Cleared ${removed} session event${removed === 1 ? '' : 's'} for ${characterName ?? 'this character'}.`,
    );
  }

  function purgeAll() {
    if (armed !== 'all') {
      setArmed('all');
      return;
    }
    const removed = clearAddonEventRecords();
    let enrichKeys = 0;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('at.enrichments.')) {
        localStorage.removeItem(key);
        enrichKeys += 1;
      }
    }
    window.dispatchEvent(new Event(ENRICHMENTS_UPDATED_EVENT));
    clearAddonHistoryEntries();
    setArmed(null);
    setFlash(
      `Cleared ${removed} session event${removed === 1 ? '' : 's'} across all characters` +
        (enrichKeys > 0
          ? ` + ${enrichKeys} enrichment store${enrichKeys === 1 ? '' : 's'}.`
          : '.'),
    );
  }

  return (
    <SectionShell
      title="Data"
      kicker="Local storage"
      blurb="Everything Aftertale stores lives in this browser. Your character bible and manual chronicle entries are never touched by the actions below."
    >
      <div className="at-desk-dangerzone" style={{ marginTop: 0 }}>
        <div className="at-desk-dangerzone-head">
          <span className="at-desk-dangerzone-label">⚠ Danger zone</span>
          <span className="at-desk-dangerzone-hint">
            Wipes <strong>session events &amp; enrichments</strong> from this browser. Your character
            bible (name, class, level, story) and manual chronicle entries are preserved.
          </span>
        </div>
        <div className="at-desk-dangerzone-actions">
          <button
            type="button"
            className={`at-btn at-btn-danger${armed === 'character' ? ' at-btn-danger-armed' : ''}`}
            disabled={!characterKey}
            onClick={purgeCharacter}
            title={
              characterKey
                ? `Wipe session events + enrichments for ${characterName ?? 'the active character'} (bible & manual entries preserved)`
                : 'No active character'
            }
          >
            {armed === 'character'
              ? '⚠ Click again to confirm'
              : `✕ Clear sessions for ${characterName ? `"${characterName}"` : 'this character'}`}
          </button>
          <button
            type="button"
            className={`at-btn at-btn-danger at-btn-danger-strong${armed === 'all' ? ' at-btn-danger-armed' : ''}`}
            onClick={purgeAll}
            title="Wipe session events + enrichments for EVERY character on this device (bibles & manual entries preserved)"
          >
            {armed === 'all'
              ? '⚠ Click again to confirm — ALL characters'
              : '✕ Clear sessions for ALL characters'}
          </button>
          {armed && (
            <button
              type="button"
              className="at-btn at-btn-secondary at-btn-sm"
              onClick={() => setArmed(null)}
            >
              Cancel
            </button>
          )}
        </div>
        {flash && (
          <p className="at-desk-dangerzone-flash" role="status">
            ✓ {flash}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

// --- Section: Advanced --------------------------------------------------------

function AdvancedSection() {
  const [showDesk, setShowDesk] = useState<boolean>(() => getShowScribesDesk());

  return (
    <SectionShell
      title="Advanced"
      kicker="Feature flags"
      blurb="Toggles for dev-flavored surfaces and experimental UI."
    >
      <label className="at-settings-toggle">
        <input
          type="checkbox"
          checked={showDesk}
          onChange={(e) => {
            setShowDesk(e.target.checked);
            setShowScribesDesk(e.target.checked);
          }}
        />
        <span>
          Show <strong>Scribe's Desk</strong> tab
          <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
            (manual SV import → enrich → export workflow)
          </span>
        </span>
      </label>
    </SectionShell>
  );
}

// --- Shared section shell -----------------------------------------------------

function SectionShell({
  title,
  kicker,
  blurb,
  children,
}: {
  title: string;
  kicker: string;
  blurb?: string;
  children: ReactNode;
}) {
  return (
    <section className="at-settings-pane">
      <header className="at-settings-pane-head">
        <p className="at-kicker">{kicker}</p>
        <h3 className="at-settings-pane-title">{title}</h3>
        {blurb && <p className="at-settings-pane-blurb">{blurb}</p>}
      </header>
      <div className="at-settings-pane-body">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: KeyStatus }) {
  if (!status.hasKey) return <span className="at-key-badge at-key-badge-missing">No key</span>;
  if (status.source === 'localStorage') return <span className="at-key-badge at-key-badge-local">Saved here</span>;
  return <span className="at-key-badge at-key-badge-env">From build env</span>;
}
