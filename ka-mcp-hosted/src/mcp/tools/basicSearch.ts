/**
 * Basic kanji search tool implementation.
 *
 * Provides simple search functionality using a single query term.
 */

import { searchKanji } from '../../api/client.js';
import { BasicSearchInputSchema } from '../../validators/basicSearch.js';
import { formatSearchResultsMarkdown } from '../../formatters/markdown.js';
import { createSearchMetadata } from '../../formatters/metadata.js';
import { handleApiError, ToolError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { SearchResponse, RequestInfo } from '../../api/types.js';

/**
 * Result from executing the basic search tool.
 */
export interface BasicSearchResult {
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
 * Execute basic kanji search.
 *
 * @param args - Tool arguments containing query
 * @returns MCP tool result with formatted search results
 */
export async function executeBasicSearch(
  args: Record<string, unknown>
): Promise<BasicSearchResult> {
  try {
    // Validate input
    const parseResult = BasicSearchInputSchema.safeParse(args);
    if (!parseResult.success) {
      throw new ToolError(`Validation error: ${formatZodError(parseResult.error)}`);
    }

    const { query } = parseResult.data;

    logger.info('Basic search', { query });

    // Make API request
    const endpoint = `search/${encodeURIComponent(query)}`;
    const [results, requestInfo]: [SearchResponse, RequestInfo] = await searchKanji(endpoint);

    // Handle empty results
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

    // Create metadata
    const metadata = createSearchMetadata(results, { query }, requestInfo);

    // Format results
    const formattedResults = formatSearchResultsMarkdown(results, metadata);

    logger.info('Basic search completed', {
      query,
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
    logger.error('Basic search error', {
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
