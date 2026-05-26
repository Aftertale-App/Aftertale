#!/usr/bin/env node
// =============================================================================
// cost-probe.mjs
//
// Controlled cost-accounting experiment for gemini-2.5-flash.
// Sends N identical small requests with thinking disabled, dumps the raw
// usageMetadata for each, sums local-side cost, writes a timestamped JSON
// report, and opens the AI Studio logs page so you can immediately diff
// client-vs-server token counts.
//
// Why this exists:
//   The spend tracker reports ~$0.19 for a 567-call run but Google billed
//   ~$0.27 (41% delta). This script isolates a single deterministic call
//   shape so we can pin the source.
//
// Usage:
//   npm run cost:probe                          # default: 25 calls, auto key
//   npm run cost:probe -- --calls 100
//   npm run cost:probe -- --calls 10 --verbose  # dump usageMetadata per call
//   npm run cost:probe -- --no-open             # don't open AI Studio
//
// The key is read from (in order):
//   1. GEMINI_API_KEY env var
//   2. VITE_GEMINI_API_KEY in .env.local (same key the web app uses)
// =============================================================================

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// --- repo paths ---
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local');
const REPORTS_DIR = resolve(REPO_ROOT, 'tools', 'cost-probe-reports');

// --- args ---
const args = process.argv.slice(2);
function argv(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const calls = parseInt(argv('--calls', '25'), 10);
const verbose = args.includes('--verbose');
const skipOpen = args.includes('--no-open');

// --- API key resolution ---
function loadEnvLocal() {
  if (!existsSync(ENV_LOCAL)) return {};
  const out = {};
  const text = readFileSync(ENV_LOCAL, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}
const envLocal = loadEnvLocal();
const API_KEY = process.env.GEMINI_API_KEY || envLocal.VITE_GEMINI_API_KEY || '';
if (!API_KEY) {
  console.error('No API key found. Set GEMINI_API_KEY or add VITE_GEMINI_API_KEY to .env.local');
  process.exit(1);
}
const maskedKey = API_KEY.length > 8 ? `••••${API_KEY.slice(-4)}` : '••••';

// --- pricing mirrors src/pricing.ts (gemini-2.5-flash, paid tier) ---
const INPUT_PER_1M = 0.25;
const CACHED_INPUT_PER_1M = 0.025;
const OUTPUT_PER_1M = 1.5;
const MODEL = 'gemini-2.5-flash';

const PROMPT = 'Reply with exactly the four words: "the quick brown fox". No punctuation, no other text.';
const MAX_OUTPUT_TOKENS = 20;

const startedAt = new Date();
const runId = startedAt.toISOString().replace(/[:.]/g, '-');

console.log('================================================================');
console.log('cost-probe.mjs');
console.log('================================================================');
console.log(`run id:                 ${runId}`);
console.log(`api key:                ${maskedKey}  (source: ${process.env.GEMINI_API_KEY ? 'env' : '.env.local'})`);
console.log(`model:                  ${MODEL}`);
console.log(`calls:                  ${calls}`);
console.log(`prompt:                 ${JSON.stringify(PROMPT)}`);
console.log(`maxOutputTokens:        ${MAX_OUTPUT_TOKENS}`);
console.log(`thinkingBudget:         0  (disabled)`);
console.log(`pricing.inputPer1M:     $${INPUT_PER_1M}`);
console.log(`pricing.outputPer1M:    $${OUTPUT_PER_1M}`);
console.log('================================================================\n');

const client = new GoogleGenAI({ apiKey: API_KEY });
const tStart = Date.now();
const perCall = [];

let totalInput = 0;
let totalCached = 0;
let totalVisibleOutput = 0;
let totalThoughts = 0;
let totalOutput = 0;
let failures = 0;

function fmt(n, w = 6) { return String(n).padStart(w); }

for (let i = 1; i <= calls; i++) {
  const t0 = performance.now();
  try {
    const result = await client.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
      config: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const dt = (performance.now() - t0).toFixed(0);
    const usage = result.usageMetadata ?? {};
    const inp = usage.promptTokenCount ?? 0;
    const cached = usage.cachedContentTokenCount ?? 0;
    const visOut = usage.candidatesTokenCount ?? 0;
    const thoughts = usage.thoughtsTokenCount ?? 0;
    const totalReported = usage.totalTokenCount ?? 0;
    const out = visOut + thoughts;
    const respId = result.responseId ?? '(no-id)';
    const text = (result.text ?? '').replace(/\s+/g, ' ').trim();

    totalInput += inp;
    totalCached += cached;
    totalVisibleOutput += visOut;
    totalThoughts += thoughts;
    totalOutput += out;

    perCall.push({
      i, ok: true, responseId: respId, latencyMs: Number(dt),
      promptTokenCount: inp, cachedContentTokenCount: cached,
      candidatesTokenCount: visOut, thoughtsTokenCount: thoughts,
      totalTokenCount: totalReported, text,
      finishReason: result.candidates?.[0]?.finishReason ?? null,
      modelVersion: result.modelVersion ?? null,
      usageMetadata: usage,
    });

    console.log(
      `#${fmt(i, 3)}  ${respId}  in=${fmt(inp, 4)}  visOut=${fmt(visOut, 4)}  thoughts=${fmt(thoughts, 4)}  totalReported=${fmt(totalReported, 4)}  ${dt}ms  -> "${text.slice(0, 60)}"`,
    );
    if (verbose) {
      console.log('       usageMetadata:', JSON.stringify(usage));
    }
  } catch (err) {
    failures++;
    perCall.push({ i, ok: false, error: String(err?.message ?? err) });
    console.log(`#${fmt(i, 3)}  FAILED: ${err?.message ?? err}`);
  }
}

const finishedAt = new Date();
const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(1);

const uncachedInput = Math.max(0, totalInput - totalCached);
const cost =
  (uncachedInput / 1_000_000) * INPUT_PER_1M +
  (totalCached / 1_000_000) * CACHED_INPUT_PER_1M +
  (totalOutput / 1_000_000) * OUTPUT_PER_1M;

console.log('\n================================================================');
console.log('SUMMARY');
console.log('================================================================');
console.log(`window:                    ${startedAt.toISOString()} -> ${finishedAt.toISOString()}`);
console.log(`elapsed:                   ${elapsedSec}s`);
console.log(`successes / failures:      ${calls - failures} / ${failures}`);
console.log(`total input tokens:        ${totalInput}`);
console.log(`total cached input:        ${totalCached}`);
console.log(`total visible output:      ${totalVisibleOutput}`);
console.log(`total thoughts tokens:     ${totalThoughts}`);
console.log(`total output (vis+thought):${totalOutput}`);
console.log('');
console.log(`local-computed cost:       $${cost.toFixed(6)}`);
console.log(`  input:  ${uncachedInput} × $${INPUT_PER_1M}/1M = $${((uncachedInput / 1_000_000) * INPUT_PER_1M).toFixed(6)}`);
console.log(`  cached: ${totalCached} × $${CACHED_INPUT_PER_1M}/1M = $${((totalCached / 1_000_000) * CACHED_INPUT_PER_1M).toFixed(6)}`);
console.log(`  output: ${totalOutput} × $${OUTPUT_PER_1M}/1M = $${((totalOutput / 1_000_000) * OUTPUT_PER_1M).toFixed(6)}`);

// --- write report ---
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
const reportPath = resolve(REPORTS_DIR, `cost-probe-${runId}.json`);
const report = {
  runId, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
  elapsedSec: Number(elapsedSec),
  config: { model: MODEL, calls, prompt: PROMPT, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingBudget: 0, temperature: 0.0 },
  pricing: { inputPer1M: INPUT_PER_1M, cachedInputPer1M: CACHED_INPUT_PER_1M, outputPer1M: OUTPUT_PER_1M },
  totals: { totalInput, totalCached, totalVisibleOutput, totalThoughts, totalOutput, localCostUsd: cost, failures },
  perCall,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log('');
console.log(`report written:            ${reportPath}`);

// --- open AI Studio logs page (unless --no-open) ---
if (!skipOpen) {
  const url = 'https://aistudio.google.com/logs';
  console.log(`opening:                   ${url}`);
  const opener = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch { /* best-effort */ }
}

console.log('================================================================');
console.log('');
console.log('Match client vs server:');
console.log('  - copy any responseId from above');
console.log('  - paste into the AI Studio logs filter');
console.log('  - compare usageMetadata fields against the report JSON');
console.log('');

