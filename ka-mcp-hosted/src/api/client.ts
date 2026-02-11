/**
 * Axios HTTP client with retry logic for Kanji Alive API.
 *
 * Implements exponential backoff with jitter, respects Retry-After headers,
 * and only retries on transient errors (429 rate limit, 5xx server errors).
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import axiosRetry, { IAxiosRetryConfig, isNetworkOrIdempotentRequestError } from 'axios-retry';
import {
  API_BASE_URL,
  REQUEST_TIMEOUT,
  RAPIDAPI_HOST,
  USER_AGENT,
  MAX_RETRIES,
  INITIAL_BACKOFF,
  MAX_BACKOFF,
} from './constants.js';
import { logger, logApiRequest, logApiResponse, logApiError } from '../utils/logger.js';
import type { RequestInfo, ApiResponse, SearchResponse, KanjiDetail } from './types.js';

/**
 * Get API headers with runtime key validation.
 *
 * @returns HTTP headers for RapidAPI requests
 * @throws Error if RAPIDAPI_KEY is not configured
 */
export function getApiHeaders(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;

  if (!key || key === 'YOUR_RAPIDAPI_KEY_HERE') {
    throw new Error(
      'RAPIDAPI_KEY environment variable must be set. ' +
        'Get your free API key at: ' +
        'https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji'
    );
  }

  return {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
}

/**
 * Calculate exponential backoff delay with jitter.
 *
 * @param retryCount - Current retry attempt (1-based)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(retryCount: number): number {
  // Exponential backoff: 0.5, 1, 2, 4, ... seconds
  const base = Math.min(INITIAL_BACKOFF * Math.pow(2, retryCount - 1), MAX_BACKOFF);
  // Add jitter (0-10% of base)
  const jitter = Math.random() * base * 0.1;
  return (base + jitter) * 1000; // Convert to milliseconds
}

/**
 * Custom retry condition that includes 429 rate limiting.
 *
 * @param error - Axios error
 * @returns True if request should be retried
 */
function shouldRetry(error: AxiosError): boolean {
  if (isNetworkOrIdempotentRequestError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (!status) return false;

  // Retry on rate limiting (429) and server errors (5xx)
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Get delay from Retry-After header or use calculated backoff.
 *
 * @param error - Axios error
 * @param retryCount - Current retry attempt
 * @returns Delay in milliseconds
 */
function getRetryDelay(error: AxiosError, retryCount: number): number {
  const retryAfter = error.response?.headers?.['retry-after'];

  if (retryAfter && /^\d+$/.test(retryAfter)) {
    const requestedSeconds = parseInt(retryAfter, 10);
    const cappedSeconds = Math.min(requestedSeconds, MAX_BACKOFF);
    const wasCapped = requestedSeconds > MAX_BACKOFF;
    logger.warn(
      `Rate limited (429). Retry-After: ${retryAfter}s` +
        (wasCapped ? `, capped to ${cappedSeconds}s` : '')
    );
    return cappedSeconds * 1000;
  }

  return calculateBackoffDelay(retryCount);
}

/**
 * Create and configure the Axios client with retry logic.
 *
 * @returns Configured Axios instance
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    headers: getApiHeaders(),
  });

  // Configure retry behavior
  const retryConfig: IAxiosRetryConfig = {
    retries: MAX_RETRIES,
    retryDelay: (retryCount, error) => getRetryDelay(error as AxiosError, retryCount),
    retryCondition: shouldRetry,
    onRetry: (retryCount, error, requestConfig) => {
      const status = (error as AxiosError).response?.status;
      logger.warn(`Retry attempt ${retryCount}/${MAX_RETRIES}`, {
        url: requestConfig.url,
        status,
        errorMessage: error.message,
      });
    },
  };

  axiosRetry(client, retryConfig);

  // Add request interceptor for logging
  client.interceptors.request.use((config) => {
    logApiRequest(config.method?.toUpperCase() || 'GET', config.url || '', config.params);
    return config;
  });

  // Add response interceptor for logging
  client.interceptors.response.use(
    (response) => {
      logApiResponse(response.config.url || '', response.status, 0);
      return response;
    },
    (error) => {
      if (error instanceof AxiosError) {
        logApiError(error.config?.url || '', error);
      }
      return Promise.reject(error);
    }
  );

  return client;
}

// Singleton client instance
let clientInstance: AxiosInstance | null = null;

/**
 * Get or create the API client instance.
 *
 * @returns Axios client instance
 */
export function getClient(): AxiosInstance {
  if (!clientInstance) {
    clientInstance = createApiClient();
  }
  return clientInstance;
}

/**
 * Validate search response structure.
 *
 * @param data - Response data
 * @param endpoint - API endpoint that was called
 * @throws Error if response structure is invalid
 */
function validateSearchResponse(data: unknown, endpoint: string): void {
  if (!Array.isArray(data)) {
    logger.error('Invalid search response type', {
      endpoint,
      responseType: typeof data,
    });
    const detail = process.env.NODE_ENV === 'production'
      ? 'Invalid API response format'
      : `API returned unexpected format for search. Expected list of results, got ${typeof data}`;
    throw new Error(detail);
  }

  // Validate each result has required fields
  for (let idx = 0; idx < data.length; idx++) {
    const item = data[idx];
    if (typeof item !== 'object' || item === null) {
      const detail = process.env.NODE_ENV === 'production'
        ? 'Invalid API response format'
        : `Search result ${idx} is not a dictionary (got ${typeof item})`;
      throw new Error(detail);
    }
    if (!('kanji' in item)) {
      logger.warn(`Search result ${idx} missing 'kanji' field`, {
        resultKeys: Object.keys(item),
      });
    }
  }
}

/**
 * Validate kanji detail response structure.
 *
 * @param data - Response data
 * @param endpoint - API endpoint that was called
 * @throws Error if response structure is invalid
 */
function validateKanjiDetailResponse(data: unknown, endpoint: string): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    logger.error('Invalid kanji detail response type', {
      endpoint,
      responseType: typeof data,
    });
    const detail = process.env.NODE_ENV === 'production'
      ? 'Invalid API response format'
      : `API returned unexpected format for kanji details. Expected dictionary, got ${typeof data}`;
    throw new Error(detail);
  }

  // Check for required top-level fields
  if (!('kanji' in data)) {
    logger.warn('Kanji detail response missing kanji field', {
      availableFields: Object.keys(data),
    });
  }
}

/**
 * Make a search API request.
 *
 * @param endpoint - API endpoint (e.g., 'search/親' or 'search/advanced')
 * @param params - Optional query parameters for advanced search
 * @returns Tuple of [search results, request info]
 */
export async function searchKanji(
  endpoint: string,
  params?: Record<string, unknown>
): Promise<ApiResponse<SearchResponse>> {
  const client = getClient();
  const response: AxiosResponse = await client.get(endpoint, { params });

  validateSearchResponse(response.data, endpoint);

  const requestInfo: RequestInfo = {
    endpoint,
    params: params || {},
    timestamp: new Date().toISOString(),
  };

  return [response.data as SearchResponse, requestInfo];
}

/**
 * Make a kanji detail API request.
 *
 * @param character - Kanji character to look up
 * @returns Tuple of [kanji detail, request info]
 */
export async function getKanjiDetail(
  character: string
): Promise<ApiResponse<KanjiDetail>> {
  const client = getClient();
  const endpoint = `kanji/${encodeURIComponent(character)}`;
  const response: AxiosResponse = await client.get(endpoint);

  validateKanjiDetailResponse(response.data, endpoint);

  const requestInfo: RequestInfo = {
    endpoint,
    params: {},
    timestamp: new Date().toISOString(),
  };

  return [response.data as KanjiDetail, requestInfo];
}
