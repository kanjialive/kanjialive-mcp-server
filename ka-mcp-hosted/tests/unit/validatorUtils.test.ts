import { describe, it, expect } from 'vitest';
import {
  isKanjiCharacter,
  isKatakana,
  isHiragana,
  isRomaji,
  isRomajiWithDots,
  normalizeRadicalPosition,
  validateStudyList,
  VALID_RADICAL_POSITIONS,
  VALID_STUDY_LISTS,
} from '../../src/validators/utils.js';

describe('isKanjiCharacter', () => {
  it('accepts common CJK ideographs', () => {
    for (const ch of ['親', '見', '日', '水', '湯']) {
      expect(isKanjiCharacter(ch)).toBe(true);
    }
  });

  it('accepts both ends of the CJK Unified Ideographs block', () => {
    expect(isKanjiCharacter(String.fromCodePoint(0x4e00))).toBe(true);
    expect(isKanjiCharacter(String.fromCodePoint(0x9fff))).toBe(true);
  });

  it('accepts both ends of Extension A', () => {
    expect(isKanjiCharacter(String.fromCodePoint(0x3400))).toBe(true);
    expect(isKanjiCharacter(String.fromCodePoint(0x4dbf))).toBe(true);
  });

  it('rejects code points just outside each supported block', () => {
    expect(isKanjiCharacter(String.fromCodePoint(0x33ff))).toBe(false);
    expect(isKanjiCharacter(String.fromCodePoint(0x4dc0))).toBe(false);
    expect(isKanjiCharacter(String.fromCodePoint(0x4dff))).toBe(false);
    expect(isKanjiCharacter(String.fromCodePoint(0xa000))).toBe(false);
  });

  it('rejects kana, romaji and punctuation', () => {
    expect(isKanjiCharacter('あ')).toBe(false);
    expect(isKanjiCharacter('ア')).toBe(false);
    expect(isKanjiCharacter('a')).toBe(false);
    expect(isKanjiCharacter('1')).toBe(false);
    expect(isKanjiCharacter('・')).toBe(false);
  });

  it('rejects the Kangxi radical block, which is not a CJK ideograph', () => {
    // U+2F00 KANGXI RADICAL ONE looks like 一 but is a separate code point.
    expect(isKanjiCharacter(String.fromCodePoint(0x2f00))).toBe(false);
  });

  it('rejects strings that are not exactly one UTF-16 code unit', () => {
    expect(isKanjiCharacter('')).toBe(false);
    expect(isKanjiCharacter('親見')).toBe(false);
    // Extension B lives above the BMP, so it is a 2-unit surrogate pair.
    expect(isKanjiCharacter(String.fromCodePoint(0x20000))).toBe(false);
  });
});

describe('script detection', () => {
  it('identifies pure katakana', () => {
    expect(isKatakana('シン')).toBe(true);
    expect(isKatakana('カタカナ')).toBe(true);
    expect(isKatakana('シン・ケン')).toBe(true);
  });

  it('rejects hiragana and romaji as katakana', () => {
    expect(isKatakana('おや')).toBe(false);
    expect(isKatakana('shin')).toBe(false);
    expect(isKatakana('シンoya')).toBe(false);
    expect(isKatakana('')).toBe(false);
  });

  it('identifies pure hiragana', () => {
    expect(isHiragana('おや')).toBe(true);
    expect(isHiragana('みる')).toBe(true);
    expect(isHiragana('おや.る')).toBe(true);
  });

  it('rejects katakana and romaji as hiragana', () => {
    expect(isHiragana('シン')).toBe(false);
    expect(isHiragana('oya')).toBe(false);
    expect(isHiragana('おやoya')).toBe(false);
    expect(isHiragana('')).toBe(false);
  });

  it('identifies romaji, allowing hyphens for compounds', () => {
    expect(isRomaji('shin')).toBe(true);
    expect(isRomaji('SHIN')).toBe(true);
    expect(isRomaji('oya-ko')).toBe(true);
  });

  it('rejects dots, digits and kana as plain romaji', () => {
    expect(isRomaji('oya.ko')).toBe(false);
    expect(isRomaji('shin1')).toBe(false);
    expect(isRomaji('シン')).toBe(false);
    expect(isRomaji('')).toBe(false);
  });

  it('allows dots in the okurigana-aware romaji variant', () => {
    expect(isRomajiWithDots('oya.ko')).toBe(true);
    expect(isRomajiWithDots('mi.ru')).toBe(true);
    expect(isRomajiWithDots('oya')).toBe(true);
    expect(isRomajiWithDots('oya1')).toBe(false);
  });
});

describe('normalizeRadicalPosition', () => {
  it('maps every hiragana position to its romaji form', () => {
    expect(normalizeRadicalPosition('へん')).toBe('hen');
    expect(normalizeRadicalPosition('つくり')).toBe('tsukuri');
    expect(normalizeRadicalPosition('かんむり')).toBe('kanmuri');
    expect(normalizeRadicalPosition('あし')).toBe('ashi');
    expect(normalizeRadicalPosition('かまえ')).toBe('kamae');
    expect(normalizeRadicalPosition('たれ')).toBe('tare');
    expect(normalizeRadicalPosition('にょう')).toBe('nyou');
  });

  it('passes romaji through and lowercases it', () => {
    expect(normalizeRadicalPosition('hen')).toBe('hen');
    expect(normalizeRadicalPosition('HEN')).toBe('hen');
    expect(normalizeRadicalPosition('  Tsukuri  ')).toBe('tsukuri');
  });

  it('returns unknown values unchanged rather than throwing', () => {
    expect(normalizeRadicalPosition('bogus')).toBe('bogus');
  });

  it('covers every declared valid position', () => {
    expect(VALID_RADICAL_POSITIONS.size).toBe(14);
    for (const position of VALID_RADICAL_POSITIONS) {
      expect(normalizeRadicalPosition(position)).toBeTruthy();
    }
  });
});

describe('validateStudyList', () => {
  it('accepts the two supported base lists', () => {
    expect(validateStudyList('ap')).toBe('ap');
    expect(validateStudyList('mac')).toBe('mac');
    expect(VALID_STUDY_LISTS).toEqual(['ap', 'mac']);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(validateStudyList('  AP  ')).toBe('ap');
    expect(validateStudyList('MAC:C12')).toBe('mac:c12');
  });

  it('accepts chapter-qualified lists', () => {
    expect(validateStudyList('ap:c3')).toBe('ap:c3');
    expect(validateStudyList('mac:c12')).toBe('mac:c12');
    expect(validateStudyList('ap:c1')).toBe('ap:c1');
  });

  it('rejects unsupported base lists', () => {
    expect(() => validateStudyList('gen')).toThrow(/Invalid study list/);
    expect(() => validateStudyList('text:gen:c3')).toThrow(/Invalid study list format/);
  });

  it('rejects malformed chapters', () => {
    expect(() => validateStudyList('ap:3')).toThrow(/Invalid chapter format/);
    expect(() => validateStudyList('ap:chapter3')).toThrow(/Invalid chapter format/);
    expect(() => validateStudyList('ap:c')).toThrow(/Invalid chapter format/);
    expect(() => validateStudyList('ap:')).toThrow(/Invalid chapter format/);
  });

  it('rejects an unknown base list even when the chapter is well formed', () => {
    expect(() => validateStudyList('xyz:c3')).toThrow(/Invalid study list 'xyz'/);
  });

  it('reports the original input in the format error, not the normalized one', () => {
    expect(() => validateStudyList('a:b:c')).toThrow(/Invalid study list format 'a:b:c'/);
  });
});
