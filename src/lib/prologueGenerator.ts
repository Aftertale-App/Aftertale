/**
 * Prologue / Character Bible generator.
 *
 * Consumes the AutoImportResult payload (character snapshot + personality
 * profile + seed answer + optional third-party intel) and asks the LLM to
 * produce a full `CharacterBible`. The bible drives every subsequent
 * narration call.
 *
 * Lane voice (brand-new / boosted / pre-existing) shapes the backstory
 * opening but never invents implausible backstory for new toons.
 */

import type { LLMProvider, CharacterBible } from '../types';
import type { PersonalityProfile } from './personalityTraits';
import {
  PERSONALITY_BUCKETS,
  PERSONALITY_OPTION_INDEX,
  resolveProfile,
} from './personalityTraits';
import type { IngestedCharacter } from './characterIngest';
import type { InspireMeIntel } from './inspireMePrompt';

export const PROLOGUE_PROMPT_VERSION = 1;

export class PrologueError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'PrologueError';
  }
}

export interface PrologueInput {
  character: IngestedCharacter;
  profile: PersonalityProfile;
  seedAnswer: { question: string; text: string };
  intel?: InspireMeIntel[];
}

export interface PrologueResult {
  bible: CharacterBible;
  raw: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  promptVersion: number;
}

export interface PrologueOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'gemini-flash';
const DEFAULT_TEMPERATURE = 0.85;
const DEFAULT_MAX_TOKENS = 1600;

const LANE_VOICE: Record<IngestedCharacter['classification'], string> = {
  'brand-new':
    'This character is brand new -- level 1, just drew their first breath. The backstory should be the moments leading up to the very first step taken in-game. Childhood, family, the event that pulled them out the door TODAY. No epic past adventures.',
  boosted:
    'This character was boosted -- they arrived at high level with no memory of how. Lean into amnesia, a past summoned-by-magic, or a veteran adventurer whose history is deliberately fogged. Be intriguing about the gap, not exhaustive.',
  'pre-existing':
    'This character was already in motion when Chronicles met them. We are joining the story late. Reference recent events as if the reader missed the first chapters: hints, half-finished business, the weight of choices we never saw.',
  pending:
    'Classification uncertain. Write a backstory that fits either a brand-new or a returning adventurer; keep specifics that could be retconned vague.',
};

function bucketSummary(profile: PersonalityProfile): string {
  const lines: string[] = [];
  for (const bucket of PERSONALITY_BUCKETS) {
    const optionId = profile[bucket.id];
    if (!optionId) continue;
    const opt = PERSONALITY_OPTION_INDEX.get(`${bucket.id}.${optionId}`);
    if (!opt) continue;
    lines.push(`  * ${bucket.label}: ${opt.label} -- ${opt.description}`);
  }
  return lines.join('\n');
}

function intelBlock(intel?: InspireMeIntel[]): string {
  if (!intel || intel.length === 0) return '';
  const lines = intel.slice(0, 8).map((i) => `  * [${i.source}] ${i.summary}`);
  return `\n\nThird-party intel from other addons (use only what fits the lane):\n${lines.join('\n')}`;
}

export function buildProloguePrompt(input: PrologueInput): string {
  const { character, profile, seedAnswer, intel } = input;
  const id = character.identity;
  const lvl = character.lastSeen?.level ?? character.firstSeen.level;
  const zone = character.lastSeen?.zoneText ?? character.firstSeen.zoneText ?? 'an unknown locale';
  const subzone =
    character.lastSeen?.subzoneText ?? character.firstSeen.subzoneText ?? '';
  const where = subzone ? `${zone} (${subzone})` : zone;

  return [
    'You are the chronicler for a personalized World of Warcraft RPG novel.',
    'The player has just onboarded a character. Produce a complete CharacterBible',
    'as strict JSON. The bible is the source of truth for every future chapter,',
    'so make it specific, internally consistent, and free of generic fantasy cliche.',
    '',
    `Character: ${id.name}, a ${id.race} ${id.class} (${id.faction ?? 'unaligned'}), level ${lvl}.`,
    `Observed location: ${where}.`,
    `Classification: ${character.classification}.`,
    `Lane guidance: ${LANE_VOICE[character.classification]}`,
    '',
    'Personality (locked-in player choices -- weave through behavior, do NOT name the traits):',
    bucketSummary(profile),
    '',
    'Seed prompt and the player\'s answer (this is the single most important input;',
    'every other field should harmonize with it):',
    `  Q: ${seedAnswer.question}`,
    `  A: ${seedAnswer.text}`,
    intelBlock(intel),
    '',
    'Output rules:',
    '  - Strict JSON. No prose before or after, no markdown fences.',
    '  - backstory: 2-3 paragraphs, 180-280 words total. Specific proper nouns',
    '    (named NPCs, places, objects). Embody traits through action and word',
    '    choice. Never name the traits. End on an unresolved hook.',
    '  - beliefs: 3-5 short imperative phrases (e.g. "Coin earned is coin owed").',
    '  - motivations: 3-5 concrete pulls forward (a person to find, a debt to',
    '    settle, a craft to master). No "destiny" / "chosen one" / "ancient evil".',
    '  - fears: 1-3 specific things they fear becoming or losing.',
    '  - flaws: 1-3 lived flaws drawn from the Flaw trait. Show what it costs them.',
    '  - voice: 1-2 sentences describing how they speak (tone, vocabulary,',
    '    mannerisms, what they refuse to say).',
    '  - coreQuote: a single sentence the character would actually say.',
    '  - homeland: best guess from race + zone if obvious; omit if unsure.',
    '  - Do NOT include age unless the seed answer implies one.',
    '  - Do NOT include level / currentZone / history -- the app fills those.',
    '  - Do NOT include createdAt / updatedAt -- the app fills those.',
    '',
    'Forbidden phrases anywhere in the output: perhaps, likely, possibly,',
    'might have, could have, fate, destiny, chosen one, prophecy,',
    'ancient evil, called to adventure, the wider world beckoned, heeded the call.',
    '',
    'Output JSON schema:',
    '{',
    '  "name": string,',
    '  "race": string,',
    '  "class": string,',
    '  "faction": "Alliance" | "Horde",',
    '  "homeland": string | null,',
    '  "backstory": string,',
    '  "beliefs": string[],',
    '  "motivations": string[],',
    '  "fears": string[],',
    '  "flaws": string[],',
    '  "voice": string,',
    '  "coreQuote": string',
    '}',
  ].join('\n');
}

const FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/m;

function stripFence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(FENCE_RE);
  if (m) return m[1].trim();
  return trimmed;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function parsePrologueResponse(raw: string): Omit<CharacterBible, 'createdAt' | 'updatedAt'> {
  const text = stripFence(raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // Last-ditch: pull the first {...} block out of mixed output.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        json = JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new PrologueError(`could not parse model output as JSON: ${(e as Error).message}`);
      }
    } else {
      throw new PrologueError(`could not parse model output as JSON: ${(e as Error).message}`);
    }
  }
  if (typeof json !== 'object' || json === null) {
    throw new PrologueError('model output was not a JSON object');
  }
  const o = json as Record<string, unknown>;

  const required = ['name', 'race', 'class', 'faction', 'backstory', 'voice'] as const;
  for (const k of required) {
    if (typeof o[k] !== 'string' || !(o[k] as string).trim()) {
      throw new PrologueError(`required field "${k}" is missing or not a non-empty string`);
    }
  }
  const faction = o.faction as string;
  if (faction !== 'Alliance' && faction !== 'Horde') {
    throw new PrologueError(`faction must be Alliance or Horde, got "${faction}"`);
  }
  if (!isStringArray(o.beliefs) || (o.beliefs as string[]).length === 0) {
    throw new PrologueError('beliefs must be a non-empty string array');
  }
  if (!isStringArray(o.motivations) || (o.motivations as string[]).length === 0) {
    throw new PrologueError('motivations must be a non-empty string array');
  }

  const out: Omit<CharacterBible, 'createdAt' | 'updatedAt'> = {
    name: (o.name as string).trim(),
    race: (o.race as string).trim(),
    class: (o.class as string).trim(),
    faction,
    backstory: (o.backstory as string).trim(),
    beliefs: (o.beliefs as string[]).map((s) => s.trim()).filter(Boolean),
    motivations: (o.motivations as string[]).map((s) => s.trim()).filter(Boolean),
    voice: (o.voice as string).trim(),
  };
  if (typeof o.homeland === 'string' && o.homeland.trim()) out.homeland = o.homeland.trim();
  if (typeof o.coreQuote === 'string' && o.coreQuote.trim()) out.coreQuote = o.coreQuote.trim();
  if (isStringArray(o.fears)) {
    const cleaned = (o.fears as string[]).map((s) => s.trim()).filter(Boolean);
    if (cleaned.length) out.fears = cleaned;
  }
  if (isStringArray(o.flaws)) {
    const cleaned = (o.flaws as string[]).map((s) => s.trim()).filter(Boolean);
    if (cleaned.length) out.flaws = cleaned;
  }
  return out;
}

/**
 * Generate a CharacterBible from an auto-import draft. The returned bible
 * has createdAt/updatedAt populated; persistence is the caller's job
 * (see `saveBible` in `src/lib/bibleStore.ts`).
 */
export async function generatePrologue(
  input: PrologueInput,
  provider: LLMProvider,
  options: PrologueOptions = {},
): Promise<PrologueResult> {
  // Resolve profile to surface friendly errors before spending tokens.
  resolveProfile(input.profile);

  const prompt = buildProloguePrompt(input);
  const start = performance.now();
  let response;
  try {
    response = await provider.chat({
      task: 'bible-gen',
      model: options.model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
  } catch (e) {
    throw new PrologueError(`provider call failed: ${(e as Error).message}`, e);
  }

  let parsed: Omit<CharacterBible, 'createdAt' | 'updatedAt'>;
  try {
    parsed = parsePrologueResponse(response.text);
  } catch (e) {
    if (e instanceof PrologueError) throw e;
    throw new PrologueError(`parse failed: ${(e as Error).message}`, e);
  }

  const now = Date.now();
  // Carry over observed in-world snapshot, but the LLM-provided faction
  // wins (race + class are already pinned by the input, but the model
  // may normalize spelling -- accept its normalization).
  const bible: CharacterBible = {
    ...parsed,
    name: input.character.identity.name, // pin to observed name
    level: input.character.lastSeen?.level ?? input.character.firstSeen.level,
    currentZone:
      input.character.lastSeen?.zoneText ?? input.character.firstSeen.zoneText ?? undefined,
    createdAt: now,
    updatedAt: now,
  };

  return {
    bible,
    raw: response.text,
    latencyMs: performance.now() - start,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    promptVersion: PROLOGUE_PROMPT_VERSION,
  };
}
