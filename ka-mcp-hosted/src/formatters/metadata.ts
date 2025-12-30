/**
 * Metadata generation for search results and kanji details.
 *
 * Provides functions to create and format metadata about API responses.
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
 * Metadata about kanji detail results.
 */
export interface KanjiDetailMetadata {
  character: string;
  fields_included: string[];
  timestamp: string;
  has_examples: boolean;
  has_video: boolean;
  has_audio: boolean;
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
export function extractFieldsFromResults(
  results: SearchResponse
): string[] {
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

/**
 * Create metadata object for kanji detail results.
 *
 * @param kanji - Kanji detail object from API
 * @param requestInfo - Request metadata (endpoint, timestamp)
 * @returns KanjiDetailMetadata object with result information
 */
export function createKanjiDetailMetadata(
  kanji: Record<string, unknown>,
  requestInfo: RequestInfo
): KanjiDetailMetadata {
  const kInfo = kanji.kanji as Record<string, unknown> | undefined;
  const examples = kanji.examples as Array<Record<string, unknown>> | undefined;

  // Check for multimedia content
  const video = kInfo?.video as Record<string, unknown> | undefined;
  const hasVideo = Boolean(video?.mp4);

  // Check if any example has audio
  const hasAudio = examples?.some((ex) => {
    const audio = ex.audio as Record<string, unknown> | undefined;
    return Boolean(audio?.mp3);
  }) ?? false;

  return {
    character: (kInfo?.character as string) ?? '?',
    fields_included: Object.keys(kanji).sort(),
    timestamp: requestInfo.timestamp,
    has_examples: Boolean(examples && examples.length > 0),
    has_video: hasVideo,
    has_audio: hasAudio,
  };
}

/**
 * Format search metadata as a markdown header.
 *
 * @param metadata - Search result metadata
 * @returns Markdown-formatted header string
 */
export function formatMetadataAsMarkdown(metadata: SearchResultMetadata): string {
  const paramsStr = Object.entries(metadata.query_parameters)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return (
    `## Search Information\n\n` +
    `- **Results Returned:** ${metadata.results_returned}\n` +
    `- **Fields Included:** ${metadata.fields_included.join(', ')}\n` +
    `- **Query Parameters:** ${paramsStr}\n` +
    `- **Generated:** ${metadata.timestamp}\n\n`
  );
}
