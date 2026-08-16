import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Stub Axios instance shared by the mocked `axios.create()`.
 * Tests set `mockGet` to control what the "API" returns.
 */
const mockGet = vi.fn();

const mockInstance = {
  get: mockGet,
  defaults: { headers: {} },
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
};

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: { ...actual.default, create: vi.fn(() => mockInstance) },
  };
});

vi.mock('axios-retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios-retry')>();
  return { ...actual, default: vi.fn() };
});

const { getApiHeaders, searchKanji, getKanjiDetail, resetClient } = await import(
  '../../src/api/client.js'
);
const { RAPIDAPI_HOST, USER_AGENT } = await import('../../src/api/constants.js');

const ORIGINAL_KEY = process.env.RAPIDAPI_KEY;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  mockGet.mockReset();
  resetClient();
  process.env.RAPIDAPI_KEY = 'test-key';
});

afterEach(() => {
  process.env.RAPIDAPI_KEY = ORIGINAL_KEY;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  resetClient();
});

describe('getApiHeaders', () => {
  it('builds the RapidAPI headers from the environment', () => {
    process.env.RAPIDAPI_KEY = 'abc123';
    expect(getApiHeaders()).toEqual({
      'X-RapidAPI-Key': 'abc123',
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    });
  });

  it('rejects a missing key with a link to obtain one', () => {
    delete process.env.RAPIDAPI_KEY;
    expect(() => getApiHeaders()).toThrow(/RAPIDAPI_KEY environment variable must be set/);
    expect(() => getApiHeaders()).toThrow(/rapidapi\.com/);
  });

  it('rejects an empty key', () => {
    process.env.RAPIDAPI_KEY = '';
    expect(() => getApiHeaders()).toThrow(/RAPIDAPI_KEY/);
  });

  it('rejects the placeholder value copied from .env.example', () => {
    process.env.RAPIDAPI_KEY = 'YOUR_RAPIDAPI_KEY_HERE';
    expect(() => getApiHeaders()).toThrow(/RAPIDAPI_KEY/);
  });
});

describe('searchKanji', () => {
  it('returns the results alongside request metadata', async () => {
    const data = [{ kanji: { character: '水' } }];
    mockGet.mockResolvedValue({ data, config: { url: 'search/water' }, status: 200 });

    const [results, requestInfo] = await searchKanji('search/water');

    expect(results).toEqual(data);
    expect(requestInfo.endpoint).toBe('search/water');
    expect(requestInfo.params).toEqual({});
    expect(new Date(requestInfo.timestamp).toISOString()).toBe(requestInfo.timestamp);
  });

  it('forwards query parameters to the client and echoes them back', async () => {
    mockGet.mockResolvedValue({ data: [], config: {}, status: 200 });
    const params = { grade: 2, rpos: 'hen' };

    const [, requestInfo] = await searchKanji('search/advanced', params);

    expect(mockGet).toHaveBeenCalledWith('search/advanced', { params });
    expect(requestInfo.params).toEqual(params);
  });

  it('accepts an empty result array', async () => {
    mockGet.mockResolvedValue({ data: [], config: {}, status: 200 });
    const [results] = await searchKanji('search/none');
    expect(results).toEqual([]);
  });

  it('rejects a non-array search response', async () => {
    mockGet.mockResolvedValue({ data: { kanji: {} }, config: {}, status: 200 });
    await expect(searchKanji('search/water')).rejects.toThrow(/unexpected format/);
  });

  it('rejects a result element that is not an object', async () => {
    mockGet.mockResolvedValue({ data: ['not-an-object'], config: {}, status: 200 });
    await expect(searchKanji('search/water')).rejects.toThrow(/not a dictionary/);
  });

  it('rejects a null result element', async () => {
    mockGet.mockResolvedValue({ data: [null], config: {}, status: 200 });
    await expect(searchKanji('search/water')).rejects.toThrow(/not a dictionary/);
  });

  it('tolerates a result missing the kanji field, logging rather than failing', async () => {
    mockGet.mockResolvedValue({ data: [{ radical: {} }], config: {}, status: 200 });
    const [results] = await searchKanji('search/water');
    expect(results).toEqual([{ radical: {} }]);
  });

  it('withholds response-shape detail in production', async () => {
    process.env.NODE_ENV = 'production';
    mockGet.mockResolvedValue({ data: { kanji: {} }, config: {}, status: 200 });
    await expect(searchKanji('search/water')).rejects.toThrow('Invalid API response format');
  });

  it('propagates transport errors to the caller', async () => {
    mockGet.mockRejectedValue(new Error('socket hang up'));
    await expect(searchKanji('search/water')).rejects.toThrow('socket hang up');
  });
});

describe('getKanjiDetail', () => {
  it('requests the kanji endpoint and returns metadata', async () => {
    mockGet.mockResolvedValue({ data: { kanji: { character: '親' } }, config: {}, status: 200 });

    const [detail, requestInfo] = await getKanjiDetail('親');

    expect(detail).toEqual({ kanji: { character: '親' } });
    expect(requestInfo.endpoint).toBe(`kanji/${encodeURIComponent('親')}`);
  });

  it('percent-encodes the character so the URL stays valid', async () => {
    mockGet.mockResolvedValue({ data: { kanji: {} }, config: {}, status: 200 });
    await getKanjiDetail('親');
    expect(mockGet).toHaveBeenCalledWith('kanji/%E8%A6%AA');
  });

  it('rejects an array response, which is the search shape not the detail shape', async () => {
    mockGet.mockResolvedValue({ data: [], config: {}, status: 200 });
    await expect(getKanjiDetail('親')).rejects.toThrow(/unexpected format/);
  });

  it('rejects a null or scalar response', async () => {
    mockGet.mockResolvedValue({ data: null, config: {}, status: 200 });
    await expect(getKanjiDetail('親')).rejects.toThrow(/unexpected format/);

    mockGet.mockResolvedValue({ data: 'text', config: {}, status: 200 });
    await expect(getKanjiDetail('親')).rejects.toThrow(/unexpected format/);
  });

  it('tolerates a detail response missing the kanji field', async () => {
    mockGet.mockResolvedValue({ data: { radical: {} }, config: {}, status: 200 });
    const [detail] = await getKanjiDetail('親');
    expect(detail).toEqual({ radical: {} });
  });

  it('withholds response-shape detail in production', async () => {
    process.env.NODE_ENV = 'production';
    mockGet.mockResolvedValue({ data: [], config: {}, status: 200 });
    await expect(getKanjiDetail('親')).rejects.toThrow('Invalid API response format');
  });
});
