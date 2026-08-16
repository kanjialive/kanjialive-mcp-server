import { describe, it, expect } from 'vitest';
import { BasicSearchInputSchema } from '../../src/validators/basicSearch.js';
import { KanjiDetailInputSchema } from '../../src/validators/kanjiDetail.js';
import { AdvancedSearchInputSchema } from '../../src/validators/advancedSearch.js';

/** Parse and assert success, returning the validated data. */
function expectValid<T>(result: { success: boolean; data?: T; error?: unknown }): T {
  expect(result.success).toBe(true);
  return result.data as T;
}

/** Parse and assert failure, returning the joined issue messages. */
function expectInvalid(result: {
  success: boolean;
  error?: { issues: Array<{ message: string; path: unknown[] }> };
}): string {
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((i) => i.message).join(' | ');
}

describe('BasicSearchInputSchema', () => {
  it('accepts a kanji, a reading and an English meaning', () => {
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: '親' })).query).toBe('親');
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: 'シン' })).query).toBe('シン');
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: 'parent' })).query).toBe('parent');
  });

  it('NFKC-normalizes half-width katakana', () => {
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: 'ｼﾝ' })).query).toBe('シン');
  });

  it('trims surrounding whitespace', () => {
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: '  parent  ' })).query).toBe(
      'parent'
    );
  });

  it('rejects an empty query', () => {
    expect(expectInvalid(BasicSearchInputSchema.safeParse({ query: '' }))).toMatch(
      /cannot be empty/
    );
  });

  it('rejects a query longer than 100 characters', () => {
    expect(expectInvalid(BasicSearchInputSchema.safeParse({ query: 'a'.repeat(101) }))).toMatch(
      /100 characters or less/
    );
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: 'a'.repeat(100) })).query).toHaveLength(
      100
    );
  });

  it('rejects a non-string query', () => {
    expect(expectInvalid(BasicSearchInputSchema.safeParse({ query: 123 }))).toMatch(
      /must be a string/
    );
    expect(expectInvalid(BasicSearchInputSchema.safeParse({}))).toMatch(/must be a string/);
  });
});

describe('KanjiDetailInputSchema', () => {
  it('accepts a single CJK ideograph', () => {
    expect(expectValid(KanjiDetailInputSchema.safeParse({ character: '親' })).character).toBe('親');
  });

  it('rejects kana and latin characters', () => {
    expect(expectInvalid(KanjiDetailInputSchema.safeParse({ character: 'あ' }))).toMatch(
      /CJK ideograph/
    );
    expect(expectInvalid(KanjiDetailInputSchema.safeParse({ character: 'ア' }))).toMatch(
      /CJK ideograph/
    );
    expect(expectInvalid(KanjiDetailInputSchema.safeParse({ character: 'a' }))).toMatch(
      /CJK ideograph/
    );
  });

  it('rejects multi-character and empty input', () => {
    expect(expectInvalid(KanjiDetailInputSchema.safeParse({ character: '親見' }))).toMatch(
      /single kanji/
    );
    expect(expectInvalid(KanjiDetailInputSchema.safeParse({ character: '' }))).toMatch(
      /single kanji/
    );
  });
});

describe('AdvancedSearchInputSchema', () => {
  it('requires at least one parameter', () => {
    expect(expectInvalid(AdvancedSearchInputSchema.safeParse({}))).toMatch(
      /At least one search parameter/
    );
  });

  describe('onyomi (on)', () => {
    it('accepts katakana and romaji', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ on: 'シン' })).on).toBe('シン');
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ on: 'shin' })).on).toBe('shin');
    });

    it('lowercases romaji but leaves katakana alone', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ on: 'SHIN' })).on).toBe('shin');
    });

    it('rejects hiragana, which belongs to kunyomi', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ on: 'おや' }))).toMatch(
        /Invalid Onyomi reading/
      );
    });

    it('rejects mixed scripts', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ on: 'シンshin' }))).toMatch(
        /Invalid Onyomi reading/
      );
    });
  });

  describe('kunyomi (kun) and radical name (rjn)', () => {
    it('accepts hiragana and romaji', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ kun: 'おや' })).kun).toBe('おや');
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ kun: 'oya' })).kun).toBe('oya');
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ rjn: 'みる' })).rjn).toBe('みる');
    });

    it('accepts romaji with okurigana dots', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ kun: 'mi.ru' })).kun).toBe('mi.ru');
    });

    it('rejects katakana, which belongs to onyomi', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ kun: 'シン' }))).toMatch(
        /Invalid reading/
      );
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ rjn: 'シン' }))).toMatch(
        /Invalid reading/
      );
    });
  });

  describe('kanji', () => {
    it('accepts a CJK ideograph', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ kanji: '親' })).kanji).toBe('親');
    });

    it('rejects kana and romaji', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ kanji: 'あ' }))).toMatch(
        /CJK ideograph/
      );
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ kanji: 'a' }))).toMatch(
        /CJK ideograph/
      );
    });

    it('rejects more than one character', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ kanji: '親見' }))).toBeTruthy();
    });
  });

  describe('radical position (rpos)', () => {
    it('normalizes hiragana positions to romaji for the API', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ rpos: 'へん' })).rpos).toBe('hen');
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ rpos: 'にょう' })).rpos).toBe('nyou');
    });

    it('accepts romaji positions and lowercases them', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ rpos: 'HEN' })).rpos).toBe('hen');
    });

    it('rejects unknown positions', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ rpos: 'middle' }))).toMatch(
        /Invalid radical position/
      );
    });
  });

  describe('study list', () => {
    it('accepts base and chapter-qualified lists', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ list: 'ap' })).list).toBe('ap');
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ list: 'ap:c3' })).list).toBe('ap:c3');
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ list: 'mac:c12' })).list).toBe(
        'mac:c12'
      );
    });

    it('treats an empty string as absent', () => {
      // list is the only field supplied, so dropping it trips the
      // at-least-one-parameter refinement rather than reaching the API.
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ list: '' }))).toMatch(
        /At least one search parameter/
      );
    });
  });

  describe('numeric ranges', () => {
    it('bounds kanji strokes to 1-30', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ ks: 1 })).ks).toBe(1);
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ ks: 30 })).ks).toBe(30);
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ ks: 0 }))).toBeTruthy();
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ ks: 31 }))).toBeTruthy();
    });

    it('bounds radical strokes to 1-17', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ rs: 17 })).rs).toBe(17);
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ rs: 18 }))).toBeTruthy();
    });

    it('bounds grade to 1-6', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ grade: 6 })).grade).toBe(6);
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ grade: 7 }))).toBeTruthy();
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ grade: 0 }))).toBeTruthy();
    });

    it('rejects non-integer numbers', () => {
      expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ ks: 4.5 }))).toBeTruthy();
    });
  });

  describe('free-text meanings', () => {
    it('trims kem and rem without altering case', () => {
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ kem: '  Parent ' })).kem).toBe(
        'Parent'
      );
      expect(expectValid(AdvancedSearchInputSchema.safeParse({ rem: ' water ' })).rem).toBe('water');
    });
  });

  it('accepts a combination of filters', () => {
    const data = expectValid(
      AdvancedSearchInputSchema.safeParse({ grade: 2, rpos: 'へん', on: 'SHIN', ks: 10 })
    );
    expect(data).toMatchObject({ grade: 2, rpos: 'hen', on: 'shin', ks: 10 });
  });
});

/**
 * Validators that report failure by throwing must still surface as ordinary
 * validation issues; safeParse does not trap exceptions raised in a transform.
 */
describe('throwing validators surface as issues, not exceptions', () => {
  it('reports a null byte in the query as a validation failure', () => {
    expect(() => BasicSearchInputSchema.safeParse({ query: 'a\x00b' })).not.toThrow();
    expect(expectInvalid(BasicSearchInputSchema.safeParse({ query: 'a\x00b' }))).toMatch(
      /null byte/
    );
  });

  it('reports a control character in the query, naming the position', () => {
    const message = expectInvalid(BasicSearchInputSchema.safeParse({ query: 'ab\x01' }));
    expect(message).toMatch(/control character/);
    expect(message).toMatch(/U\+0001/);
  });

  it('reports a control character in a kanji detail lookup', () => {
    expect(() => KanjiDetailInputSchema.safeParse({ character: '\x01' })).not.toThrow();
    expect(expectInvalid(KanjiDetailInputSchema.safeParse({ character: '\x01' }))).toMatch(
      /control character/
    );
  });

  it('reports an invalid study list with the list of valid values', () => {
    expect(() => AdvancedSearchInputSchema.safeParse({ list: 'gen' })).not.toThrow();
    const message = expectInvalid(AdvancedSearchInputSchema.safeParse({ list: 'gen' }));
    expect(message).toMatch(/Invalid study list 'gen'/);
    expect(message).toMatch(/'ap'/);
    expect(message).toMatch(/'mac'/);
  });

  it('reports a malformed study list chapter', () => {
    expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ list: 'ap:3' }))).toMatch(
      /Invalid chapter format/
    );
  });

  it('reports control characters in advanced search readings', () => {
    expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ on: 'shin\x01' }))).toMatch(
      /control character/
    );
    expect(expectInvalid(AdvancedSearchInputSchema.safeParse({ kun: 'oya\x00' }))).toMatch(
      /null byte/
    );
  });

  it('attaches the issue to the offending field', () => {
    const result = BasicSearchInputSchema.safeParse({ query: 'a\x00b' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['query']);
  });
});

describe('whitespace-only input', () => {
  it('rejects a whitespace-only query rather than reducing it to empty', () => {
    // trim() must precede min(1); otherwise "   " passes the length check and
    // is then emptied, producing a request to the bare `search/` endpoint.
    expect(expectInvalid(BasicSearchInputSchema.safeParse({ query: '   ' }))).toMatch(
      /cannot be empty/
    );
    expect(expectInvalid(BasicSearchInputSchema.safeParse({ query: '\t\n ' }))).toMatch(
      /cannot be empty/
    );
  });

  it('still accepts a padded but non-empty query', () => {
    expect(expectValid(BasicSearchInputSchema.safeParse({ query: '  water  ' })).query).toBe(
      'water'
    );
  });
});
