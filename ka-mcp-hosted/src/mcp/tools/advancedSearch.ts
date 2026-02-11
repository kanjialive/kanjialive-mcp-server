/**
 * Advanced kanji search tool implementation.
 *
 * Provides multi-parameter search functionality with 11 optional filters.
 */

import { searchKanji } from '../../api/client.js';
import { AdvancedSearchInputSchema } from '../../validators/advancedSearch.js';
import { formatSearchResultsMarkdown } from '../../formatters/markdown.js';
import { createSearchMetadata } from '../../formatters/metadata.js';
import { ToolError, toErrorResult } from '../../utils/errors.js';
import type { ToolResult } from '../../utils/errors.js';
import { formatZodError } from '../../utils/validation.js';
import { logger } from '../../utils/logger.js';

/**
 * Execute advanced kanji search.
 *
 * @param args - Tool arguments containing search parameters
 * @returns MCP tool result with formatted search results
 */
export async function executeAdvancedSearch(
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const parseResult = AdvancedSearchInputSchema.safeParse(args);
    if (!parseResult.success) {
      throw new ToolError(`Validation error: ${formatZodError(parseResult.error)}`);
    }

    const params = parseResult.data;

    // Strip undefined values to build only the provided query parameters
    const queryParams: Record<string, unknown> = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    );

    logger.info('Advanced search', { params: queryParams });

    const [results, requestInfo] = await searchKanji('search/advanced', queryParams);

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

    const metadata = createSearchMetadata(results, queryParams, requestInfo);
    const formattedResults = formatSearchResultsMarkdown(results, metadata);

    logger.info('Advanced search completed', {
      params: queryParams,
      resultsCount: results.length,
    });

    return {
      content: [{ type: 'text', text: formattedResults }],
    };
  } catch (error) {
    return toErrorResult(error, 'Advanced search');
  }
}
