/**
 * Pronoun helpers derived from WoW's UnitSex as the addon exports it:
 * 1 = neutral/unknown, 2 = male, 3 = female.
 *
 * Stated explicitly in every prompt that describes the hero so the LLM never
 * infers gender from the character's name — it guesses wrong, and the prose
 * and portrait models can guess *differently* (see: a "youngest son" with a
 * female portrait).
 */

export interface PronounSet {
  subject: string;    // he / she / they
  object: string;     // him / her / them
  possessive: string; // his / her / their
  /** For image prompts ("female Orc Rogue"); absent when sex is unknown. */
  noun?: 'male' | 'female';
}

export function pronouns(sex?: number): PronounSet {
  if (sex === 2) return { subject: 'he', object: 'him', possessive: 'his', noun: 'male' };
  if (sex === 3) return { subject: 'she', object: 'her', possessive: 'her', noun: 'female' };
  return { subject: 'they', object: 'them', possessive: 'their' };
}

/**
 * "she/her/her" — or null when sex is unknown, so callers omit the line
 * rather than asserting they/them for heroes imported before sex was stored.
 */
export function pronounLine(sex?: number): string | null {
  if (sex !== 2 && sex !== 3) return null;
  const p = pronouns(sex);
  return `${p.subject}/${p.object}/${p.possessive}`;
}
