import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  ToolError,
  ValidationError,
  handleApiError,
  validateApiResponse,
  toErrorResult,
} from '../../src/utils/errors.js';
import { formatZodError } from '../../src/utils/validation.js';

/** Build an AxiosError carrying a given HTTP status. */
function httpError(status: number, statusText = ''): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = {
    status,
    statusText,
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  } as AxiosError['response'];
  return error;
}

/** Build an AxiosError carrying a transport-level error code. */
function codeError(code: string): AxiosError {
  const error = new AxiosError('Transport failure');
  error.code = code;
  return error;
}

describe('custom error classes', () => {
  it('keeps instanceof working across the prototype chain', () => {
    const toolError = new ToolError('boom');
    expect(toolError).toBeInstanceOf(ToolError);
    expect(toolError).toBeInstanceOf(Error);
    expect(toolError.name).toBe('ToolError');
    expect(toolError.message).toBe('boom');
  });

  it('records field and value on ValidationError', () => {
    const error = new ValidationError('bad input', 'query', 123);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ValidationError');
    expect(error.field).toBe('query');
    expect(error.value).toBe(123);
  });
});

describe('handleApiError', () => {
  it('always throws a ToolError', () => {
    expect(() => handleApiError(httpError(404))).toThrow(ToolError);
  });

  it('explains a 404 in terms of the 1,235-kanji corpus', () => {
    expect(() => handleApiError(httpError(404))).toThrow(/not found/i);
    expect(() => handleApiError(httpError(404))).toThrow(/1,235 kanji/);
  });

  it('maps 400 to a parameter-checking hint', () => {
    expect(() => handleApiError(httpError(400))).toThrow(/Invalid request/);
  });

  it('maps 429 to a rate-limit message', () => {
    expect(() => handleApiError(httpError(429))).toThrow(/Rate limit exceeded/);
  });

  it('maps 5xx to a server-error message', () => {
    expect(() => handleApiError(httpError(500))).toThrow(/server error/i);
    expect(() => handleApiError(httpError(503))).toThrow(/server error/i);
  });

  it('maps timeout codes to a timeout message', () => {
    expect(() => handleApiError(codeError('ECONNABORTED'))).toThrow(/timed out/);
    expect(() => handleApiError(codeError('ETIMEDOUT'))).toThrow(/timed out/);
  });

  it('maps DNS and connection-refused codes to a network message', () => {
    expect(() => handleApiError(codeError('ENOTFOUND'))).toThrow(/Network error/);
    expect(() => handleApiError(codeError('ECONNREFUSED'))).toThrow(/Network error/);
  });

  it('falls back to status and statusText for other HTTP errors', () => {
    expect(() => handleApiError(httpError(418, "I'm a teapot"))).toThrow(
      /status 418: I'm a teapot/
    );
  });

  it('prefixes ValidationError messages', () => {
    expect(() => handleApiError(new ValidationError('bad kanji'))).toThrow(
      /Validation error: bad kanji/
    );
  });

  it('sanitizes unexpected errors so internals do not leak to the client', () => {
    const leaky = new Error('ENOENT /srv/app/.env: secret token abc123');
    expect(() => handleApiError(leaky)).toThrow(/unexpected error occurred/);
    expect(() => handleApiError(leaky)).not.toThrow(/abc123/);
  });

  it('handles non-Error throwables', () => {
    expect(() => handleApiError('a bare string')).toThrow(ToolError);
    expect(() => handleApiError(null)).toThrow(/unexpected error occurred/);
  });
});

describe('validateApiResponse', () => {
  it('accepts non-empty data', () => {
    expect(() => validateApiResponse([{ kanji: {} }], 'query')).not.toThrow();
    expect(() => validateApiResponse({ kanji: {} }, 'query')).not.toThrow();
  });

  it('rejects an empty array', () => {
    expect(() => validateApiResponse([], "kanji '親'")).toThrow(ToolError);
    expect(() => validateApiResponse([], "kanji '親'")).toThrow(/empty response for kanji '親'/);
  });

  it('rejects null and undefined', () => {
    expect(() => validateApiResponse(null, 'q')).toThrow(/null response/);
    expect(() => validateApiResponse(undefined, 'q')).toThrow(/null response/);
  });

  it('accepts an empty object, which is not an empty array', () => {
    expect(() => validateApiResponse({}, 'q')).not.toThrow();
  });
});

describe('toErrorResult', () => {
  it('passes a ToolError message straight through', () => {
    const result = toErrorResult(new ToolError('no kanji here'), 'Basic search');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('no kanji here');
    expect(result.content[0].type).toBe('text');
  });

  it('maps an AxiosError through handleApiError rather than rethrowing', () => {
    const result = toErrorResult(httpError(404), 'Kanji details');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });

  it('sanitizes an unexpected error into a generic message', () => {
    const result = toErrorResult(new Error('internal detail'), 'Advanced search');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unexpected error occurred/);
    expect(result.content[0].text).not.toMatch(/internal detail/);
  });

  it('never throws, whatever it is handed', () => {
    expect(() => toErrorResult('string', 'tool')).not.toThrow();
    expect(() => toErrorResult(undefined, 'tool')).not.toThrow();
    expect(toErrorResult(undefined, 'tool').isError).toBe(true);
  });
});

describe('formatZodError', () => {
  it('joins issues as path: message pairs', () => {
    const error = {
      issues: [
        { path: ['query'], message: 'Search query cannot be empty' },
        { path: ['grade'], message: 'Too big' },
      ],
    };
    expect(formatZodError(error)).toBe('query: Search query cannot be empty; grade: Too big');
  });

  it('joins nested paths with dots', () => {
    const error = { issues: [{ path: ['a', 'b', 0], message: 'nope' }] };
    expect(formatZodError(error)).toBe('a.b.0: nope');
  });

  it('renders an empty path as a bare message', () => {
    const error = { issues: [{ path: [], message: 'At least one parameter' }] };
    expect(formatZodError(error)).toBe(': At least one parameter');
  });

  it('falls back for values that are not Zod errors', () => {
    expect(formatZodError(new Error('plain'))).toBe('Validation error');
    expect(formatZodError(null)).toBe('Validation error');
    expect(formatZodError('string')).toBe('Validation error');
  });
});
