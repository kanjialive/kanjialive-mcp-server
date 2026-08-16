/**
 * Kanji Alive MCP Server - HTTP Entry Point
 *
 * A TypeScript MCP server for Railway.com hosting, providing access to the
 * Kanji Alive API for searching and retrieving Japanese kanji information.
 *
 * The Hono app itself lives in `app.ts`; this file only validates the
 * environment, binds the port, and wires up graceful shutdown.
 */

// Must precede the ./app.js import: app.ts reads env vars at module scope.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app, closeAllSessions, sessionCleanupInterval } from './app.js';
import { logger } from './utils/logger.js';
import { getApiHeaders } from './api/client.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Validate environment on startup.
 */
function validateEnvironment(): void {
  try {
    getApiHeaders();
    logger.info('API key validated successfully');
  } catch (error) {
    logger.error('Environment validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler.
 */
async function handleShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully`);

  await closeAllSessions();
  clearInterval(sessionCleanupInterval);
  process.exit(0);
}

process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));

// Validate environment and start server
validateEnvironment();

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    logger.info(`Kanji Alive MCP server listening on port ${info.port}`);
    logger.info(`Health check: http://localhost:${info.port}/health`);
    logger.info(`MCP endpoint: http://localhost:${info.port}/mcp`);
  }
);
