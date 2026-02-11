/**
 * MCP Resource for Japanese radicals reference data.
 *
 * Provides access to 321 radical entries including the 214 Kangxi radicals
 * and 107 position variants.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Cached radicals data (loaded once on first access).
 */
let radicalsCache: Record<string, unknown> | null = null;

/**
 * Load the Japanese radicals reference data from bundled JSON.
 *
 * The data is cached after first load to avoid repeated file I/O.
 *
 * @returns Radicals data with metadata and radical entries
 * @throws Error if the radicals JSON file is missing
 */
async function loadRadicalsData(): Promise<Record<string, unknown>> {
  if (radicalsCache !== null) {
    return radicalsCache;
  }

  const radicalsFile = path.join(__dirname, '../../data/japanese-radicals.json');

  try {
    const data = await fs.readFile(radicalsFile, 'utf-8');
    const parsed = JSON.parse(data) as Record<string, unknown>;
    radicalsCache = parsed;
    logger.debug('Loaded radicals data', {
      totalEntries: parsed.total_entries ?? 0,
      filePath: radicalsFile,
    });
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Radicals data file not found: ${radicalsFile}. ` +
          'Ensure the data file is included in the deployment.'
      );
    }
    throw error;
  }
}

/**
 * Resource URI for the radicals data.
 */
export const RADICALS_RESOURCE_URI = 'kanjialive://info/radicals';

/**
 * Resource definition for MCP resources/list response.
 */
export const radicalsResourceDefinition = {
  uri: RADICALS_RESOURCE_URI,
  name: 'Japanese Radicals',
  description:
    'Complete reference of the 214 traditional Kangxi radicals with 107 position variants. ' +
    'Includes meanings, readings, stroke counts, and position information for all 321 radical entries.',
  mimeType: 'application/json',
};

/**
 * Read the radicals resource.
 *
 * @returns MCP resource contents
 */
export async function readRadicalsResource(): Promise<{
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}> {
  try {
    const data = await loadRadicalsData();
    return {
      contents: [
        {
          uri: RADICALS_RESOURCE_URI,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Failed to load radicals resource', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      contents: [
        {
          uri: RADICALS_RESOURCE_URI,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
              hint: 'The radicals data file may be missing from the deployment.',
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
