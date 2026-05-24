// ============================================================================
// Character bible storage — Phase 0 uses localStorage with a versioned envelope.
// Phase 1 will swap the backend to SQLite; the public API here should stay stable.
// ============================================================================

import type { BibleEnvelope, CharacterBible } from '../types';

const STORAGE_KEY = 'coa.bible.current';
const SCHEMA_VERSION = 1;

const VALID_FACTIONS = ['Alliance', 'Horde'] as const;

/**
 * Type guard for `CharacterBible`. Returns true only if the shape matches
 * what the rest of the app expects. We deliberately don't try to repair
 * malformed bibles here — that's the caller's job.
 */
export function validateBible(x: unknown): x is CharacterBible {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim()) return false;
  if (typeof b.race !== 'string' || !b.race.trim()) return false;
  if (typeof b.class !== 'string' || !b.class.trim()) return false;
  if (typeof b.faction !== 'string' || !(VALID_FACTIONS as readonly string[]).includes(b.faction)) return false;
  if (b.age !== undefined && typeof b.age !== 'number') return false;
  if (b.homeland !== undefined && typeof b.homeland !== 'string') return false;
  if (typeof b.backstory !== 'string' || !b.backstory.trim()) return false;
  if (!Array.isArray(b.beliefs) || !b.beliefs.every((v) => typeof v === 'string')) return false;
  if (!Array.isArray(b.motivations) || !b.motivations.every((v) => typeof v === 'string')) return false;
  if (typeof b.voice !== 'string' || !b.voice.trim()) return false;
  if (typeof b.createdAt !== 'number' || typeof b.updatedAt !== 'number') return false;
  return true;
}

/**
 * Return a list of human-readable errors describing why a candidate bible
 * doesn't validate. Useful for the LLM repair prompt and the manual editor.
 */
export function bibleValidationErrors(x: unknown): string[] {
  const errors: string[] = [];
  if (!x || typeof x !== 'object') {
    return ['top-level value is not an object'];
  }
  const b = x as Record<string, unknown>;
  const requireString = (field: string) => {
    if (typeof b[field] !== 'string' || !(b[field] as string).trim()) {
      errors.push(`"${field}" must be a non-empty string`);
    }
  };
  const requireStringArray = (field: string) => {
    if (!Array.isArray(b[field]) || !(b[field] as unknown[]).every((v) => typeof v === 'string')) {
      errors.push(`"${field}" must be an array of strings`);
    }
  };
  requireString('name');
  requireString('race');
  requireString('class');
  if (typeof b.faction !== 'string' || !(VALID_FACTIONS as readonly string[]).includes(b.faction)) {
    errors.push(`"faction" must be one of: ${VALID_FACTIONS.join(', ')}`);
  }
  if (b.age !== undefined && typeof b.age !== 'number') errors.push('"age" must be a number if present');
  if (b.homeland !== undefined && typeof b.homeland !== 'string') errors.push('"homeland" must be a string if present');
  requireString('backstory');
  requireStringArray('beliefs');
  requireStringArray('motivations');
  requireString('voice');
  return errors;
}

export function loadBible(): CharacterBible | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BibleEnvelope>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      console.warn(`[bibleStore] schemaVersion mismatch (got ${parsed.schemaVersion}, expected ${SCHEMA_VERSION})`);
      return null;
    }
    if (!validateBible(parsed.bible)) {
      console.warn('[bibleStore] saved bible failed validation; ignoring');
      return null;
    }
    return parsed.bible;
  } catch (err) {
    console.warn('[bibleStore] failed to load:', err);
    return null;
  }
}

export function saveBible(bible: CharacterBible): BibleEnvelope {
  const envelope: BibleEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: Date.now(),
    bible,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('coa:bible-updated', { detail: bible }));
  }
  return envelope;
}

export function clearBible(): void {
  localStorage.removeItem(STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('coa:bible-updated', { detail: null }));
  }
}
