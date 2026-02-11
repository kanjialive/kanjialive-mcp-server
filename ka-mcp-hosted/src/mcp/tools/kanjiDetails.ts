/**
 * Kanji details tool implementation.
 *
 * Provides detailed information about a specific kanji character.
 */

import { getKanjiDetail } from '../../api/client.js';
import { KanjiDetailInputSchema } from '../../validators/kanjiDetail.js';
import { formatKanjiDetailMarkdown } from '../../formatters/markdown.js';
import { ToolError, validateApiResponse, toErrorResult } from '../../utils/errors.js';
import type { ToolResult } from '../../utils/errors.js';
import { formatZodError } from '../../utils/validation.js';
import { logger } from '../../utils/logger.js';
import type { KanjiDetail } from '../../api/types.js';

/**
 * Pick specified keys from an object, returning a new object with only those keys.
 */
function pickKeys(
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Filter raw API response to match the documented Kanji Alive API format.
 *
 * The Kanji Alive API returns both raw database fields and a clean nested structure.
 * This function extracts only the documented fields to avoid exposing:
 * - Internal database fields (_id, _rev, *_search indices)
 * - Licensing-restricted data (textbook chapters, mnemonic hints)
 * - Redundant/duplicate data
 *
 * The documented response format includes only:
 * - kanji: character, meaning, strokes (int), onyomi, kunyomi, video
 * - radical: character, strokes, image, position, name, meaning, animation
 * - references: grade, kodansha, classic_nelson
 * - examples: japanese, meaning, audio
 *
 * @param rawData - Raw API response from Kanji Alive
 * @returns Filtered dictionary matching the documented API format
 */
function filterKanjiDetailResponse(rawData: Record<string, unknown>): KanjiDetail {
  const filtered: Record<string, unknown> = {};

  // Extract and filter the 'kanji' object to documented fields only
  if (rawData.kanji && typeof rawData.kanji === 'object') {
    const kanjiRaw = rawData.kanji as Record<string, unknown>;
    const kanjiFiltered = pickKeys(kanjiRaw, ['character', 'meaning', 'onyomi', 'kunyomi', 'video']);

    // strokes: API returns object {count, timings, images}, docs show integer
    if ('strokes' in kanjiRaw) {
      const strokes = kanjiRaw.strokes;
      if (typeof strokes === 'object' && strokes !== null) {
        kanjiFiltered.strokes = (strokes as Record<string, unknown>).count ?? 0;
      } else {
        kanjiFiltered.strokes = strokes;
      }
    }

    filtered.kanji = kanjiFiltered;
  }

  // Extract the 'radical' object (already matches documented format)
  if (rawData.radical && typeof rawData.radical === 'object') {
    filtered.radical = rawData.radical;
  }

  // Extract references
  if (rawData.references && typeof rawData.references === 'object') {
    filtered.references = rawData.references;
  }

  // Extract examples array with only documented fields
  if (rawData.examples && Array.isArray(rawData.examples)) {
    const filteredExamples = (rawData.examples as Array<Record<string, unknown>>)
      .filter((ex): ex is Record<string, unknown> => typeof ex === 'object' && ex !== null)
      .map((ex) => pickKeys(ex, ['japanese', 'meaning', 'audio']))
      .filter((ex) => Object.keys(ex).length > 0);

    if (filteredExamples.length > 0) {
      filtered.examples = filteredExamples;
    }
  }

  return filtered as unknown as KanjiDetail;
}

/**
 * Execute kanji details lookup.
 *
 * @param args - Tool arguments containing character
 * @returns MCP tool result with formatted kanji details
 */
export async function executeKanjiDetails(
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const parseResult = KanjiDetailInputSchema.safeParse(args);
    if (!parseResult.success) {
      throw new ToolError(`Validation error: ${formatZodError(parseResult.error)}`);
    }

    const { character } = parseResult.data;

    logger.info('Get kanji details', { character });

    const [rawData] = await getKanjiDetail(character);

    validateApiResponse(rawData, `kanji '${character}'`);

    // Filter to documented fields only (removes internal DB fields, restricted data)
    const filteredData = filterKanjiDetailResponse(rawData as unknown as Record<string, unknown>);
    const formattedResults = formatKanjiDetailMarkdown(filteredData);

    logger.info('Kanji details completed', { character });

    return {
      content: [{ type: 'text', text: formattedResults }],
    };
  } catch (error) {
    return toErrorResult(error, 'Kanji details');
  }
}
