import { SpendBar } from './components/SpendBar';
import { SmokeTest } from './components/SmokeTest';

export function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SpendBar />
      <main style={{ flex: 1, padding: '2rem', maxWidth: 960, margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', marginBottom: '0.25rem' }}>
          Chronicles of Azeroth
        </h1>
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          Phase 0 — Proof of Concept. Scaffold ready. Build the character creation flow next.
        </p>

        <SmokeTest />

        <section style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #3a3228', borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Next steps</h2>
          <ol>
            <li>Model picker → wire into chat (done in smoke test, generalize next)</li>
            <li>Character creation interview screen → generate bible</li>
            <li>NPC selection + chat screen (Tirion / Sylvanas / Jaina / Bolvar)</li>
            <li>Manual event entry to feed the chat context</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
