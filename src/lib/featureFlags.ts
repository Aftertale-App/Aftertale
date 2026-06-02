// ============================================================================
// Feature flags — localStorage-backed power-user toggles.
//
// Phase 0 design note: The Inkwell is visible by default. Post-launch (when
// tier detection lands), the default will flip to false for paid tiers and
// stay true for Free/BYOK. The flag mechanism exists now so the toggle UX
// is already wired when that day comes.
//
// All flags fire `at:flags-updated` when changed so consumers can react.
// ============================================================================

import { DEV_TOOLS_ENABLED } from './devTools';

const SCRIBES_DESK_KEY = 'at.flags.scribesDesk';
const SEED_MODE_KEY = 'at.flags.seedMode';

// Prose-seeding mode — how much quest context the LLM gets:
//   A = structured FACTS only (IP-safe)
//   B = facts + verbatim Blizzard quest prose (copyrighted; IP-RISKY)
//   C = facts + an instruction to draw on the model's OWN trained lore knowledge
//       (IP-safe — sends no Blizzard text; grounding comes from the model)
// PRODUCTION DEFAULT = 'C': strictly >= A in grounding, costs nothing extra, and
// sends no copyrighted text. The risky 'B' arm is HARD-gated to dev builds and
// can never reach the shipped/paid pipeline (the !DEV short-circuit returns 'C'
// before localStorage is even read).
export type SeedMode = 'A' | 'B' | 'C';

export function getSeedMode(): SeedMode {
  if (!DEV_TOOLS_ENABLED) return 'C';
  try {
    const v = window.localStorage.getItem(SEED_MODE_KEY);
    return v === 'A' || v === 'B' || v === 'C' ? v : 'C';
  } catch {
    return 'C';
  }
}

export function setSeedMode(mode: SeedMode): void {
  try {
    window.localStorage.setItem(SEED_MODE_KEY, mode);
  } catch {
    // localStorage may throw in private mode — caller's UI state still updates.
  }
  window.dispatchEvent(new CustomEvent('at:flags-updated'));
}

export function cycleSeedMode(): void {
  const order: SeedMode[] = ['A', 'B', 'C'];
  const next = order[(order.indexOf(getSeedMode()) + 1) % order.length];
  setSeedMode(next);
}

export function getShowScribesDesk(): boolean {
  try {
    const v = window.localStorage.getItem(SCRIBES_DESK_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setShowScribesDesk(v: boolean): void {
  try {
    window.localStorage.setItem(SCRIBES_DESK_KEY, v ? '1' : '0');
  } catch {
    // localStorage may throw in private mode — caller's UI state still updates.
  }
  window.dispatchEvent(new CustomEvent('at:flags-updated'));
}
