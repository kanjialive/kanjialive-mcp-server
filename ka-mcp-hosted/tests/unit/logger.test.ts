import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { logger, logApiRequest, logApiResponse, logApiError } from '../../src/utils/logger.js';

// Winston's level methods are chainable, so the spies must return the logger.
let debug: MockInstance;
let error: MockInstance;

beforeEach(() => {
  debug = vi.spyOn(logger, 'debug').mockReturnValue(logger);
  error = vi.spyOn(logger, 'error').mockReturnValue(logger);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('never terminates the process on a logged exception', () => {
    expect(logger.exitOnError).toBe(false);
  });
});

describe('logApiRequest', () => {
  it('logs method, path and params at debug level', () => {
    logApiRequest('GET', 'search/water', { grade: 2 });

    expect(debug).toHaveBeenCalledWith('API request', {
      method: 'GET',
      path: 'search/water',
      params: { grade: 2 },
    });
  });

  it('defaults params to an empty object', () => {
    logApiRequest('GET', 'search/water');
    expect(debug).toHaveBeenCalledWith('API request', {
      method: 'GET',
      path: 'search/water',
      params: {},
    });
  });
});

describe('logApiResponse', () => {
  it('logs path, status and duration at debug level', () => {
    logApiResponse('search/water', 200, 42);

    expect(debug).toHaveBeenCalledWith('API response', {
      path: 'search/water',
      status: 200,
      durationMs: 42,
    });
  });
});

describe('logApiError', () => {
  it('logs the error type and message at error level', () => {
    logApiError('search/water', new TypeError('boom'));

    expect(error).toHaveBeenCalledWith('API error', {
      path: 'search/water',
      errorType: 'TypeError',
      errorMessage: 'boom',
    });
  });

  it('merges extra context into the log entry', () => {
    logApiError('search/water', new Error('boom'), { status: 500, attempt: 2 });

    expect(error).toHaveBeenCalledWith('API error', {
      path: 'search/water',
      errorType: 'Error',
      errorMessage: 'boom',
      status: 500,
      attempt: 2,
    });
  });
});
