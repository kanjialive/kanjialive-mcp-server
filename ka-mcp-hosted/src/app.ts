/**
 * Kanji Alive MCP Server - HTTP application.
 *
 * Builds the Hono app and the session store. Kept separate from `index.ts` so
 * the app can be exercised via `app.fetch()` without binding a port or starting
 * the process; the Node req/res shims the MCP SDK transport expects live in
 * `http/nodeShims.ts`.
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMCPServer } from './mcp/server.js';
import { createMockRequest, createMockResponse } from './http/nodeShims.js';
import { logger } from './utils/logger.js';

// Load version from package.json to avoid duplication
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
export const VERSION: string = packageJson.version;

/**
 * Validate session ID format.
 * Accepts UUID v4 format to prevent log injection and DoS via large values.
 */
export function isValidSessionId(id: string | undefined): id is string {
  if (!id || id.length !== 36) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Create a JSON-RPC 2.0 error response object.
 */
export function jsonRpcError(code: number, message: string, id: unknown = null): object {
  return { jsonrpc: '2.0', error: { code, message }, id };
}

/**
 * Look up a validated, existing session transport.
 * Returns the transport if found, or a Response with the appropriate JSON-RPC
 * error if the session ID is invalid or unknown.
 */
function getSessionTransport(
  sessionId: string | undefined,
  c: Context
): StreamableHTTPServerTransport | Response {
  if (!isValidSessionId(sessionId)) {
    return c.json(jsonRpcError(-32600, 'Invalid or missing session ID'), 400);
  }
  if (!sessions.has(sessionId)) {
    return c.json(jsonRpcError(-32000, 'Session not found'), 400);
  }
  return sessions.get(sessionId)!;
}

export const app = new Hono();

// Session storage for stateful connections
export const sessions: Map<string, StreamableHTTPServerTransport> = new Map();
export const sessionLastAccess: Map<string, number> = new Map();
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Remove sessions that haven't been accessed within SESSION_TIMEOUT_MS.
 *
 * Exported so the sweep can be driven directly in tests instead of waiting on
 * the interval timer.
 */
export function reapStaleSessions(now: number = Date.now()): void {
  for (const [id, lastAccess] of sessionLastAccess.entries()) {
    if (now - lastAccess > SESSION_TIMEOUT_MS) {
      const transport = sessions.get(id);
      if (transport) {
        transport.close().catch(() => {});
      }
      sessions.delete(id);
      sessionLastAccess.delete(id);
      logger.info('Session expired due to inactivity', { sessionId: id });
    }
  }
}

/**
 * Periodic cleanup of stale sessions.
 */
export const sessionCleanupInterval = setInterval(
  () => reapStaleSessions(),
  SESSION_CLEANUP_INTERVAL_MS
);

// Prevent cleanup interval from keeping the process alive
sessionCleanupInterval.unref();

// CORS: allow browser-based MCP clients to connect
app.use(
  '/mcp',
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    allowMethods: ['GET', 'POST', 'DELETE'],
    allowHeaders: ['Content-Type', 'mcp-session-id'],
    exposeHeaders: ['mcp-session-id'],
  })
);

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

/** The 413 returned for an oversized request body. */
function bodyTooLarge(c: Context): Response {
  return c.json(jsonRpcError(-32600, 'Request body too large'), 413);
}

/**
 * hono/body-limit does not export BodyLimitError, so match the name it sets.
 */
function isBodyLimitError(error: unknown): boolean {
  return error instanceof Error && error.name === 'BodyLimitError';
}

// Body size limit: prevent memory exhaustion from oversized payloads
app.use('/mcp', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: bodyTooLarge }));

/**
 * Health check endpoint for Railway.
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
});

/**
 * Root endpoint with server info.
 */
app.get('/', (c) => {
  return c.json({
    name: 'Kanji Alive MCP Server',
    version: VERSION,
    description:
      'MCP server for the Kanji Alive API - search and retrieve information about ' +
      '1,235 Japanese kanji characters taught in Japanese elementary schools.',
    endpoints: {
      mcp: '/mcp',
      health: '/health',
    },
    tools: [
      'kanjialive_search_basic',
      'kanjialive_search_advanced',
      'kanjialive_get_kanji_details',
    ],
    resources: ['kanjialive://info/radicals'],
  });
});

/**
 * MCP endpoint - handles POST requests for MCP protocol.
 */
app.post('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id');
  let transport: StreamableHTTPServerTransport;
  let requestId: unknown = null;

  // Validate session ID format if provided (prevents log injection, DoS)
  if (sessionId && !isValidSessionId(sessionId)) {
    return c.json(jsonRpcError(-32600, 'Invalid session ID format'), 400);
  }

  try {
    const body = await c.req.json();
    requestId = body?.id ?? null;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing session
      transport = sessions.get(sessionId)!;
      sessionLastAccess.set(sessionId, Date.now());
      logger.debug('Reusing session', { sessionId });
    } else if (!sessionId && isInitializeRequest(body)) {
      // New session initialization
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
          sessionLastAccess.set(id, Date.now());
          logger.info('Session initialized', { sessionId: id });
        },
      });

      // Set onclose handler BEFORE connect() to avoid race condition
      // where connection could close before handler is registered
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          sessionLastAccess.delete(transport.sessionId);
          logger.info('Session closed', { sessionId: transport.sessionId });
        }
      };

      // One McpServer per transport: the SDK's Protocol owns a single transport,
      // so a shared instance rejects the second concurrent session.
      await createMCPServer(VERSION).connect(transport);
    } else {
      return c.json(
        jsonRpcError(-32000, 'Invalid session. Send an initialize request without mcp-session-id to start.'),
        400
      );
    }

    // Create mock request/response using proper Node.js interfaces
    const headersObj = Object.fromEntries(c.req.raw.headers.entries());
    const mockReq = createMockRequest(c.req.method, c.req.path, headersObj, body);
    const { mock: mockRes, getResponse } = createMockResponse();

    await transport.handleRequest(
      mockReq as unknown as IncomingMessage,
      mockRes as unknown as ServerResponse,
      body
    );

    // Get captured response
    const { status, headers, body: responseBody } = getResponse();

    return new Response(responseBody || '{}', { status, headers });
  } catch (error) {
    // Without a Content-Length header, bodyLimit cannot reject up front; it caps
    // the stream and surfaces the overflow here, when the body is read. Catching
    // it locally would otherwise mask the middleware's 413 as a generic 500.
    if (isBodyLimitError(error)) {
      logger.warn('Request body exceeded limit', { maxBytes: MAX_BODY_BYTES, sessionId });
      return bodyTooLarge(c);
    }

    logger.error('MCP request error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      sessionId,
    });

    return c.json(jsonRpcError(-32603, 'Internal server error', requestId), 500);
  }
});

/**
 * MCP endpoint - handles GET requests for SSE streams.
 */
app.get('/mcp', async (c) => {
  const result = getSessionTransport(c.req.header('mcp-session-id'), c);
  if (result instanceof Response) return result;
  const transport = result;
  const sessionId = c.req.header('mcp-session-id')!;

  try {
    const headersObj = Object.fromEntries(c.req.raw.headers.entries());
    const mockReq = createMockRequest(c.req.method, c.req.path, headersObj);
    const { mock: mockRes, getResponse } = createMockResponse();

    await transport.handleRequest(
      mockReq as unknown as IncomingMessage,
      mockRes as unknown as ServerResponse
    );

    const { status, headers, body: responseBody } = getResponse();
    return new Response(responseBody, { status, headers });
  } catch (error) {
    logger.error('MCP GET error', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    });
    return c.json(jsonRpcError(-32603, 'Internal server error'), 500);
  }
});

/**
 * MCP endpoint - handles DELETE requests to close sessions.
 */
app.delete('/mcp', async (c) => {
  const result = getSessionTransport(c.req.header('mcp-session-id'), c);
  if (result instanceof Response) return result;
  const transport = result;
  const sessionId = c.req.header('mcp-session-id')!;

  try {
    await transport.close();
    sessions.delete(sessionId);
    sessionLastAccess.delete(sessionId);
    logger.info('Session deleted', { sessionId });
    return c.json({ success: true });
  } catch (error) {
    logger.error('Session close error', { error, sessionId });
    return c.json({ error: 'Failed to close session' }, 500);
  }
});

/**
 * Close every active session and stop the cleanup timer.
 *
 * Used by the shutdown handler in `index.ts` and by test teardown.
 */
export async function closeAllSessions(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [sessionId, transport] of sessions) {
    closePromises.push(
      Promise.resolve(transport.close())
        .then(() => {
          logger.debug('Closed session on shutdown', { sessionId });
        })
        .catch((err) => {
          logger.debug('Error closing session on shutdown', {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
    );
  }

  await Promise.allSettled(closePromises);
  sessions.clear();
  sessionLastAccess.clear();
}
