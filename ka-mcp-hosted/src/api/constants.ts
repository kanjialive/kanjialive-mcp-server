/**
 * API configuration constants for the Kanji Alive RapidAPI integration.
 */

/**
 * Base URL for all Kanji Alive API requests.
 */
export const API_BASE_URL = 'https://kanjialive-api.p.rapidapi.com/api/public';

/**
 * Request timeout in milliseconds.
 */
export const REQUEST_TIMEOUT = 30000;

/**
 * RapidAPI host header value.
 */
export const RAPIDAPI_HOST = 'kanjialive-api.p.rapidapi.com';

/**
 * User-Agent header for API requests.
 */
export const USER_AGENT = 'kanjialive-mcp/1.0 (+https://github.com/kanjialive-mcp-server)';

/**
 * Maximum number of retry attempts for failed requests.
 */
export const MAX_RETRIES = 3;

/**
 * Initial delay for exponential backoff (in seconds).
 */
export const INITIAL_BACKOFF = 0.5;

/**
 * Maximum delay for exponential backoff (in seconds).
 */
export const MAX_BACKOFF = 30;
