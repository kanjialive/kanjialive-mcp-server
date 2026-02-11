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

/**
 * Validate that text does not contain null bytes or control characters.
 *
 * Control characters (U+0000-U+001F, U+007F-U+009F) can cause issues with
 * HTTP libraries, URLs, and downstream systems. This rejects them early
 * with a clear error message.
 *
 * Allows common whitespace: tab (0x09), newline (0x0A), carriage return (0x0D).
 *
 * @param text - Text to validate
 * @param fieldName - Name of the field for error messages
 * @returns The original text if valid
 * @throws Error if text contains control characters
 */
export function validateNoControlChars(text: string, fieldName: string = 'input'): string {
  // Check for null bytes explicitly (most dangerous)
  if (text.includes('\x00')) {
    throw new Error(
      `Invalid ${fieldName}: contains null byte (\\x00). ` +
        'Please remove any null characters from your input.'
    );
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // C0 control codes (0x00-0x1F) except tab, newline, carriage return
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      throw new Error(
        `Invalid ${fieldName}: contains control character (U+${code.toString(16).padStart(4, '0').toUpperCase()}) at position ${i}. ` +
          'Please use only printable characters.'
      );
    }
    // C1 control codes (0x7F-0x9F)
    if (code >= 0x7f && code <= 0x9f) {
      throw new Error(
        `Invalid ${fieldName}: contains control character (U+${code.toString(16).padStart(4, '0').toUpperCase()}) at position ${i}. ` +
          'Please use only printable characters.'
      );
    }
  }

  return text;
}
