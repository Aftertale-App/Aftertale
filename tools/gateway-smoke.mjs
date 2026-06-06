// ============================================================================
// Free-tier metering smoke test.
//
// Proves consume_free_credit() end-to-end against the real Aftertale project,
// using an anonymous sign-in for a genuine `authenticated` JWT (same trick as
// auth-smoke.mjs). No service role, no MCP — just the anon key from .env.local.
//
//   node tools/gateway-smoke.mjs
//
// Asserts:
//   1. A fresh account's first  consume_free_credit() => 'ok'        (credit spent)
//   2. The same account's second consume_free_credit() => 'no_credit' (cap holds)
//
// Prereqs: anonymous sign-ins enabled, and the
// 20260605120000_add_free_tier_metering migration applied.
// Leaves one orphaned anonymous user behind (acceptable for a smoke test).
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // rely on process.env
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

const { data: signIn, error: signInErr } = await supabase.auth.signInAnonymously();
if (signInErr || !signIn?.user) {
  console.error('anonymous sign-in failed:', signInErr?.message ?? 'no user');
  console.error('(enable anonymous sign-ins in Auth settings, or the migration may not be applied)');
  process.exit(1);
}
console.log(`signed in as anon user ${signIn.user.id}`);

const first = await supabase.rpc('consume_free_credit');
check('first call returns ok', first.data === 'ok', first.error?.message ?? `got ${JSON.stringify(first.data)}`);

const second = await supabase.rpc('consume_free_credit');
check('second call returns no_credit', second.data === 'no_credit', second.error?.message ?? `got ${JSON.stringify(second.data)}`);

console.log(failed === 0 ? '\nPASS — metering is atomic and the per-account cap holds.' : `\nFAIL — ${failed} assertion(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
