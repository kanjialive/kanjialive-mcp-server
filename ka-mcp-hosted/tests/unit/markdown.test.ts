import { describe, it, expect } from 'vitest';
import {
  escapeMarkdown,
  formatSearchResultsMarkdown,
  formatKanjiDetailMarkdown,
} from '../../src/formatters/markdown.js';
import type { SearchResponse, KanjiDetail } from '../../src/api/types.js';
import type { SearchResultMetadata } from '../../src/formatters/metadata.js';

describe('escapeMarkdown', () => {
  it('escapes every character that could break table or emphasis rendering', () => {
    for (const ch of ['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '>']) {
      expect(escapeMarkdown(ch)).toBe(`\\${ch}`);
    }
  });

  it('escapes a pipe so it cannot inject a table column', () => {
    expect(escapeMarkdown('a|b')).toBe('a\\|b');
  });

  it('leaves ordinary text and Japanese characters untouched', () => {
    expect(escapeMarkdown('parent')).toBe('parent');
    expect(escapeMarkdown('親')).toBe('親');
    expect(escapeMarkdown('')).toBe('');
  });

  it('escapes each occurrence, not just the first', () => {
    expect(escapeMarkdown('a*b*c')).toBe('a\\*b\\*c');
  });

  it('coerces non-string input', () => {
    expect(escapeMarkdown(42 as unknown as string)).toBe('42');
    expect(escapeMarkdown(null as unknown as string)).toBe('null');
  });
});

describe('formatSearchResultsMarkdown', () => {
  const results: SearchResponse = [
    { kanji: { character: '水', stroke: 4 }, radical: { character: '⽔', stroke: 4, order: 109 } },
    { kanji: { character: '湯', stroke: 12 }, radical: { character: '⺡', stroke: 3, order: 76 } },
  ];

  it('reports the no-match case in plain language', () => {
    expect(formatSearchResultsMarkdown([])).toBe('No kanji found matching your search criteria.');
    expect(formatSearchResultsMarkdown(null as unknown as SearchResponse)).toBe(
      'No kanji found matching your search criteria.'
    );
  });

  it('renders a table row per result', () => {
    const out = formatSearchResultsMarkdown(results);
    expect(out).toContain('# Kanji Search Results');
    expect(out).toContain('| 水 | 4 | ⽔ | 4 | 109 |');
    expect(out).toContain('| 湯 | 12 | ⺡ | 3 | 76 |');
    expect(out).toContain('**Total Results Shown:** 2');
  });

  it('falls back to a result count when no metadata is supplied', () => {
    const out = formatSearchResultsMarkdown(results);
    expect(out).toContain('## Result Information');
    expect(out).toContain('- **Results Found:** 2');
    expect(out).not.toContain('## Search Information');
  });

  it('renders the metadata header when metadata is supplied', () => {
    const metadata: SearchResultMetadata = {
      results_returned: 2,
      fields_included: ['kanji', 'radical'],
      timestamp: '2026-08-16T18:07:07.373Z',
      query_parameters: { query: 'water' },
    };
    const out = formatSearchResultsMarkdown(results, metadata);
    expect(out).toContain('## Search Information');
    expect(out).toContain('- **Results Returned:** 2');
    expect(out).toContain('- **Fields Included:** kanji, radical');
    expect(out).toContain('- **Query Parameters:** query=water');
    expect(out).toContain('- **Generated:** 2026-08-16T18:07:07.373Z');
    expect(out).not.toContain('## Result Information');
  });

  it('joins multiple query parameters with commas', () => {
    const metadata: SearchResultMetadata = {
      results_returned: 1,
      fields_included: ['kanji'],
      timestamp: 't',
      query_parameters: { grade: 2, rpos: 'hen' },
    };
    expect(formatSearchResultsMarkdown(results, metadata)).toContain(
      '- **Query Parameters:** grade=2, rpos=hen'
    );
  });

  it('substitutes placeholders for missing fields instead of printing undefined', () => {
    const sparse = [{ kanji: { character: '水' } }] as unknown as SearchResponse;
    const out = formatSearchResultsMarkdown(sparse);
    expect(out).toContain('| 水 | N/A | N/A | N/A | N/A |');
    expect(out).not.toContain('undefined');
  });

  it('uses ? when the character itself is missing', () => {
    const broken = [{}] as unknown as SearchResponse;
    expect(formatSearchResultsMarkdown(broken)).toContain('| ? |');
  });
});

describe('formatKanjiDetailMarkdown', () => {
  const full: KanjiDetail = {
    kanji: {
      character: '親',
      strokes: 16,
      meaning: { english: 'parent' },
      onyomi: { katakana: 'シン', romaji: 'shin' },
      kunyomi: { hiragana: 'おや、した.しい', romaji: 'oya, shita.shii' },
      video: { mp4: 'https://example.com/oya.mp4' },
    },
    radical: {
      character: '見',
      strokes: 7,
      name: { hiragana: 'みる', romaji: 'miru' },
      meaning: { english: 'see' },
      position: { hiragana: 'つくり', romaji: 'tsukuri' },
    },
    references: { grade: 2, kodansha: '1234', classic_nelson: '5678' },
    examples: [
      {
        japanese: '親子',
        meaning: { english: 'parent and child' },
        audio: { mp3: 'https://example.com/oyako.mp3' },
      },
    ],
  };

  it('renders the heading, meaning and basic information', () => {
    const out = formatKanjiDetailMarkdown(full);
    expect(out).toContain('# 親 - Kanji Details');
    expect(out).toContain('**Meaning:** parent');
    expect(out).toContain('- **Strokes:** 16');
    expect(out).toContain('- **Grade:** 2');
  });

  it('wraps media URLs in angle brackets so markdown does not mangle them', () => {
    const out = formatKanjiDetailMarkdown(full);
    expect(out).toContain('- **Stroke Order Video:** <https://example.com/oya.mp4>');
    expect(out).toContain('**Audio:** <https://example.com/oyako.mp3>');
  });

  it('pairs each onyomi reading with its romaji', () => {
    const out = formatKanjiDetailMarkdown(full);
    expect(out).toContain('**Onyomi (音読み):**');
    expect(out).toContain('- シン (shin)');
  });

  it('splits kunyomi on the Japanese comma and pairs with romaji', () => {
    const out = formatKanjiDetailMarkdown(full);
    expect(out).toContain('**Kunyomi (訓読み):**');
    expect(out).toContain('- おや (oya)');
    expect(out).toContain('- した.しい (shita.shii)');
  });

  it('renders readings without romaji when the romaji list is shorter', () => {
    const out = formatKanjiDetailMarkdown({
      ...full,
      kanji: { ...full.kanji, onyomi: { katakana: 'シン, ケン', romaji: 'shin' } },
    });
    expect(out).toContain('- シン (shin)');
    expect(out).toContain('- ケン\n');
    expect(out).not.toContain('ケン (');
  });

  it('renders the radical block', () => {
    const out = formatKanjiDetailMarkdown(full);
    expect(out).toContain('## Radical');
    expect(out).toContain('- **Character:** 見');
    expect(out).toContain('- **Meaning:** see');
    expect(out).toContain('- **Name:** みる (miru)');
    expect(out).toContain('- **Strokes:** 7');
    expect(out).toContain('- **Position:** つくり');
  });

  it('renders dictionary references and examples', () => {
    const out = formatKanjiDetailMarkdown(full);
    expect(out).toContain('## Dictionary References');
    expect(out).toContain('- **Kodansha:** 1234');
    expect(out).toContain('- **Classic Nelson:** 5678');
    expect(out).toContain('## Example Words');
    expect(out).toContain('### 親子');
    expect(out).toContain('**Meaning:** parent and child');
  });

  it('escapes markdown metacharacters in API-supplied meanings', () => {
    const out = formatKanjiDetailMarkdown({
      ...full,
      kanji: { ...full.kanji, meaning: { english: 'parent (guardian) *important*' } },
    });
    expect(out).toContain('\\(guardian\\)');
    expect(out).toContain('\\*important\\*');
  });

  it('states when a kanji is not taught in elementary school', () => {
    const out = formatKanjiDetailMarkdown({ ...full, references: {} });
    expect(out).toContain('- **Grade:** Not taught in elementary school');
  });

  it('omits optional sections that the API did not return', () => {
    const minimal = {
      kanji: { character: '親', strokes: 16, meaning: { english: 'parent' } },
    } as KanjiDetail;
    const out = formatKanjiDetailMarkdown(minimal);
    expect(out).toContain('# 親 - Kanji Details');
    expect(out).not.toContain('## Radical');
    expect(out).not.toContain('## Dictionary References');
    expect(out).not.toContain('## Example Words');
    expect(out).not.toContain('Stroke Order Video');
    expect(out).not.toContain('undefined');
  });

  it('omits the position line when the radical has no position', () => {
    const out = formatKanjiDetailMarkdown({
      ...full,
      radical: { ...full.radical, position: undefined },
    });
    expect(out).toContain('## Radical');
    expect(out).not.toContain('- **Position:**');
  });

  it('survives an entirely empty object without throwing', () => {
    const out = formatKanjiDetailMarkdown({} as KanjiDetail);
    expect(out).toContain('# ? - Kanji Details');
    expect(out).toContain('**Meaning:** N/A');
    expect(out).toContain('- **Strokes:** N/A');
  });

  it('skips the examples section when the array is empty', () => {
    const out = formatKanjiDetailMarkdown({ ...full, examples: [] });
    expect(out).not.toContain('## Example Words');
  });
});
