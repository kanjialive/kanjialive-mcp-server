import { describe, it, expect } from 'vitest';
import { normalizeJapaneseText, validateNoControlChars } from '../../src/utils/unicode.js';

describe('normalizeJapaneseText', () => {
  it('converts half-width katakana to full-width', () => {
    expect(normalizeJapaneseText('ｼﾝ')).toBe('シン');
    expect(normalizeJapaneseText('ｶﾀｶﾅ')).toBe('カタカナ');
  });

  it('composes decomposed voiced katakana into a single code point', () => {
    // Built from code points so the assertion cannot be defeated by the
    // encoding this source file happens to be saved in.
    const KA = String.fromCharCode(0x30ab);
    const COMBINING_DAKUTEN = String.fromCharCode(0x3099);
    const GA = String.fromCharCode(0x30ac);

    const decomposed = KA + COMBINING_DAKUTEN;
    expect(decomposed).toHaveLength(2);

    const normalized = normalizeJapaneseText(decomposed);
    expect(normalized).toBe(GA);
    expect(normalized).toHaveLength(1);
  });

  it('converts full-width latin and digits to ASCII', () => {
    expect(normalizeJapaneseText('ｓｈｉｎ')).toBe('shin');
    expect(normalizeJapaneseText('１２３')).toBe('123');
  });

  it('leaves already-normalized text untouched', () => {
    expect(normalizeJapaneseText('親')).toBe('親');
    expect(normalizeJapaneseText('parent')).toBe('parent');
    expect(normalizeJapaneseText('おや')).toBe('おや');
  });

  it('is idempotent', () => {
    const once = normalizeJapaneseText('ｼﾝ');
    expect(normalizeJapaneseText(once)).toBe(once);
  });

  it('handles the empty string', () => {
    expect(normalizeJapaneseText('')).toBe('');
  });

  it('coerces non-string input rather than throwing', () => {
    expect(normalizeJapaneseText(123 as unknown as string)).toBe('123');
    expect(normalizeJapaneseText(null as unknown as string)).toBe('null');
  });
});

describe('validateNoControlChars', () => {
  it('returns the input unchanged when it is clean', () => {
    expect(validateNoControlChars('親')).toBe('親');
    expect(validateNoControlChars('parent')).toBe('parent');
  });

  it('allows tab, newline and carriage return', () => {
    expect(validateNoControlChars('a\tb')).toBe('a\tb');
    expect(validateNoControlChars('a\nb')).toBe('a\nb');
    expect(validateNoControlChars('a\rb')).toBe('a\rb');
  });

  it('rejects null bytes with a dedicated message', () => {
    expect(() => validateNoControlChars('a\x00b', 'query')).toThrow(/null byte/);
    expect(() => validateNoControlChars('a\x00b', 'query')).toThrow(/Invalid query/);
  });

  it('rejects C0 control characters and reports position', () => {
    expect(() => validateNoControlChars('ab\x01', 'query')).toThrow(/U\+0001/);
    expect(() => validateNoControlChars('ab\x01', 'query')).toThrow(/at position 2/);
  });

  it('rejects C1 control characters including DEL', () => {
    expect(() => validateNoControlChars('a\x7Fb')).toThrow(/U\+007F/);
    expect(() => validateNoControlChars('a\x9Fb')).toThrow(/U\+009F/);
  });

  it('rejects the escape character used in ANSI sequences', () => {
    expect(() => validateNoControlChars('\x1b[31mred')).toThrow(/U\+001B/);
  });

  it('uses the supplied field name in error messages', () => {
    expect(() => validateNoControlChars('\x01', 'character')).toThrow(/Invalid character/);
  });

  it('defaults the field name to "input"', () => {
    expect(() => validateNoControlChars('\x01')).toThrow(/Invalid input/);
  });

  it('accepts an empty string', () => {
    expect(validateNoControlChars('')).toBe('');
  });
});
