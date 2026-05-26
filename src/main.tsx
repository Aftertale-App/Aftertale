import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LandingPage } from './components/LandingPage';
import './index.css';

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    function onHash() {
      setHash(window.location.hash);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // #app (or any subroute under it) goes to the application. Everything else
  // shows the marketing landing page.
  if (hash.startsWith('#app')) {
    return <App />;
  }
  return <LandingPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
