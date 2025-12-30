/**
 * TypeScript types for API requests and responses.
 */

/**
 * Metadata about an API request.
 */
export interface RequestInfo {
  endpoint: string;
  params: Record<string, unknown>;
  timestamp: string;
}

/**
 * Kanji object from search results (minimal data).
 */
export interface SearchResultKanji {
  kanji: {
    character: string;
    stroke?: number;
  };
  radical?: {
    character?: string;
    stroke?: number;
    order?: number;
  };
}

/**
 * Response from search endpoints.
 */
export type SearchResponse = SearchResultKanji[];

/**
 * Detailed kanji information from the detail endpoint.
 * Note: This is the filtered response, not raw API output.
 */
export interface KanjiDetail {
  kanji: {
    character: string;
    strokes: number;
    meaning: {
      english: string;
    };
    onyomi?: {
      romaji?: string;
      katakana?: string;
    };
    kunyomi?: {
      romaji?: string;
      hiragana?: string;
    };
    video?: {
      mp4?: string;
      poster?: string;
    };
  };
  radical?: {
    character?: string;
    strokes?: number;
    name?: {
      romaji?: string;
      hiragana?: string;
    };
    meaning?: {
      english?: string;
    };
    position?: {
      romaji?: string;
      hiragana?: string;
    };
    order?: number;
  };
  references?: {
    grade?: number;
    kodansha?: string;
    classic_nelson?: string;
  };
  examples?: Array<{
    japanese: string;
    meaning: {
      english: string;
    };
    audio?: {
      mp3?: string;
      ogg?: string;
    };
  }>;
}

/**
 * API response tuple: [data, request_info].
 */
export type ApiResponse<T> = [T, RequestInfo];
