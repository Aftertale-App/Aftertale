// ============================================================================
// Chapter parsing + recap-entry id helpers for the Phase 2 chapter engine.
//
// A session recap is now 1..N chapters (see docs/chapter-engine-spec.md §2).
// The model returns them in one response, each led by a `# Title` line. We
// split on those level-1 headings, and publish each chapter as its own
// HistoryEntry keyed `recap_<sessionId>__<i>` so the reader treats each as a
// distinct chapter. Legacy single recaps (`recap_<sessionId>`) still parse.
// ============================================================================

export interface ParsedChapter {
  title: string;
  /** Chapter body WITHOUT the leading `# Title` line. */
  text: string;
}

/**
 * Split a raw multi-chapter recap into its chapters. Chapters are delimited by
 * level-1 `# Title` lines. Any prose before the first heading becomes an
 * untitled leading chapter (defensive — the model is told to always title).
 */
export function parseChapters(raw: string): ParsedChapter[] {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const out: Array<{ title: string; body: string[] }> = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/); // level-1 heading only
    if (m) {
      if (cur) out.push(cur);
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else {
      cur = { title: '', body: [line] };
    }
  }
  if (cur) out.push(cur);
  return out
    .map((c) => ({ title: c.title, text: c.body.join('\n').trim() }))
    .filter((c) => c.text.length > 0 || c.title.length > 0);
}

const RECAP_PREFIX = 'recap_';

export function isRecapEntryId(entryId: string | undefined): boolean {
  return typeof entryId === 'string' && entryId.startsWith(RECAP_PREFIX);
}

/** Id for the i-th chapter (1-based) of a session's recap. */
export function recapEntryId(sessionId: string, index: number): string {
  return `${RECAP_PREFIX}${sessionId}__${index}`;
}

/**
 * Extract the sessionId from a recap entry id. Handles both the multi-chapter
 * scheme (`recap_<sid>__<i>`) and the legacy single scheme (`recap_<sid>`).
 * Returns null for non-recap ids.
 */
export function recapSessionId(entryId: string | undefined): string | null {
  if (!isRecapEntryId(entryId)) return null;
  return (entryId as string).slice(RECAP_PREFIX.length).replace(/__\d+$/, '');
}
