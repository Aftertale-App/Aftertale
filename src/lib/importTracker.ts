// ============================================================================
// Import tracker — remembers the hash + timestamp of the Aftertale.lua last
// imported per character so The Inkwell can flag "your save file looks
// updated" prompts and quantify "N new events since last import." Pure
// localStorage; no network.
// ============================================================================

export const STORAGE_PREFIX = 'at.import-tracker.';
export const IMPORT_TRACKER_UPDATED_EVENT = 'at:import-tracker-updated';

export interface ImportRecord {
  /** sha-256 (hex) of the raw file text. */
  fileHash: string;
  /** Bytes of the raw file at import time. */
  fileSize: number;
  /** When the import happened (ms epoch). */
  importedAt: number;
  /** How many events the import produced. */
  eventCount: number;
  /** Latest event timestamp (ms) in the imported set — for "newer than" checks. */
  latestEventAt: number;
}

function storageKey(characterKey: string): string {
  return `${STORAGE_PREFIX}${characterKey}`;
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(IMPORT_TRACKER_UPDATED_EVENT));
  } catch {
    // SSR / no DOM — silently drop.
  }
}

function isImportRecord(value: unknown): value is ImportRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ImportRecord>;
  return (
    typeof record.fileHash === 'string' &&
    typeof record.fileSize === 'number' &&
    typeof record.importedAt === 'number' &&
    typeof record.eventCount === 'number' &&
    typeof record.latestEventAt === 'number'
  );
}

export function loadImportRecord(characterKey: string | null | undefined): ImportRecord | null {
  if (!characterKey) return null;
  try {
    const raw = localStorage.getItem(storageKey(characterKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isImportRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveImportRecord(characterKey: string, record: ImportRecord): void {
  if (!characterKey) return;
  try {
    localStorage.setItem(storageKey(characterKey), JSON.stringify(record));
    notify();
  } catch {
    // localStorage may be full or disabled — fail soft.
  }
}

export function clearImportRecord(characterKey: string): void {
  if (!characterKey) return;
  try {
    localStorage.removeItem(storageKey(characterKey));
    notify();
  } catch {
    // ignore
  }
}

function fallbackHash(text: string): string {
  const tail = text.slice(-128);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${text.length}-${tail.length}-${(hash >>> 0).toString(16)}-${tail}`;
}

/**
 * Compute a sha-256 hex string for arbitrary text. Uses the browser's
 * SubtleCrypto API. Async because crypto.subtle is async.
 */
export async function hashFileContents(text: string): Promise<string> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('crypto.subtle is unavailable');
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    console.warn('[importTracker] Falling back to non-cryptographic file hash:', err);
    return fallbackHash(text);
  }
}
