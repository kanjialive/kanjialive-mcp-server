/**
 * Metadata generation for search results.
 *
 * Provides functions to create metadata about API search responses.
 */

import type { SearchResponse, RequestInfo } from '../api/types.js';

/**
 * Metadata about search results.
 */
export interface SearchResultMetadata {
  results_returned: number;
  fields_included: string[];
  timestamp: string;
  query_parameters: Record<string, unknown>;
}


/**
 * Extract all unique field names present in kanji results.
 *
 * This function examines the actual structure of returned data to identify
 * which fields are available. This prevents assumptions about data structure.
 *
 * @param results - List of kanji objects from API
 * @returns Sorted list of unique top-level field names found in results
 */
export function extractFieldsFromResults(results: SearchResponse): string[] {
  if (!results || results.length === 0) {
    return [];
  }

  const fields = new Set<string>();
  for (const kanji of results) {
    for (const key of Object.keys(kanji)) {
      fields.add(key);
    }
  }

  return Array.from(fields).sort();
}

/**
 * Create metadata object for search results.
 *
 * @param results - List of kanji returned from API
 * @param queryParams - Query parameters used in search
 * @param requestInfo - Request metadata (endpoint, timestamp)
 * @returns SearchResultMetadata object with result information
 */
export function createSearchMetadata(
  results: SearchResponse,
  queryParams: Record<string, unknown>,
  requestInfo: RequestInfo
): SearchResultMetadata {
  const fields = extractFieldsFromResults(results);

  return {
    results_returned: results.length,
    fields_included: fields,
    timestamp: requestInfo.timestamp,
    query_parameters: queryParams,
  };
}
