// ============================================================================
// Thread Ledger — external plot continuity for the chapter engine (Phase 2b).
// See docs/chapter-engine-spec.md §3.
//
// DERIVED, not stored: a "thread" is a quest chain (or lone quest) that was
// accepted; it resolves when its quests are turned in. We compute it from the
// character's quest events every time, so it's always consistent and needs no
// separate synced state. Matching is anchored on quest/chain IDs (deterministic
// — not "did the model remember"), which makes cross-session payoffs reliable
// no matter how long the gap.
// ============================================================================

import type { AddonEventRecord } from './addonEventStore';

const DAY = 24 * 60 * 60 * 1000;
// A thread untouched this long is dormant (drops out of "continue this"
// context); longer still, it's faded (eligible for a loose-threads nod).
const DORMANT_AFTER_MS = 10 * DAY;
const FADED_AFTER_MS = 30 * DAY;
// A faded thread is only worth a narrative nod if it was at least this notable.
const LOOSE_THREAD_MIN_WEIGHT = 3;

export type ThreadStatus = 'active' | 'dormant' | 'faded' | 'resolved';

export interface StoryThread {
  threadId: string;
  title: string;
  zone?: string;
  questIds: number[];
  chainId?: string;
  openedAt: number;
  lastTouchedAt: number;
  resolved: boolean;
  status: ThreadStatus;
  weight: number; // notability — accepts count 1, turn-ins 2
}

interface ThreadAccum {
  threadId: string;
  title: string;
  zone?: string;
  chainId?: string;
  openedAt: number;
  lastTouchedAt: number;
  accepted: Set<number>;
  turnedIn: Set<number>;
  sawTurnIn: boolean;
  weight: number;
}

function threadKey(chainId: string | undefined, questId: number | undefined): string | null {
  if (chainId) return `c:${chainId}`;
  if (typeof questId === 'number') return `q:${questId}`;
  return null;
}

/**
 * Derive all story threads from a character's quest events, classified by age
 * relative to `nowTs`. Pass `upToTs` to compute the ledger *as of* a moment
 * (e.g. the start of the session being recapped).
 */
export function computeThreads(records: AddonEventRecord[], nowTs: number, upToTs = Infinity): StoryThread[] {
  const map = new Map<string, ThreadAccum>();
  for (const r of records) {
    const e = r.event;
    if (e.timestamp > upToTs) continue;
    if (e.kind !== 'quest_accepted' && e.kind !== 'quest_turned_in') continue;
    const key = threadKey(e.chainId, e.questId);
    if (!key) continue;
    let t = map.get(key);
    if (!t) {
      t = {
        threadId: key,
        title: e.chainTitle || e.questName || 'an unnamed errand',
        zone: e.zone,
        chainId: e.chainId,
        openedAt: e.timestamp,
        lastTouchedAt: e.timestamp,
        accepted: new Set(),
        turnedIn: new Set(),
        sawTurnIn: false,
        weight: 0,
      };
      map.set(key, t);
    }
    if (e.timestamp < t.openedAt) t.openedAt = e.timestamp;
    if (e.timestamp > t.lastTouchedAt) t.lastTouchedAt = e.timestamp;
    if ((!t.title || t.title === 'an unnamed errand') && (e.chainTitle || e.questName)) {
      t.title = e.chainTitle || e.questName!;
    }
    if (!t.zone && e.zone) t.zone = e.zone;
    if (e.kind === 'quest_accepted') {
      if (typeof e.questId === 'number') t.accepted.add(e.questId);
      t.weight += 1;
    } else {
      if (typeof e.questId === 'number') t.turnedIn.add(e.questId);
      t.sawTurnIn = true;
      t.weight += 2;
    }
  }

  const out: StoryThread[] = [];
  for (const t of map.values()) {
    const accepted = [...t.accepted];
    // Resolved when every accepted quest was turned in, or we only ever saw the
    // turn-in (quest accepted before capture started).
    const resolved =
      (accepted.length > 0 && accepted.every((q) => t.turnedIn.has(q))) ||
      (accepted.length === 0 && t.sawTurnIn);
    let status: ThreadStatus;
    if (resolved) status = 'resolved';
    else {
      const age = nowTs - t.lastTouchedAt;
      status = age > FADED_AFTER_MS ? 'faded' : age > DORMANT_AFTER_MS ? 'dormant' : 'active';
    }
    out.push({
      threadId: t.threadId,
      title: t.title,
      zone: t.zone,
      questIds: accepted,
      chainId: t.chainId,
      openedAt: t.openedAt,
      lastTouchedAt: t.lastTouchedAt,
      resolved,
      status,
      weight: t.weight,
    });
  }
  return out;
}

export interface SessionThreadContext {
  /** Opened in a prior session, resolved in THIS one — write the payoff. */
  payoffs: StoryThread[];
  /** Opened before, still hanging (active) — may be touched in "What lingers". */
  stillOpen: StoryThread[];
  /** Notable threads gone cold — eligible for an occasional loose-threads nod. */
  looseThreads: StoryThread[];
}

/**
 * Work out the continuity context for the session being recapped: what it
 * pays off, what it leaves hanging, and what has gone cold.
 */
export function threadContextForSession(
  session: { startedAt: number; finishedAt: number },
  allRecords: AddonEventRecord[],
  nowTs: number,
): SessionThreadContext {
  const threads = computeThreads(allRecords, nowTs);
  const payoffs: StoryThread[] = [];
  const stillOpen: StoryThread[] = [];
  const looseThreads: StoryThread[] = [];
  for (const t of threads) {
    const openedBefore = t.openedAt < session.startedAt;
    const touchedThisSession =
      t.lastTouchedAt >= session.startedAt && t.lastTouchedAt <= session.finishedAt + 1000;
    if (t.resolved && openedBefore && touchedThisSession) payoffs.push(t);
    else if (!t.resolved && openedBefore && t.status === 'active') stillOpen.push(t);
    else if (!t.resolved && t.status === 'faded' && t.weight >= LOOSE_THREAD_MIN_WEIGHT) looseThreads.push(t);
  }
  // Most relevant first; cap each list so the prompt stays lean.
  payoffs.sort((a, b) => b.weight - a.weight);
  stillOpen.sort((a, b) => b.weight - a.weight);
  looseThreads.sort((a, b) => b.lastTouchedAt - a.lastTouchedAt);
  return {
    payoffs: payoffs.slice(0, 4),
    stillOpen: stillOpen.slice(0, 4),
    looseThreads: looseThreads.slice(0, 3),
  };
}

function ago(from: number, to: number): string {
  const days = Math.floor((to - from) / DAY);
  if (days <= 0) return 'recently';
  if (days === 1) return 'a day ago';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** Format the thread context for injection into the recap prompt. */
export function formatThreadContext(ctx: SessionThreadContext, nowTs: number): string | null {
  const lines: string[] = [];
  if (ctx.payoffs.length > 0) {
    lines.push('THREADS THIS SESSION RESOLVES (write the payoff — the reader has been waiting):');
    for (const t of ctx.payoffs) {
      lines.push(`- "${t.title}"${t.zone ? ` (${t.zone})` : ''} — taken up ${ago(t.openedAt, nowTs)}, finally resolved here. Close it; acknowledge the time passed; do not re-explain it from scratch.`);
    }
  }
  if (ctx.stillOpen.length > 0) {
    lines.push('THREADS STILL OPEN (may be touched lightly in "What lingers" if relevant — do not force):');
    for (const t of ctx.stillOpen) {
      lines.push(`- "${t.title}"${t.zone ? ` (${t.zone})` : ''} — still unresolved.`);
    }
  }
  if (ctx.looseThreads.length > 0) {
    lines.push('LONG-ABANDONED THREADS (you MAY give ONE a brief, honest acknowledgment as character texture — the hero who picks things up and drifts away. Never force it):');
    for (const t of ctx.looseThreads) {
      lines.push(`- "${t.title}"${t.zone ? ` (${t.zone})` : ''} — left cold since ${ago(t.lastTouchedAt, nowTs)}.`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
