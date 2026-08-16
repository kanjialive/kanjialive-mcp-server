import { describe, it, expect, beforeEach, vi } from 'vitest';
import { httpError, requestInfo, mockSearchResult, mockSearchResultRow } from '../helpers.js';

const searchKanji = vi.fn();
const getKanjiDetail = vi.fn();

vi.mock('../../src/api/client.js', () => ({
  searchKanji: (...args: unknown[]) => searchKanji(...args),
  getKanjiDetail: (...args: unknown[]) => getKanjiDetail(...args),
}));

const { executeBasicSearch } = await import('../../src/mcp/tools/basicSearch.js');
const { executeAdvancedSearch } = await import('../../src/mcp/tools/advancedSearch.js');
const { executeKanjiDetails } = await import('../../src/mcp/tools/kanjiDetails.js');

/** Extract the single text block from a tool result. */
function textOf(result: { content: Array<{ text: string }> }): string {
  return result.content[0].text;
}

beforeEach(() => {
  searchKanji.mockReset();
  getKanjiDetail.mockReset();
});

describe('executeBasicSearch', () => {
  it('formats results as a markdown table', async () => {
    searchKanji.mockResolvedValue([
      [mockSearchResult],
      requestInfo,
    ]);

    const result = await executeBasicSearch({ query: 'water' });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('# Kanji Search Results');
    expect(textOf(result)).toContain(mockSearchResultRow);
    expect(textOf(result)).toContain('query=water');
  });

  it('percent-encodes the query into the endpoint path', async () => {
    searchKanji.mockResolvedValue([[{ kanji: { character: '親' } }], requestInfo]);
    await executeBasicSearch({ query: '親' });
    expect(searchKanji).toHaveBeenCalledWith('search/%E8%A6%AA');
  });

  it('normalizes half-width katakana before querying', async () => {
    searchKanji.mockResolvedValue([[{ kanji: { character: '親' } }], requestInfo]);
    await executeBasicSearch({ query: 'ｼﾝ' });
    expect(searchKanji).toHaveBeenCalledWith(`search/${encodeURIComponent('シン')}`);
  });

  it('returns a plain no-results message rather than an error', async () => {
    searchKanji.mockResolvedValue([[], requestInfo]);
    const result = await executeBasicSearch({ query: 'zzzz' });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('No kanji found matching "zzzz"');
  });

  it('reports validation failures as tool errors without calling the API', async () => {
    const result = await executeBasicSearch({ query: '' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Validation error/);
    expect(textOf(result)).toMatch(/cannot be empty/);
    expect(searchKanji).not.toHaveBeenCalled();
  });

  it('explains a null byte instead of returning a generic error', async () => {
    const result = await executeBasicSearch({ query: 'water\x00' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/null byte/);
    expect(textOf(result)).not.toMatch(/unexpected error/);
    expect(searchKanji).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only query instead of querying the bare endpoint', async () => {
    const result = await executeBasicSearch({ query: '   ' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/cannot be empty/);
    expect(searchKanji).not.toHaveBeenCalled();
  });

  it('maps a 404 from the API to a helpful message', async () => {
    searchKanji.mockRejectedValue(httpError(404));
    const result = await executeBasicSearch({ query: 'water' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/not found/i);
  });

  it('maps a rate limit to a wait-and-retry message', async () => {
    searchKanji.mockRejectedValue(httpError(429));
    const result = await executeBasicSearch({ query: 'water' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Rate limit exceeded/);
  });

  it('never leaks internal error text to the caller', async () => {
    searchKanji.mockRejectedValue(new Error('/srv/app/secret.key not readable'));
    const result = await executeBasicSearch({ query: 'water' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toMatch(/secret\.key/);
  });
});

describe('executeAdvancedSearch', () => {
  it('sends only the parameters that were supplied', async () => {
    searchKanji.mockResolvedValue([[{ kanji: { character: '親' } }], requestInfo]);

    await executeAdvancedSearch({ grade: 2, rpos: 'へん' });

    expect(searchKanji).toHaveBeenCalledWith('search/advanced', { grade: 2, rpos: 'hen' });
    const [, params] = searchKanji.mock.calls[0];
    expect(Object.keys(params as object).sort()).toEqual(['grade', 'rpos']);
  });

  it('strips undefined values so they never become query parameters', async () => {
    searchKanji.mockResolvedValue([[{ kanji: { character: '親' } }], requestInfo]);
    await executeAdvancedSearch({ grade: 2, on: undefined, kun: undefined });
    expect(searchKanji).toHaveBeenCalledWith('search/advanced', { grade: 2 });
  });

  it('rejects an empty filter set without calling the API', async () => {
    const result = await executeAdvancedSearch({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/At least one search parameter/);
    expect(searchKanji).not.toHaveBeenCalled();
  });

  it('echoes the criteria back when nothing matches', async () => {
    searchKanji.mockResolvedValue([[], requestInfo]);
    const result = await executeAdvancedSearch({ grade: 6, ks: 30 });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('No kanji found matching the specified criteria');
    expect(textOf(result)).toContain('grade=6');
    expect(textOf(result)).toContain('ks=30');
  });

  it('surfaces a script-mismatch validation message', async () => {
    const result = await executeAdvancedSearch({ on: 'おや' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Invalid Onyomi reading/);
  });

  it('names the valid study lists when given an unsupported one', async () => {
    const result = await executeAdvancedSearch({ list: 'gen' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Invalid study list 'gen'/);
    expect(textOf(result)).not.toMatch(/unexpected error/);
    expect(searchKanji).not.toHaveBeenCalled();
  });
});

describe('executeKanjiDetails', () => {
  const rawApiResponse = {
    _id: 'internal-id',
    _rev: '3-abc',
    ka_utf: '89aa',
    kanji_search: ['shin', 'oya'],
    kanji: {
      character: '親',
      meaning: { english: 'parent' },
      strokes: { count: 16, timings: [1, 2, 3], images: ['a.png'] },
      onyomi: { katakana: 'シン', romaji: 'shin' },
      kunyomi: { hiragana: 'おや', romaji: 'oya' },
      video: { mp4: 'https://example.com/oya.mp4', poster: 'https://example.com/p.png' },
      mnemonic_hint: 'restricted content',
    },
    radical: { character: '見', strokes: 7, name: { hiragana: 'みる', romaji: 'miru' } },
    references: { grade: 2, kodansha: '1234', classic_nelson: '5678' },
    examples: [
      {
        japanese: '親子',
        meaning: { english: 'parent and child' },
        audio: { mp3: 'https://example.com/a.mp3' },
        textbook_chapter: 'restricted',
      },
    ],
  };

  it('formats the detail response as markdown', async () => {
    getKanjiDetail.mockResolvedValue([rawApiResponse, requestInfo]);

    const result = await executeKanjiDetails({ character: '親' });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('# 親 - Kanji Details');
    expect(textOf(result)).toContain('**Meaning:** parent');
    expect(textOf(result)).toContain('- **Grade:** 2');
  });

  it('collapses the strokes object to the integer count', async () => {
    getKanjiDetail.mockResolvedValue([rawApiResponse, requestInfo]);
    const result = await executeKanjiDetails({ character: '親' });
    expect(textOf(result)).toContain('- **Strokes:** 16');
    expect(textOf(result)).not.toContain('timings');
  });

  it('drops internal database fields and licence-restricted content', async () => {
    getKanjiDetail.mockResolvedValue([rawApiResponse, requestInfo]);
    const text = textOf(await executeKanjiDetails({ character: '親' }));
    for (const leak of ['internal-id', '3-abc', 'kanji_search', 'mnemonic_hint', 'restricted']) {
      expect(text).not.toContain(leak);
    }
  });

  it('rejects a non-kanji character without calling the API', async () => {
    const result = await executeKanjiDetails({ character: 'あ' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/CJK ideograph/);
    expect(getKanjiDetail).not.toHaveBeenCalled();
  });

  it('rejects a multi-character string', async () => {
    const result = await executeKanjiDetails({ character: '親見' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/single kanji/);
  });

  it('reports an empty API response as an error', async () => {
    getKanjiDetail.mockResolvedValue([null, requestInfo]);
    const result = await executeKanjiDetails({ character: '親' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/null response/);
  });

  it('maps a 404 to the corpus-scope explanation', async () => {
    getKanjiDetail.mockRejectedValue(httpError(404));
    const result = await executeKanjiDetails({ character: '親' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/1,235 kanji/);
  });

  it('handles a response with no examples', async () => {
    getKanjiDetail.mockResolvedValue([
      { kanji: { character: '親', meaning: { english: 'parent' }, strokes: 16 } },
      requestInfo,
    ]);
    const result = await executeKanjiDetails({ character: '親' });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).not.toContain('## Example Words');
  });
});
