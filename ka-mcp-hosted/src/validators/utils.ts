/**
 * Validation utilities and constants for input validation.
 *
 * Provides script detection, radical position maps, and reusable validation helpers.
 */

/**
 * Valid radical positions in romaji (lowercase).
 */
export const VALID_RADICAL_POSITIONS_ROMAJI = [
  'hen',
  'tsukuri',
  'kanmuri',
  'ashi',
  'kamae',
  'tare',
  'nyou',
] as const;

/**
 * Valid radical positions in hiragana.
 */
export const VALID_RADICAL_POSITIONS_HIRAGANA = [
  'へん',
  'つくり',
  'かんむり',
  'あし',
  'かまえ',
  'たれ',
  'にょう',
] as const;

/**
 * All valid radical positions (romaji + hiragana).
 */
export const VALID_RADICAL_POSITIONS = new Set<string>([
  ...VALID_RADICAL_POSITIONS_ROMAJI,
  ...VALID_RADICAL_POSITIONS_HIRAGANA,
]);

/**
 * Mapping from hiragana radical positions to romaji for API consistency.
 */
export const RPOS_NORMALIZE: Record<string, string> = {
  'へん': 'hen',
  'つくり': 'tsukuri',
  'かんむり': 'kanmuri',
  'あし': 'ashi',
  'かまえ': 'kamae',
  'たれ': 'tare',
  'にょう': 'nyou',
};

/**
 * Valid study list base values.
 */
export const VALID_STUDY_LISTS = ['ap', 'mac'] as const;

/**
 * Regex pattern for pure katakana (including middle dot, iteration marks).
 * Unicode ranges: \u30A0-\u30FF (katakana), \u30FB-\u30FE (katakana marks)
 */
export const KATAKANA_PATTERN = /^[\u30A0-\u30FF\u30FB-\u30FE・]+$/;

/**
 * Regex pattern for pure hiragana (including iteration marks, small kana, dots for okurigana).
 * Unicode ranges: \u3040-\u309F (hiragana), \u3099-\u309C (combining marks)
 */
export const HIRAGANA_PATTERN = /^[\u3040-\u309F\u3099-\u309C.・]+$/;

/**
 * Regex pattern for pure romaji (ASCII letters, hyphens for compounds).
 */
export const ROMAJI_PATTERN = /^[a-zA-Z\-]+$/;

/**
 * Regex pattern for romaji with dots (for okurigana separation).
 */
export const ROMAJI_WITH_DOTS_PATTERN = /^[a-zA-Z.\-]+$/;

/**
 * Regex pattern for study list chapter format.
 */
export const CHAPTER_PATTERN = /^c\d+$/;

/**
 * Check if a string is pure katakana.
 *
 * @param text - Text to check
 * @returns True if the text is pure katakana
 */
export function isKatakana(text: string): boolean {
  return KATAKANA_PATTERN.test(text);
}

/**
 * Check if a string is pure hiragana.
 *
 * @param text - Text to check
 * @returns True if the text is pure hiragana
 */
export function isHiragana(text: string): boolean {
  return HIRAGANA_PATTERN.test(text);
}

/**
 * Check if a string is pure romaji.
 *
 * @param text - Text to check
 * @returns True if the text is pure romaji
 */
export function isRomaji(text: string): boolean {
  return ROMAJI_PATTERN.test(text);
}

/**
 * Check if a string is romaji with dots (for okurigana).
 *
 * @param text - Text to check
 * @returns True if the text is romaji with dots
 */
export function isRomajiWithDots(text: string): boolean {
  return ROMAJI_WITH_DOTS_PATTERN.test(text);
}

/**
 * Normalize a radical position value to its romaji form.
 *
 * @param position - Radical position in romaji or hiragana
 * @returns Normalized romaji position
 */
export function normalizeRadicalPosition(position: string): string {
  const lower = position.trim().toLowerCase();
  return RPOS_NORMALIZE[lower] ?? lower;
}

/**
 * Validate a study list format.
 *
 * Valid formats:
 * - 'ap' - Advanced Placement Exam
 * - 'mac' - Macquarie University
 * - 'ap:c3' - AP chapter 3
 * - 'mac:c12' - Macquarie chapter 12
 *
 * @param value - Study list value to validate
 * @returns Normalized study list value (lowercase)
 * @throws Error if the format is invalid
 */
export function validateStudyList(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes(':')) {
    const parts = normalized.split(':');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid study list format '${value}'. ` +
          "Use 'ap', 'mac', 'ap:c3', or 'mac:c12'."
      );
    }

    const [baseList, chapter] = parts;

    if (!VALID_STUDY_LISTS.includes(baseList as (typeof VALID_STUDY_LISTS)[number])) {
      throw new Error(
        `Invalid study list '${baseList}'. ` +
          "Valid lists: 'ap' (Advanced Placement), 'mac' (Macquarie)."
      );
    }

    if (!CHAPTER_PATTERN.test(chapter)) {
      throw new Error(
        `Invalid chapter format '${chapter}'. ` +
          "Use format 'c1', 'c2', 'c12', etc."
      );
    }
  } else {
    if (!VALID_STUDY_LISTS.includes(normalized as (typeof VALID_STUDY_LISTS)[number])) {
      throw new Error(
        `Invalid study list '${normalized}'. ` +
          "Valid lists: 'ap' (Advanced Placement), 'mac' (Macquarie)."
      );
    }
  }

  return normalized;
}
