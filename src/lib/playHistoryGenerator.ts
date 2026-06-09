// ============================================================================
// Play-history → Character Bible generator (the cold-reveal "Bring to life").
//
// A captured hero has no interview data (no PersonalityProfile, no seed answer)
// — only its bible identity plus the real gameplay the addon recorded. This
// builds a backstory + full bible GROUNDED in what they actually did in-game:
// the origin that leads up to the recorded adventures.
//
// Output schema is identical to the interview path's, so it reuses
// parsePrologueResponse and slots straight into saveBible() + the reader.
// ============================================================================

import type { LLMProvider, CharacterBible } from '../types';
import type { ChronicleSession } from './sessionHistory';
import { parsePrologueResponse, PrologueError } from './prologueGenerator';
import { pronounLine, pronouns } from './pronouns';

export const PLAY_HISTORY_PROMPT_VERSION = 2;

export interface PlayHistoryInput {
  bible: CharacterBible;
  sessions: ChronicleSession[];
}

export interface PlayHistoryResult {
  bible: CharacterBible;
  raw: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  promptVersion: number;
}

export interface PlayHistoryOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'openrouter/anthropic/claude-sonnet-4.5';
const DEFAULT_TEMPERATURE = 0.85;
const DEFAULT_MAX_TOKENS = 2048;
const MAX_SESSIONS = 8; // keeps the digest well under the gateway's input cap
const MAX_RECAP_CHARS = 280;

function sessionDigest(sessions: ChronicleSession[]): string {
  // Oldest-first for narrative coherence; capped for prompt size.
  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt).slice(0, MAX_SESSIONS);
  if (ordered.length === 0) return '';
  return ordered
    .map((s, i) => {
      const lvl =
        s.startLevel != null && s.endLevel != null
          ? s.startLevel === s.endLevel
            ? `level ${s.endLevel}`
            : `levels ${s.startLevel}→${s.endLevel}`
          : '';
      const where = s.endZone ?? s.startZone ?? '';
      const place = [lvl, where].filter(Boolean).join(', ');
      const st = s.stats;
      const deeds = [
        st.questsCompleted ? `${st.questsCompleted} quests` : '',
        st.kills ? `${st.kills} kills` : '',
        st.deaths ? `${st.deaths} deaths` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const notable = [...st.notableUnits.slice(0, 4), ...st.notableItems.slice(0, 3)].join(', ');
      const recap = (s.campfireRecap ?? '').trim().slice(0, MAX_RECAP_CHARS);
      const lines = [`  Session ${i + 1}${place ? ` (${place})` : ''}:`];
      if (deeds) lines.push(`    deeds: ${deeds}`);
      if (notable) lines.push(`    notable: ${notable}`);
      if (recap) lines.push(`    recap: ${recap}`);
      return lines.join('\n');
    })
    .join('\n');
}

export function buildPlayHistoryPrompt(input: PlayHistoryInput): string {
  const { bible } = input;
  const digest = sessionDigest(input.sessions);
  return [
    'You are the chronicler for a personalized World of Warcraft RPG novel.',
    'This hero was captured from real gameplay but never written. Below is a',
    'digest of what they ACTUALLY did in-game. Produce a complete CharacterBible',
    'as strict JSON: a backstory and character that LEAD UP TO and explain these',
    'real early adventures — the origin that set this person on the road we see',
    'them walking. Make it specific, internally consistent, free of generic',
    'fantasy cliche, and grounded in the recorded deeds (name real zones and',
    'foes where they fit).',
    '',
    `Character: ${bible.name}, a ${bible.race} ${bible.class} (${bible.faction ?? 'unaligned'})${
      typeof bible.level === 'number' ? `, level ${bible.level}` : ''
    }.`,
    pronounLine(bible.sex)
      ? `Pronouns: ${pronounLine(bible.sex)}. Use these consistently everywhere ` +
        `(son/daughter, brother/sister, etc.) — never infer gender from the name.`
      : '',
    bible.currentZone ? `Last seen: ${bible.currentZone}.` : '',
    '',
    'Recorded adventures (their real play, oldest first):',
    digest || '  (sparse record — lean on race, class, and starting region)',
    '',
    'Output rules:',
    '  - Strict JSON. No prose before or after, no markdown fences.',
    '  - backstory: 3 paragraphs, roughly 450-550 words — a developed origin with',
    '    room to breathe, not a highlight reel. Specific proper nouns. The origin',
    '    that explains who they became; end on an unresolved hook that the recorded',
    '    adventures begin to answer. Creative embellishment is welcome as long as',
    '    it stays consistent with the recorded deeds.',
    '  - beliefs: 3-5 short imperative phrases (e.g. "Coin earned is coin owed").',
    '  - motivations: 3-5 concrete pulls forward, drawn from what they have done.',
    '  - fears: 1-3 specific things they fear becoming or losing.',
    '  - flaws: 1-3 lived flaws; show what they cost.',
    '  - voice: 1-2 sentences on how they speak.',
    '  - coreQuote: a single sentence the character would actually say.',
    '  - homeland: best guess from race + zone if obvious; omit if unsure.',
    '  - No "destiny" / "chosen one" / "ancient evil".',
    '  - Do NOT include level / currentZone / history / createdAt / updatedAt.',
    '',
    'Forbidden phrases anywhere: perhaps, likely, possibly, might have, could',
    'have, fate, destiny, chosen one, prophecy, ancient evil, called to',
    'adventure, the wider world beckoned, heeded the call.',
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

/**
 * Build an image prompt for the hero portrait — identity + a few real deeds,
 * in a generic high-fantasy style (deliberately not any specific game's art).
 */
export function buildPortraitPrompt(input: PlayHistoryInput): string {
  const { bible, sessions } = input;
  const notable: string[] = [];
  for (const s of sessions) {
    for (const u of s.stats.notableUnits.slice(0, 2)) if (!notable.includes(u)) notable.push(u);
    for (const it of s.stats.notableItems.slice(0, 1)) if (!notable.includes(it)) notable.push(it);
    if (notable.length >= 6) break;
  }
  const lvl = typeof bible.level === 'number' ? `, seasoned to around level ${bible.level}` : '';
  const p = pronouns(bible.sex);
  const deeds = notable.length
    ? ` Echoes of ${p.possessive} deeds: ${notable.slice(0, 6).join(', ')}.`
    : '';
  return (
    `Painterly fantasy character portrait, head and shoulders, three-quarter view, of a ` +
    `${p.noun ? `${p.noun} ` : ''}${bible.race} ${bible.class} (${bible.faction ?? 'unaligned'})${lvl}.` +
    deeds +
    ` Weathered, watchful, heroic. Earthy palette, warm dramatic rim light, ` +
    `semi-realistic digital painting, generic high-fantasy style (not any specific game).`
  );
}

/**
 * Generate a full CharacterBible from a captured hero's play history. Preserves
 * the hero's identity + createdAt (the addon records are keyed by createdAt) and
 * overlays the authored narrative. Persistence is the caller's job (saveBible).
 */
export async function generateFromPlayHistory(
  input: PlayHistoryInput,
  provider: LLMProvider,
  options: PlayHistoryOptions = {},
): Promise<PlayHistoryResult> {
  const prompt = buildPlayHistoryPrompt(input);

  let response;
  try {
    response = await provider.chat({
      task: 'bible-gen',
      model: options.model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      // Hosted gateway also paints the portrait under the same credit; BYOK
      // providers ignore these.
      imagePrompt: buildPortraitPrompt(input),
      imageId: String(input.bible.createdAt),
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
  const bible: CharacterBible = {
    ...input.bible,
    ...parsed,
    // Pin observed identity; the model may normalize spelling but these are
    // authoritative from the WoW import.
    name: input.bible.name,
    race: input.bible.race,
    class: input.bible.class,
    faction: input.bible.faction ?? parsed.faction,
    level: input.bible.level,
    currentZone: input.bible.currentZone,
    portraitUrl: response.imageUrl ?? input.bible.portraitUrl,
    needsSetup: false,
    createdAt: input.bible.createdAt, // MUST preserve — characterKey depends on it
    updatedAt: now,
  };

  return {
    bible,
    raw: response.text,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    latencyMs: response.latencyMs,
    promptVersion: PLAY_HISTORY_PROMPT_VERSION,
  };
}
