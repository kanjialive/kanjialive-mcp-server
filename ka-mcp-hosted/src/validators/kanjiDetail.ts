/**
 * Zod schema for kanji detail input validation.
 */

import { z } from 'zod';
import { normalizeJapaneseText, validateNoControlChars } from '../utils/unicode.js';
import { isKanjiCharacter } from './utils.js';

/**
 * Zod shape for kanji detail (for MCP SDK registration).
 */
export const kanjiDetailParamsShape = {
  character: z
    .string()
    .length(1, 'Character must be a single kanji')
    .describe('The kanji character to look up (親, 見, 日)'),
};

/**
 * Schema for kanji detail input.
 *
 * Accepts a single kanji character.
 */
export const KanjiDetailInputSchema = z.object({
  character: z
    .string({ message: 'Kanji character must be a string' })
    .length(1, 'Character must be a single kanji')
    .transform((v) => validateNoControlChars(normalizeJapaneseText(v.trim()), 'character'))
    .refine((v) => isKanjiCharacter(v), {
      message:
        'Invalid kanji character. Must be a CJK ideograph (e.g., 親, 見, 日). ' +
        'Hiragana, katakana, romaji, and other characters are not accepted.',
    }),
});

/**
 * TypeScript type for validated kanji detail input.
 */
export type KanjiDetailInput = z.infer<typeof KanjiDetailInputSchema>;

/**
 * Tool name constant.
 */
export const KANJI_DETAIL_TOOL_NAME = 'kanjialive_get_kanji_details';

/**
 * Tool description.
 */
export const KANJI_DETAIL_TOOL_DESCRIPTION =
  'Get comprehensive information about a specific kanji character. ' +
  'Returns detailed data including readings (on/kun), meanings, radical, ' +
  'stroke order (with animated video), grade level, and example words.';
