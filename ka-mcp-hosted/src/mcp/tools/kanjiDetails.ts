/**
 * Kanji details tool implementation.
 *
 * Provides detailed information about a specific kanji character.
 */

import { getKanjiDetail } from '../../api/client.js';
import { KanjiDetailInputSchema } from '../../validators/kanjiDetail.js';
import { formatKanjiDetailMarkdown } from '../../formatters/markdown.js';
import { handleApiError, ToolError, validateApiResponse } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { KanjiDetail, RequestInfo } from '../../api/types.js';

/**
 * Result from executing the kanji details tool.
 */
export interface KanjiDetailsResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Format Zod validation errors into a readable string.
 */
function formatZodError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: unknown[]; message: string }> };
    return zodError.issues
      .map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`)
      .join('; ');
  }
  return 'Validation error';
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
    const kanjiFiltered: Record<string, unknown> = {};

    if ('character' in kanjiRaw) {
      kanjiFiltered.character = kanjiRaw.character;
    }
    if ('meaning' in kanjiRaw) {
      kanjiFiltered.meaning = kanjiRaw.meaning;
    }

    // strokes: API returns object {count, timings, images}, docs show integer
    if ('strokes' in kanjiRaw) {
      const strokes = kanjiRaw.strokes;
      if (typeof strokes === 'object' && strokes !== null) {
        kanjiFiltered.strokes = (strokes as Record<string, unknown>).count ?? 0;
      } else {
        kanjiFiltered.strokes = strokes;
      }
    }

    if ('onyomi' in kanjiRaw) {
      kanjiFiltered.onyomi = kanjiRaw.onyomi;
    }
    if ('kunyomi' in kanjiRaw) {
      kanjiFiltered.kunyomi = kanjiRaw.kunyomi;
    }
    if ('video' in kanjiRaw) {
      kanjiFiltered.video = kanjiRaw.video;
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
    const filteredExamples: Array<Record<string, unknown>> = [];
    for (const example of rawData.examples) {
      if (typeof example === 'object' && example !== null) {
        const ex = example as Record<string, unknown>;
        const filteredExample: Record<string, unknown> = {};
        if ('japanese' in ex) {
          filteredExample.japanese = ex.japanese;
        }
        if ('meaning' in ex) {
          filteredExample.meaning = ex.meaning;
        }
        if ('audio' in ex) {
          filteredExample.audio = ex.audio;
        }
        if (Object.keys(filteredExample).length > 0) {
          filteredExamples.push(filteredExample);
        }
      }
    }
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
): Promise<KanjiDetailsResult> {
  try {
    // Validate input
    const parseResult = KanjiDetailInputSchema.safeParse(args);
    if (!parseResult.success) {
      throw new ToolError(`Validation error: ${formatZodError(parseResult.error)}`);
    }

    const { character } = parseResult.data;

    logger.info('Get kanji details', { character });

    // Make API request
    const [rawData, requestInfo]: [KanjiDetail, RequestInfo] = await getKanjiDetail(character);

    // Validate not empty
    validateApiResponse(rawData, `kanji '${character}'`);

    // Filter to documented fields only (removes internal DB fields, restricted data)
    const filteredData = filterKanjiDetailResponse(rawData as unknown as Record<string, unknown>);

    // Format results
    const formattedResults = formatKanjiDetailMarkdown(filteredData);

    logger.info('Kanji details completed', { character });

    return {
      content: [
        {
          type: 'text',
          text: formattedResults,
        },
      ],
    };
  } catch (error) {
    if (error instanceof ToolError) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }

    // Log and transform other errors
    logger.error('Kanji details error', {
      error: error instanceof Error ? error.message : String(error),
    });

    // handleApiError throws ToolError - catch it and return proper MCP response
    try {
      handleApiError(error);
    } catch (toolError) {
      return {
        content: [{ type: 'text', text: toolError instanceof ToolError ? toolError.message : 'An unexpected error occurred' }],
        isError: true,
      };
    }

    // Fallback (should never reach here)
    return {
      content: [{ type: 'text', text: 'An unexpected error occurred' }],
      isError: true,
    };
  }
}
