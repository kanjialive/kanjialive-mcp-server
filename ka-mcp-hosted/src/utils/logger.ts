/**
 * Winston-based structured logging for the MCP server.
 *
 * Provides JSON-formatted logs suitable for Railway.com and other
 * cloud hosting environments.
 */

import winston from 'winston';

const { combine, timestamp, json, printf, colorize } = winston.format;

/**
 * Custom format for development that's more readable.
 */
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

/**
 * Determine if we're in production mode.
 */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Main application logger.
 *
 * Configuration:
 * - Production: JSON format for structured logging
 * - Development: Human-readable format with colors
 * - Log level controlled by LOG_LEVEL env var (default: 'info')
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProduction
    ? combine(timestamp(), json())
    : combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), colorize(), devFormat),
  transports: [new winston.transports.Console()],
  // Don't exit on handled exceptions
  exitOnError: false,
});

/**
 * Log an API request.
 *
 * @param method - HTTP method
 * @param path - API endpoint path
 * @param params - Query parameters (optional)
 */
export function logApiRequest(
  method: string,
  path: string,
  params?: Record<string, unknown>
): void {
  logger.debug('API request', {
    method,
    path,
    params: params || {},
  });
}

/**
 * Log an API response.
 *
 * @param path - API endpoint path
 * @param status - HTTP status code
 * @param durationMs - Request duration in milliseconds
 */
export function logApiResponse(path: string, status: number, durationMs: number): void {
  logger.debug('API response', {
    path,
    status,
    durationMs,
  });
}

/**
 * Log an API error.
 *
 * @param path - API endpoint path
 * @param error - Error object
 * @param context - Additional context (optional)
 */
export function logApiError(
  path: string,
  error: Error,
  context?: Record<string, unknown>
): void {
  logger.error('API error', {
    path,
    errorType: error.name,
    errorMessage: error.message,
    ...context,
  });
}

export default logger;
