import { useState } from 'react';
import { SpendBar } from './components/SpendBar';
import { SmokeTest } from './components/SmokeTest';
import { CharacterCreation } from './components/CharacterCreation';

type Tab = 'character' | 'smoke';

export function App() {
  const [tab, setTab] = useState<Tab>('character');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SpendBar />
      <main style={{ flex: 1, padding: '2rem', maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', marginBottom: '0.25rem' }}>
          Chronicles of Azeroth
        </h1>
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          Phase 0 — Proof of Concept. Roll a character, then talk to an NPC (coming next).
        </p>

        <nav style={{ display: 'flex', gap: '0.25rem', marginTop: '1.5rem', borderBottom: '1px solid #3a3228' }}>
          <TabButton active={tab === 'character'} onClick={() => setTab('character')}>
            📜 Character
          </TabButton>
          <TabButton active={tab === 'smoke'} onClick={() => setTab('smoke')}>
            🔥 Smoke test
          </TabButton>
        </nav>

        {tab === 'character' && <CharacterCreation />}
        {tab === 'smoke' && <SmokeTest />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1f1812' : 'transparent',
        color: active ? '#e8e4d8' : '#a89c80',
        border: '1px solid #3a3228',
        borderBottom: active ? '1px solid #1f1812' : '1px solid #3a3228',
        marginBottom: -1,
        padding: '0.5rem 1rem',
        borderRadius: '4px 4px 0 0',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
