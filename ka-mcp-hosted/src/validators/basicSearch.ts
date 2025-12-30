/**
 * Zod schema for basic kanji search input validation.
 */

import { z } from 'zod';
import { normalizeJapaneseText } from '../utils/unicode.js';

/**
 * Zod shape for basic kanji search (for MCP SDK registration).
 */
export const basicSearchParamsShape = {
  query: z
    .string()
    .min(1, 'Search query cannot be empty')
    .max(100, 'Search query must be 100 characters or less')
    .describe(
      'Search term: a single kanji character (親), ' +
        'an Onyomi (on) reading in katakana (シン), ' +
        'a Kunyomi (kun) reading in hiragana (おや), ' +
        'or an English meaning (parent)'
    ),
};

/**
 * Schema for basic kanji search input.
 *
 * Accepts a search term that can be:
 * - A single kanji character (親)
 * - An Onyomi (on) reading in katakana (シン)
 * - A Kunyomi (kun) reading in hiragana (おや)
 * - An English meaning (parent)
 */
export const BasicSearchInputSchema = z.object({
  query: z
    .string({ message: 'Search query must be a string' })
    .min(1, 'Search query cannot be empty')
    .max(100, 'Search query must be 100 characters or less')
    .transform((v) => normalizeJapaneseText(v.trim())),
});

/**
 * TypeScript type for validated basic search input.
 */
export type BasicSearchInput = z.infer<typeof BasicSearchInputSchema>;

/**
 * Tool name constant.
 */
export const BASIC_SEARCH_TOOL_NAME = 'kanjialive_search_basic';

/**
 * Tool description.
 */
export const BASIC_SEARCH_TOOL_DESCRIPTION =
  'Search for kanji using a simple search term. ' +
  'The term can be a kanji character (親), Onyomi reading in katakana (シン), ' +
  'Kunyomi reading in hiragana (おや), or English meaning (parent). ' +
  'Returns a list of matching kanji with basic information.';
