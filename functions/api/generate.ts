// Hosted free-tier AI gateway (Cloudflare Pages Function).
// See docs/onboarding-redesign-spec.md §7.
//
// Flow for one free generation:
//   1. (optional) verify a Cloudflare Turnstile token — only enforced when
//      TURNSTILE_SECRET is configured, so the gateway works before Turnstile
//      is set up and flips on the moment the secret is added.
//   2. consume_free_credit() RPC, called AS the user (their Supabase JWT) — does
//      auth + atomic per-account metering + the global daily ceiling in one txn.
//   3. proxy to OpenRouter with Jeff's key (server-side only), model + provider
//      pinned (gpt-oss-120b / Baseten — fast, and the quality the blind test
//      picked). Jeff's key NEVER reaches the browser.
//
// BYOK power users never hit this endpoint — they call OpenRouter directly.

interface Env {
  // Reuses the frontend's public Supabase vars (same values; the anon key is
  // publishable, access is governed by RLS). Only OPENROUTER_API_KEY is a true
  // server-side secret — it has NO VITE_ prefix, so Vite never inlines it into
  // the client bundle.
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  OPENROUTER_API_KEY: string;
  TURNSTILE_SECRET?: string; // optional; when present, Turnstile is enforced
}

// Pinned so cost, speed, and quality are deterministic instead of however
// OpenRouter feels like routing. Baseten ran gpt-oss-120b at ~189 tok/s in the
// blind test; allow_fallbacks keeps us up if it's briefly unavailable.
const FREE_MODEL = 'openai/gpt-oss-120b';
const FREE_PROVIDER_ORDER = ['baseten'];
const FREE_MAX_OUTPUT_TOKENS = 2048; // the gateway owns the cap (it's our cost)
// Input caps — output is capped above, so cap input too or cost-per-call can be
// amplified with a giant prompt. The real prologue prompt is a single message,
// a few thousand chars; these leave generous headroom while killing abuse.
const MAX_MESSAGES = 24;
const MAX_INPUT_CHARS = 20000;

interface GenerateBody {
  accessToken?: string;
  turnstileToken?: string;
  messages?: { role: string; content: string }[];
  temperature?: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }

  const accessToken = (body.accessToken ?? '').trim();
  if (!accessToken) {
    return json({ error: 'unauthorized', message: 'missing access token' }, 401);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'bad_request', message: 'messages required' }, 400);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json({ error: 'bad_request', message: 'too many messages' }, 400);
  }
  if (!body.messages.every((m) => typeof m?.role === 'string' && typeof m?.content === 'string')) {
    return json({ error: 'bad_request', message: 'each message needs a string role and content' }, 400);
  }
  const totalChars = body.messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > MAX_INPUT_CHARS) {
    return json({ error: 'bad_request', message: 'prompt too large' }, 400);
  }

  // 1. Bot check (only when configured).
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, request);
    if (!ok) return json({ error: 'turnstile_failed', message: 'bot check failed' }, 403);
  }

  // 2. Atomic auth + metering. PostgREST validates the JWT; the RPC reads
  //    auth.uid() and decrements both the per-account credit and the daily
  //    ceiling in one transaction.
  const verdict = await consumeFreeCredit(env, accessToken);
  switch (verdict) {
    case 'ok':
      break;
    case 'unauthorized':
      return json({ error: 'unauthorized', message: 'sign in to use your free generation' }, 401);
    case 'no_credit':
      return json({ error: 'no_credit', message: 'free generation already used' }, 402);
    case 'ceiling_reached':
      return json({ error: 'ceiling_reached', message: 'the free tap is closed for today — bring a key or subscribe' }, 503);
    default:
      return json({ error: 'meter_error', message: verdict }, 500);
  }

  // 3. Proxy to OpenRouter (server-side key, pinned model + provider).
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aftertale.gg/',
        'X-Title': 'Aftertale (hosted free)',
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        provider: { order: FREE_PROVIDER_ORDER, allow_fallbacks: true },
        messages: body.messages,
        max_tokens: FREE_MAX_OUTPUT_TOKENS,
        temperature: body.temperature ?? 0.85,
        // gpt-oss is a reasoning model — keep the token budget on the answer.
        reasoning: { effort: 'low' },
      }),
    });

    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!upstream.ok || data.error) {
      return json(
        { error: 'upstream', message: data.error?.message ?? `HTTP ${upstream.status}` },
        502,
      );
    }

    const choice = data.choices?.[0];
    return json({
      text: choice?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model: FREE_MODEL,
      finishReason: choice?.finish_reason ?? 'stop',
    });
  } catch (e) {
    return json({ error: 'upstream', message: (e as Error).message }, 502);
  }
};

// Calls the metering RPC as the user. Returns the RPC verdict string, or a
// synthetic code on transport failure.
async function consumeFreeCredit(env: Env, accessToken: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/consume_free_credit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: '{}',
    });
  } catch (e) {
    return `rpc_unreachable:${(e as Error).message}`;
  }
  if (!res.ok) {
    if (res.status === 401) return 'unauthorized'; // bad / expired token
    return `rpc_http_${res.status}`;
  }
  const v = (await res.json().catch(() => null)) as unknown;
  return typeof v === 'string' ? v : `rpc_bad_response`;
}

async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  request: Request,
): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
