// ============================================================================
// File handle store — per-character persistence for FileSystemFileHandle.
//
// The browser's File System Access API (Chromium-only) lets us remember a
// pointer to the user's Aftertale.lua and re-read it later without a picker.
// FileSystemHandle isn't structured-cloneable into localStorage, so we use
// IndexedDB which DOES preserve handle objects across page reloads.
//
// Free-player UX bet: pick the file ONCE, then "Import latest" becomes a
// zero-click pull on every subsequent visit.
//
// Graceful degradation: when the API or the persisted handle is unavailable,
// callers fall back to the classic <input type="file"> flow.
// ============================================================================

const DB_NAME = 'aftertale-file-handles';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function'
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadFileHandle(
  characterKey: string | null | undefined,
): Promise<FileSystemFileHandle | null> {
  if (!characterKey || !isFileSystemAccessSupported()) return null;
  try {
    const db = await openDb();
    return await new Promise<FileSystemFileHandle | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(characterKey);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveFileHandle(
  characterKey: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  if (!characterKey) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, characterKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore — picker still works, just won't be remembered
  }
}

export async function clearFileHandle(characterKey: string | null | undefined): Promise<void> {
  if (!characterKey) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(characterKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/**
 * Ensure the page has read permission for the handle. Returns true on
 * success. The first call after a page reload may prompt the user; that's
 * expected and a single click is still vastly better than a full picker.
 */
export async function ensureReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as FileSystemFileHandle & {
    queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  };
  try {
    if (h.queryPermission) {
      const current = await h.queryPermission({ mode: 'read' });
      if (current === 'granted') return true;
    }
    if (h.requestPermission) {
      const next = await h.requestPermission({ mode: 'read' });
      return next === 'granted';
    }
    // No permission API on this handle — assume read works.
    return true;
  } catch {
    return false;
  }
}

export interface PickResult {
  handle: FileSystemFileHandle;
  file: File;
}

/**
 * Show the native file picker and return both the handle (for persistence)
 * and the File (for immediate use). Returns null if the user cancels or the
 * API throws. `startIn: 'documents'` is a hint — the browser may ignore it,
 * but on Windows it tends to land in Documents which is closer to most
 * users' WoW install than the default download folder.
 */
export async function pickFileWithHandle(): Promise<PickResult | null> {
  if (!isFileSystemAccessSupported()) return null;
  const w = window as unknown as {
    showOpenFilePicker: (opts: {
      types?: { description: string; accept: Record<string, string[]> }[];
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
      startIn?: string;
    }) => Promise<FileSystemFileHandle[]>;
  };
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [
        {
          description: 'Aftertale saved variables',
          accept: { 'text/plain': ['.lua'] },
        },
      ],
      multiple: false,
      excludeAcceptAllOption: false,
      startIn: 'documents',
    });
    if (!handle) return null;
    const file = await handle.getFile();
    return { handle, file };
  } catch {
    // User cancelled or API failed — caller should fall back.
    return null;
  }
}
