/**
 * Global test setup.
 *
 * Silences application logging so test output shows assertions rather than
 * winston noise. Set LOG_LEVEL explicitly to re-enable it when debugging.
 */
import { logger } from '../src/utils/logger.js';

logger.silent = true;
