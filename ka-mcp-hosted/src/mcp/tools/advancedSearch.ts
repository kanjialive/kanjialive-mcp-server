/**
 * Advanced kanji search tool implementation.
 *
 * Provides multi-parameter search functionality with 11 optional filters.
 */

import { searchKanji } from '../../api/client.js';
import { AdvancedSearchInputSchema } from '../../validators/advancedSearch.js';
import { formatSearchResultsMarkdown } from '../../formatters/markdown.js';
import { createSearchMetadata } from '../../formatters/metadata.js';
import { handleApiError, ToolError } from '../../utils/errors.js';
import { formatZodError } from '../../utils/validation.js';
import { logger } from '../../utils/logger.js';
import type { SearchResponse, RequestInfo } from '../../api/types.js';

/**
 * Result from executing the advanced search tool.
 */
export interface AdvancedSearchResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Execute advanced kanji search.
 *
 * @param args - Tool arguments containing search parameters
 * @returns MCP tool result with formatted search results
 */
export async function executeAdvancedSearch(
  args: Record<string, unknown>
): Promise<AdvancedSearchResult> {
  try {
    // Validate input
    const parseResult = AdvancedSearchInputSchema.safeParse(args);
    if (!parseResult.success) {
      throw new ToolError(`Validation error: ${formatZodError(parseResult.error)}`);
    }

    const params = parseResult.data;

    // Build query parameters (only include defined values)
    const queryParams: Record<string, unknown> = {};
    if (params.on !== undefined) queryParams.on = params.on;
    if (params.kun !== undefined) queryParams.kun = params.kun;
    if (params.kem !== undefined) queryParams.kem = params.kem;
    if (params.ks !== undefined) queryParams.ks = params.ks;
    if (params.kanji !== undefined) queryParams.kanji = params.kanji;
    if (params.rjn !== undefined) queryParams.rjn = params.rjn;
    if (params.rem !== undefined) queryParams.rem = params.rem;
    if (params.rs !== undefined) queryParams.rs = params.rs;
    if (params.rpos !== undefined) queryParams.rpos = params.rpos;
    if (params.grade !== undefined) queryParams.grade = params.grade;
    if (params.list !== undefined) queryParams.list = params.list;

    logger.info('Advanced search', { params: queryParams });

    // Make API request
    const [results, requestInfo]: [SearchResponse, RequestInfo] = await searchKanji(
      'search/advanced',
      queryParams
    );

    // Handle empty results
    if (!results || results.length === 0) {
      const paramsStr = Object.entries(queryParams)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return {
        content: [
          {
            type: 'text',
            text: `No kanji found matching the specified criteria: ${paramsStr}. Try adjusting your search parameters.`,
          },
        ],
      };
    }

    // Create metadata
    const metadata = createSearchMetadata(results, queryParams, requestInfo);

    // Format results
    const formattedResults = formatSearchResultsMarkdown(results, metadata);

    logger.info('Advanced search completed', {
      params: queryParams,
      resultsCount: results.length,
    });

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
    logger.error('Advanced search error', {
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
