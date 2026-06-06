// ============================================================================
// On-demand Cloudflare Turnstile token.
//
// The hosted free-tier gateway (functions/api/generate.ts) requires a Turnstile
// token whenever TURNSTILE_SECRET is configured server-side. This renders an
// invisible widget on demand, runs the challenge, and resolves a single-use
// token (~300s TTL) — so we mint a fresh one right before each protected call
// rather than holding a stale one.
//
// Site key is public and comes from build-time env (VITE_TURNSTILE_SITE_KEY).
// If it's absent, getTurnstileToken() resolves '' — the server then rejects the
// call (fail-closed) when Turnstile is enforced, which is the correct posture.
// ============================================================================

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function isTurnstileConfigured(): boolean {
  return !!SITE_KEY;
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // allow a retry on a later attempt
      reject(new Error('Could not load the Turnstile script.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function waitForApi(timeoutMs = 5000): Promise<TurnstileApi> {
  const start = performance.now();
  while (!window.turnstile) {
    if (performance.now() - start > timeoutMs) throw new Error('Turnstile API never became ready.');
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.turnstile;
}

/**
 * Render an invisible Turnstile widget, run the challenge, and resolve a
 * single-use token. Returns '' when no site key is configured.
 */
export async function getTurnstileToken(): Promise<string> {
  if (!SITE_KEY) return '';
  await loadScript();
  const ts = await waitForApi();

  return new Promise<string>((resolve, reject) => {
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);

    let settled = false;
    let widgetId: string | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (widgetId) ts.remove(widgetId);
      } catch {
        /* widget already gone */
      }
      container.remove();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error('Turnstile timed out.'))), 30000);

    try {
      widgetId = ts.render(container, {
        sitekey: SITE_KEY,
        size: 'invisible',
        callback: (token: string) => finish(() => resolve(token)),
        'error-callback': () => finish(() => reject(new Error('Turnstile challenge failed.'))),
        'timeout-callback': () => finish(() => reject(new Error('Turnstile timed out.'))),
      });
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error('Turnstile render failed.')));
    }
  });
}
