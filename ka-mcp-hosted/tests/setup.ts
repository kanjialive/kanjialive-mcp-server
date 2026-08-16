/**
 * Global test setup.
 *
 * Silences application logging so test output shows assertions rather than
 * winston noise. Set LOG_LEVEL explicitly to re-enable it when debugging.
 */
import { logger } from '../src/utils/logger.js';

logger.silent = true;

// The API client fails fast without a key, and no test hits the real API.
// Tests that exercise key handling save and restore this themselves.
process.env.RAPIDAPI_KEY = 'test-key';
