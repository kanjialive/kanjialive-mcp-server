import { describe, it, expect } from 'vitest';
import {
  extractFieldsFromResults,
  createSearchMetadata,
} from '../../src/formatters/metadata.js';
import type { SearchResponse, RequestInfo } from '../../src/api/types.js';

describe('extractFieldsFromResults', () => {
  it('returns an empty list for no results', () => {
    expect(extractFieldsFromResults([])).toEqual([]);
    expect(extractFieldsFromResults(null as unknown as SearchResponse)).toEqual([]);
  });

  it('collects the union of top-level keys across results', () => {
    const results = [
      { kanji: { character: '水' } },
      { kanji: { character: '湯' }, radical: { character: '⺡' } },
    ] as unknown as SearchResponse;
    expect(extractFieldsFromResults(results)).toEqual(['kanji', 'radical']);
  });

  it('deduplicates keys that appear in every result', () => {
    const results = [
      { kanji: {}, radical: {} },
      { kanji: {}, radical: {} },
    ] as unknown as SearchResponse;
    expect(extractFieldsFromResults(results)).toEqual(['kanji', 'radical']);
  });

  it('sorts the field names for stable output', () => {
    const results = [{ zebra: 1, alpha: 2, mango: 3 }] as unknown as SearchResponse;
    expect(extractFieldsFromResults(results)).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('only reports top-level keys, not nested ones', () => {
    const results = [{ kanji: { character: '水', stroke: 4 } }] as unknown as SearchResponse;
    expect(extractFieldsFromResults(results)).toEqual(['kanji']);
  });
});

describe('createSearchMetadata', () => {
  const requestInfo: RequestInfo = {
    endpoint: 'search/water',
    params: {},
    timestamp: '2026-08-16T18:07:07.373Z',
  };

  it('reports the returned count, fields, timestamp and query parameters', () => {
    const results = [
      { kanji: { character: '水' }, radical: {} },
      { kanji: { character: '湯' }, radical: {} },
    ] as unknown as SearchResponse;

    expect(createSearchMetadata(results, { query: 'water' }, requestInfo)).toEqual({
      results_returned: 2,
      fields_included: ['kanji', 'radical'],
      timestamp: '2026-08-16T18:07:07.373Z',
      query_parameters: { query: 'water' },
    });
  });

  it('takes the timestamp from the request rather than generating a new one', () => {
    const metadata = createSearchMetadata([], {}, requestInfo);
    expect(metadata.timestamp).toBe(requestInfo.timestamp);
  });

  it('handles an empty result set', () => {
    expect(createSearchMetadata([], { grade: 2 }, requestInfo)).toMatchObject({
      results_returned: 0,
      fields_included: [],
      query_parameters: { grade: 2 },
    });
  });
});
