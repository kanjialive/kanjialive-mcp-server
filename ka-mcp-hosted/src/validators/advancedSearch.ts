/**
 * Zod schema for advanced kanji search input validation.
 *
 * This is the most complex validation schema, handling 11 optional parameters
 * with custom validation for Japanese script types and radical positions.
 */

import { z } from 'zod';
import { normalizeJapaneseText } from '../utils/unicode.js';
import {
  isKatakana,
  isHiragana,
  isRomaji,
  isRomajiWithDots,
  VALID_RADICAL_POSITIONS,
  normalizeRadicalPosition,
  validateStudyList,
} from './utils.js';

/**
 * Custom Zod refinement for Onyomi readings.
 * Must be either romaji or katakana (not hiragana).
 */
const onyomiSchema = z
  .string()
  .optional()
  .transform((v) => (v ? normalizeJapaneseText(v.trim()) : undefined))
  .refine(
    (v) => {
      if (v === undefined) return true;
      return isKatakana(v) || isRomaji(v);
    },
    {
      message:
        "Invalid Onyomi reading. Must be either romaji (e.g., 'shin') or katakana (e.g., 'シン'). " +
        'Do not mix scripts or use hiragana for Onyomi.',
    }
  )
  .transform((v) => {
    if (v === undefined) return undefined;
    // Normalize romaji to lowercase
    return isRomaji(v) ? v.toLowerCase() : v;
  });

/**
 * Custom Zod refinement for Kunyomi and radical name readings.
 * Must be either romaji or hiragana (not katakana).
 */
const hiraganaOrRomajiSchema = z
  .string()
  .optional()
  .transform((v) => (v ? normalizeJapaneseText(v.trim()) : undefined))
  .refine(
    (v) => {
      if (v === undefined) return true;
      return isHiragana(v) || isRomajiWithDots(v);
    },
    {
      message:
        "Invalid reading. Must be either romaji (e.g., 'oya') or hiragana (e.g., 'おや'). " +
        'Do not mix scripts or use katakana.',
    }
  )
  .transform((v) => {
    if (v === undefined) return undefined;
    // Normalize romaji to lowercase
    return isRomajiWithDots(v) ? v.toLowerCase() : v;
  });

/**
 * Custom Zod refinement for radical position.
 * Must be a valid position in romaji or hiragana.
 */
const radicalPositionSchema = z
  .string()
  .optional()
  .transform((v) => (v ? v.trim().toLowerCase() : undefined))
  .refine(
    (v) => {
      if (v === undefined) return true;
      return VALID_RADICAL_POSITIONS.has(v);
    },
    {
      message:
        'Invalid radical position. ' +
        'Valid romaji: hen, tsukuri, kanmuri, ashi, kamae, tare, nyou. ' +
        'Valid hiragana: へん, つくり, かんむり, あし, かまえ, たれ, にょう',
    }
  )
  .transform((v) => (v !== undefined ? normalizeRadicalPosition(v) : undefined));

/**
 * Custom Zod refinement for study list.
 * Must be 'ap', 'mac', or 'ap:c3', 'mac:c12' format.
 */
const studyListSchema = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return undefined;
    return validateStudyList(v);
  });

/**
 * Zod shape for advanced search (for MCP SDK registration).
 */
export const advancedSearchParamsShape = {
  on: z.string().optional().describe('Onyomi (on) reading in romaji or katakana (shin, シン)'),
  kun: z.string().optional().describe('Kunyomi (kun) reading in romaji or hiragana (oya, おや)'),
  kem: z.string().optional().describe('Kanji English meaning (parent, see)'),
  ks: z.number().int().min(1).max(30).optional().describe('Kanji stroke number (1-30)'),
  kanji: z.string().length(1).optional().describe('Kanji character (親, 見)'),
  rjn: z
    .string()
    .optional()
    .describe('Radical Japanese name in romaji or hiragana (miru, みる)'),
  rem: z.string().optional().describe('Radical English meaning (see, fire, water)'),
  rs: z.number().int().min(1).max(17).optional().describe('Radical stroke number (1-17)'),
  rpos: z
    .string()
    .optional()
    .describe(
      'Radical position: hen, tsukuri, kanmuri, ashi, kamae, tare, nyou, or in hiragana'
    ),
  grade: z.number().int().min(1).max(6).optional().describe('School grade level (1-6)'),
  list: z
    .string()
    .optional()
    .describe(
      "Study list: 'ap' (Advanced Placement), 'mac' (Macquarie), or with chapter: 'ap:c3', 'mac:c12'"
    ),
};

/**
 * Schema for advanced kanji search input.
 *
 * All parameters are optional but at least one must be provided.
 */
export const AdvancedSearchInputSchema = z
  .object({
    on: onyomiSchema,
    kun: hiraganaOrRomajiSchema,
    kem: z
      .string()
      .optional()
      .transform((v) => v?.trim()),
    ks: z.number().int().min(1).max(30).optional(),
    kanji: z
      .string()
      .length(1)
      .optional()
      .transform((v) => (v ? normalizeJapaneseText(v.trim()) : undefined)),
    rjn: hiraganaOrRomajiSchema,
    rem: z
      .string()
      .optional()
      .transform((v) => v?.trim()),
    rs: z.number().int().min(1).max(17).optional(),
    rpos: radicalPositionSchema,
    grade: z.number().int().min(1).max(6).optional(),
    list: studyListSchema,
  })
  .refine(
    (data) => {
      // At least one parameter must be provided
      return Object.values(data).some((v) => v !== undefined);
    },
    {
      message:
        'At least one search parameter must be provided. ' +
        'Available: on, kun, kem, ks, kanji, rjn, rem, rs, rpos, grade, list',
    }
  );

/**
 * TypeScript type for validated advanced search input.
 */
export type AdvancedSearchInput = z.infer<typeof AdvancedSearchInputSchema>;

/**
 * Tool name constant.
 */
export const ADVANCED_SEARCH_TOOL_NAME = 'kanjialive_search_advanced';

/**
 * Tool description.
 */
export const ADVANCED_SEARCH_TOOL_DESCRIPTION =
  'Search for kanji using multiple filter criteria. ' +
  'Filter by readings, meanings, stroke counts, radical properties, grade levels, and study lists. ' +
  'All parameters are optional but at least one must be provided.';
