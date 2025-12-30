/**
 * Markdown formatting utilities for search results and kanji details.
 *
 * Provides functions to escape special characters and format API responses
 * as human-readable markdown.
 */

import type { SearchResponse, KanjiDetail } from '../api/types.js';
import type { SearchResultMetadata } from './metadata.js';

/**
 * Regex pattern for markdown special characters that need escaping.
 */
const MD_SPECIAL = /([\\`*_{}[\]()#+\-.!|>])/g;

/**
 * Escape special Markdown characters to prevent formatting issues.
 *
 * @param text - String that may contain Markdown special characters
 * @returns Escaped string safe for Markdown output
 */
export function escapeMarkdown(text: string): string {
  if (typeof text !== 'string') {
    return String(text);
  }
  return text.replace(MD_SPECIAL, '\\$1');
}

/**
 * Format search results in markdown for human readability.
 *
 * Note: The API does not expose a canonical total result count;
 * we display the number of results actually returned.
 *
 * @param results - List of kanji objects from the API
 * @param metadata - Optional SearchResultMetadata object
 * @returns Markdown-formatted string
 */
export function formatSearchResultsMarkdown(
  results: SearchResponse,
  metadata?: SearchResultMetadata
): string {
  if (!results || results.length === 0) {
    return 'No kanji found matching your search criteria.';
  }

  let output = '# Kanji Search Results\n\n';

  // Add completeness metadata section if available
  if (metadata) {
    output += formatMetadataHeader(metadata);
  } else {
    // Fallback if metadata not provided
    output += `## Result Information\n\n- **Results Found:** ${results.length}\n\n`;
  }

  // Main results table
  // Note: Search API returns minimal data - only character, stroke count, and radical info
  output += '| Kanji | Strokes | Radical | Rad. Strokes | Rad. # |\n';
  output += '|-------|---------|---------|--------------|--------|\n';

  for (const kanji of results) {
    const char = kanji.kanji?.character ?? '?';
    // Search API uses 'stroke' (singular) as direct integer
    const strokes = kanji.kanji?.stroke ?? 'N/A';

    // Get radical info
    const radical = kanji.radical;
    const radicalChar = radical?.character ?? 'N/A';
    const radicalStrokes = radical?.stroke ?? 'N/A';
    // Radical order is the index in the 214 traditional kanji radicals
    const radicalOrder = radical?.order ?? 'N/A';

    output += `| ${char} | ${strokes} | ${radicalChar} | ${radicalStrokes} | ${radicalOrder} |\n`;
  }

  output += `\n**Total Results Shown:** ${results.length}\n`;

  return output;
}

/**
 * Format metadata as a markdown header section.
 *
 * @param metadata - Search result metadata
 * @returns Markdown-formatted header string
 */
function formatMetadataHeader(metadata: SearchResultMetadata): string {
  const paramsStr = Object.entries(metadata.query_parameters)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return (
    `## Search Information\n\n` +
    `- **Results Returned:** ${metadata.results_returned}\n` +
    `- **Fields Included:** ${metadata.fields_included.join(', ')}\n` +
    `- **Query Parameters:** ${paramsStr}\n` +
    `- **Generated:** ${metadata.timestamp}\n\n`
  );
}

/**
 * Format detailed kanji information in markdown.
 *
 * @param kanji - Kanji object from the API
 * @returns Markdown-formatted string with comprehensive kanji details
 */
export function formatKanjiDetailMarkdown(kanji: KanjiDetail): string {
  const char = kanji.kanji?.character ?? '?';
  const kInfo = kanji.kanji;
  const meaning = kInfo?.meaning?.english ?? 'N/A';
  // Detail API uses 'strokes' as integer (after filtering)
  const strokes = kInfo?.strokes ?? 'N/A';
  // Grade is in references object
  const refs = kanji.references;
  const grade = refs?.grade;

  let output = `# ${char} - Kanji Details\n\n`;
  output += `**Meaning:** ${escapeMarkdown(String(meaning))}\n\n`;

  // Basic info
  output += '## Basic Information\n\n';
  output += `- **Strokes:** ${strokes}\n`;
  output += `- **Grade:** ${grade ? grade : 'Not taught in elementary school'}\n`;

  // Stroke order video (mp4)
  const video = kInfo?.video;
  const videoMp4 = video?.mp4;
  if (videoMp4) {
    output += `- **Stroke Order Video:** <${videoMp4}>\n`;
  }
  output += '\n';

  // Readings - API returns comma-separated strings, not arrays
  output += '## Readings\n\n';

  const onyomi = kInfo?.onyomi;
  if (onyomi) {
    // API returns strings like "ホウ" or "otozureru, tazuneru"
    const onyomiKata = onyomi.katakana ?? '';
    const onyomiRoma = onyomi.romaji ?? '';
    if (onyomiKata) {
      output += '**Onyomi (音読み):**\n';
      // Split comma-separated readings and pair them
      const kataParts = onyomiKata.split(',').map((k) => k.trim()).filter(Boolean);
      const romaParts = onyomiRoma.split(',').map((r) => r.trim()).filter(Boolean);
      // Zip with fallback for mismatched lengths
      for (let i = 0; i < kataParts.length; i++) {
        const kata = kataParts[i];
        const roma = i < romaParts.length ? romaParts[i] : '';
        if (roma) {
          output += `- ${kata} (${roma})\n`;
        } else {
          output += `- ${kata}\n`;
        }
      }
      output += '\n';
    }
  }

  const kunyomi = kInfo?.kunyomi;
  if (kunyomi) {
    // API returns strings with Japanese comma (、) separation
    const kunyomiHira = kunyomi.hiragana ?? '';
    const kunyomiRoma = kunyomi.romaji ?? '';
    if (kunyomiHira) {
      output += '**Kunyomi (訓読み):**\n';
      // Split on Japanese comma (、) or regular comma
      const hiraParts = kunyomiHira.replace(/、/g, ',').split(',').map((h) => h.trim()).filter(Boolean);
      const romaParts = kunyomiRoma.split(',').map((r) => r.trim()).filter(Boolean);
      for (let i = 0; i < hiraParts.length; i++) {
        const hira = hiraParts[i];
        const roma = i < romaParts.length ? romaParts[i] : '';
        if (roma) {
          output += `- ${hira} (${roma})\n`;
        } else {
          output += `- ${hira}\n`;
        }
      }
      output += '\n';
    }
  }

  // Radical
  const radical = kanji.radical;
  if (radical) {
    output += '## Radical\n\n';
    const radChar = radical.character ?? 'N/A';
    const radMeaning = radical.meaning?.english ?? 'N/A';
    const radStrokes = radical.strokes ?? 'N/A';
    const radNameHira = radical.name?.hiragana ?? 'N/A';
    const radNameRoma = radical.name?.romaji ?? 'N/A';
    const radPosition = radical.position?.hiragana ?? '';

    output += `- **Character:** ${radChar}\n`;
    output += `- **Meaning:** ${escapeMarkdown(String(radMeaning))}\n`;
    output += `- **Name:** ${radNameHira} (${escapeMarkdown(String(radNameRoma))})\n`;
    output += `- **Strokes:** ${radStrokes}\n`;
    if (radPosition) {
      output += `- **Position:** ${radPosition}\n`;
    }
    output += '\n';
  }

  // Dictionary references
  if (refs) {
    output += '## Dictionary References\n\n';
    if (refs.kodansha) {
      output += `- **Kodansha:** ${refs.kodansha}\n`;
    }
    if (refs.classic_nelson) {
      output += `- **Classic Nelson:** ${refs.classic_nelson}\n`;
    }
    output += '\n';
  }

  // Examples
  const examples = kanji.examples;
  if (examples && examples.length > 0) {
    output += '## Example Words\n\n';
    for (const ex of examples) {
      const japanese = ex.japanese ?? '';
      const meaningEn = ex.meaning?.english ?? '';
      const audio = ex.audio;
      // Use mp3 format only for audio
      const audioUrl = audio?.mp3 ?? '';

      output += `### ${escapeMarkdown(japanese)}\n`;
      output += `**Meaning:** ${escapeMarkdown(meaningEn)}\n`;
      if (audioUrl) {
        output += `**Audio:** <${audioUrl}>\n`;
      }
      output += '\n';
    }
  }

  return output;
}
