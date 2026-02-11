/**
 * Basic kanji search tool implementation.
 *
 * Provides simple search functionality using a single query term.
 */

import { searchKanji } from '../../api/client.js';
import { BasicSearchInputSchema } from '../../validators/basicSearch.js';
import { formatSearchResultsMarkdown } from '../../formatters/markdown.js';
import { createSearchMetadata } from '../../formatters/metadata.js';
import { ToolError, toErrorResult } from '../../utils/errors.js';
import type { ToolResult } from '../../utils/errors.js';
import { formatZodError } from '../../utils/validation.js';
import { logger } from '../../utils/logger.js';

/**
 * Execute basic kanji search.
 *
 * @param args - Tool arguments containing query
 * @returns MCP tool result with formatted search results
 */
export async function executeBasicSearch(
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const parseResult = BasicSearchInputSchema.safeParse(args);
    if (!parseResult.success) {
      throw new ToolError(`Validation error: ${formatZodError(parseResult.error)}`);
    }

    const { query } = parseResult.data;

    logger.info('Basic search', { query });

    const endpoint = `search/${encodeURIComponent(query)}`;
    const [results, requestInfo] = await searchKanji(endpoint);

    if (!results || results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No kanji found matching "${query}". Try a different search term.`,
          },
        ],
      };
    }

    const metadata = createSearchMetadata(results, { query }, requestInfo);
    const formattedResults = formatSearchResultsMarkdown(results, metadata);

    logger.info('Basic search completed', {
      query,
      resultsCount: results.length,
    });

    return {
      content: [{ type: 'text', text: formattedResults }],
    };
  } catch (error) {
    return toErrorResult(error, 'Basic search');
  }
}
