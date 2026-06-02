// ============================================================================
// Arc Ledger — internal character continuity for the chapter engine (Phase 2c).
// See docs/chapter-engine-spec.md §4.
//
// The character spine. Where the Thread Ledger tracks unresolved *plot*, this
// tracks who the hero is *becoming* — a living sense of their internal journey
// that updates each chapter and feeds forward, so "The longer road" has
// momentum and direction instead of resetting every time.
//
// truth + tension come (statically) from the player-authored bible; this store
// holds only the DYNAMIC layer (trend, open questions, recent movements). It is
// derived/regenerable, so it lives in localStorage and never edits the bible.
// ============================================================================

import type { CharacterBible } from '../types';

const STORAGE_PREFIX = 'at.arc-ledger.';
export const ARC_LEDGER_UPDATED_EVENT = 'at:arc-ledger-updated';

export interface ArcState {
  /** Where the hero is trending internally right now (one short clause). */
  trend?: string;
  /** Open internal questions the journey is sitting with. */
  openQuestions: string[];
  /** Last few one-line movements, newest last. */
  recentMovements: Array<{ at: number; note: string }>;
  updatedAt: number;
}

const MAX_MOVEMENTS = 6;

function storageKey(characterKey: string): string {
  return `${STORAGE_PREFIX}${characterKey}`;
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(ARC_LEDGER_UPDATED_EVENT));
  } catch {
    /* no DOM */
  }
}

export function loadArcState(characterKey: string | null | undefined): ArcState | null {
  if (!characterKey) return null;
  try {
    const raw = localStorage.getItem(storageKey(characterKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      trend: typeof parsed.trend === 'string' ? parsed.trend : undefined,
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.filter((q: unknown) => typeof q === 'string') : [],
      recentMovements: Array.isArray(parsed.recentMovements) ? parsed.recentMovements.filter((m: unknown) => m && typeof (m as { note?: unknown }).note === 'string') : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveArcState(characterKey: string, state: ArcState): void {
  if (!characterKey) return;
  try {
    localStorage.setItem(storageKey(characterKey), JSON.stringify(state));
    notify();
  } catch {
    /* full / disabled */
  }
}

export function clearArcState(characterKey: string): void {
  if (!characterKey) return;
  try {
    localStorage.removeItem(storageKey(characterKey));
    notify();
  } catch {
    /* ignore */
  }
}

/**
 * The static character truth/tension drawn from the bible — the spine the arc
 * moves along. Null when the bible is too thin to support an arc.
 */
export function bibleArcSpine(bible: CharacterBible): { truth?: string; fears: string[]; flaws: string[] } | null {
  const truth = bible.coreQuote?.trim();
  const fears = (bible.fears ?? []).filter(Boolean);
  const flaws = (bible.flaws ?? []).filter(Boolean);
  if (!truth && fears.length === 0 && flaws.length === 0) return null;
  return { truth, fears, flaws };
}

/** Format the inner-journey-so-far for the recap prompt. Null if nothing yet. */
export function formatArcForPrompt(state: ArcState | null): string | null {
  if (!state) return null;
  const lines: string[] = [];
  if (state.trend) lines.push(`Trending: ${state.trend}`);
  if (state.openQuestions.length > 0) lines.push(`Open questions: ${state.openQuestions.join(' | ')}`);
  const recent = state.recentMovements.slice(-3).map((m) => m.note);
  if (recent.length > 0) lines.push(`Lately: ${recent.join(' ')}`);
  if (lines.length === 0) return null;
  return `THE HERO'S INNER JOURNEY SO FAR (let this inform "The longer road" — continue it, don't restart it):\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

const ARC_BLOCK_RE = /<<ARC>>([\s\S]*?)<<\/ARC>>/i;

/**
 * Pull the model's hidden arc-update block out of a recap response. Returns the
 * response with the block stripped (so it never renders) plus the parsed update.
 */
export function parseArcUpdate(raw: string): { stripped: string; update: Partial<ArcState> | null } {
  const m = raw.match(ARC_BLOCK_RE);
  if (!m) return { stripped: raw, update: null };
  const stripped = raw.replace(ARC_BLOCK_RE, '').trim();
  const body = m[1];
  const trend = body.match(/trend:\s*(.+)/i)?.[1]?.trim();
  const questionsRaw = body.match(/questions:\s*(.+)/i)?.[1]?.trim();
  const movement = body.match(/movement:\s*(.+)/i)?.[1]?.trim();
  const openQuestions = questionsRaw
    ? questionsRaw.split('|').map((q) => q.trim()).filter((q) => q && !/^(none|n\/a|-)$/i.test(q))
    : [];
  const update: Partial<ArcState> = {};
  if (trend) update.trend = trend;
  if (openQuestions.length) update.openQuestions = openQuestions;
  if (movement) update.recentMovements = [{ at: 0, note: movement }];
  return { stripped, update: Object.keys(update).length ? update : null };
}

/** Merge an arc update into the prior state. `at` stamps the new movement. */
export function applyArcUpdate(prior: ArcState | null, update: Partial<ArcState>, at: number): ArcState {
  const base: ArcState = prior ?? { openQuestions: [], recentMovements: [], updatedAt: 0 };
  const recentMovements = [...base.recentMovements];
  if (update.recentMovements && update.recentMovements[0]) {
    recentMovements.push({ at, note: update.recentMovements[0].note });
  }
  return {
    trend: update.trend ?? base.trend,
    openQuestions: update.openQuestions ?? base.openQuestions,
    recentMovements: recentMovements.slice(-MAX_MOVEMENTS),
    updatedAt: at,
  };
}
