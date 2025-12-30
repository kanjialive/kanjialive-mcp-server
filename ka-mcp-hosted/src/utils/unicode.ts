/**
 * Unicode normalization utilities for Japanese text processing.
 *
 * This module handles NFKC normalization to ensure consistent representation
 * of characters that can be encoded in multiple ways (e.g., half-width vs
 * full-width katakana, composed vs decomposed characters).
 */

/**
 * Normalize Japanese text to NFKC form.
 *
 * NFKC (Compatibility Composition) normalization:
 * - Converts half-width katakana to full-width (e.g., ｼﾝ → シン)
 * - Decomposes then recomposes characters
 * - Replaces compatibility characters with canonical equivalents
 *
 * @param text - Japanese text to normalize
 * @returns Normalized text in NFKC form
 */
export function normalizeJapaneseText(text: string): string {
  if (typeof text !== 'string') {
    return String(text);
  }
  return text.normalize('NFKC');
}
