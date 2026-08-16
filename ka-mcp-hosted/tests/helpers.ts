/**
 * Shared test factories and fixtures.
 *
 * Anything constructed in more than one test file belongs here — three copies
 * of the AxiosError factory had already drifted into three different second
 * parameters and two different casts before this existed.
 */

import { AxiosError, AxiosHeaders } from 'axios';
import type { RequestInfo } from '../src/api/types.js';

/**
 * Build an AxiosError carrying an HTTP status, and optionally a status text
 * and response headers (the latter drives the Retry-After path).
 */
export function httpError(
  status: number,
  { statusText = '', headers }: { statusText?: string; headers?: Record<string, string> } = {}
): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = {
    status,
    statusText,
    data: {},
    headers: headers ?? new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  } as unknown as AxiosError['response'];
  return error;
}

/** Build an AxiosError carrying a transport-level error code. */
export function codeError(code: string): AxiosError {
  const error = new AxiosError('Transport failure');
  error.code = code;
  return error;
}

/** Request metadata attached to every mocked API result. */
export const requestInfo: RequestInfo = {
  endpoint: 'search/water',
  params: {},
  timestamp: '2026-08-16T18:07:07.373Z',
};

/**
 * One search-result row as the API returns it.
 *
 * Named to match `mock_search_results` in the Python suite's conftest so the
 * two implementations' fixtures stay recognisably the same data.
 */
export const mockSearchResult = {
  kanji: { character: '水', stroke: 4 },
  radical: { character: '⽔', stroke: 4, order: 109 },
};

/** The markdown row `mockSearchResult` formats to. */
export const mockSearchResultRow = '| 水 | 4 | ⽔ | 4 | 109 |';
