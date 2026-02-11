/**
 * Kanji Alive MCP Server - HTTP Entry Point
 *
 * A TypeScript MCP server for Railway.com hosting, providing access to the
 * Kanji Alive API for searching and retrieving Japanese kanji information.
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMCPServer } from './mcp/server.js';
import { logger } from './utils/logger.js';
import { getApiHeaders } from './api/client.js';

// Load version from package.json to avoid duplication
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION: string = packageJson.version;

/**
 * Validate session ID format.
 * Accepts UUID v4 format to prevent log injection and DoS via large values.
 */
function isValidSessionId(id: string | undefined): id is string {
  if (!id || id.length !== 36) return false;
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Minimal interface for MCP SDK's handleRequest method.
 * This is a subset of IncomingMessage that the SDK actually uses.
 */
type MockIncomingMessage = Readable & {
  method: string;
  url: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  httpVersion: string;
  httpVersionMajor: number;
  httpVersionMinor: number;
  complete: boolean;
  socket: { remoteAddress: string; remotePort: number };
  connection: null;
};

/**
 * Create a mock Node.js IncomingMessage from Hono request context.
 */
function createMockRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  _body?: unknown
): MockIncomingMessage {
  const rawHeaders: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    rawHeaders.push(key, value);
  }

  // Create a readable stream (body is passed separately to handleRequest)
  const stream = new Readable({
    read() {
      this.push(null);
    },
  });

  // Extend stream with IncomingMessage properties
  const mockReq: MockIncomingMessage = Object.assign(stream, {
    method,
    url: path,
    headers,
    rawHeaders,
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    complete: true,
    socket: {
      remoteAddress: headers['x-forwarded-for'] || 'unknown',
      remotePort: 0,
    },
    connection: null,
  });

  return mockReq;
}

/**
 * Minimal interface for MCP SDK's handleRequest method.
 * This is a subset of ServerResponse that the SDK actually uses.
 */
type MockServerResponse = EventEmitter & {
  statusCode: number;
  statusMessage: string;
  headersSent: boolean;
  finished: boolean;
  writable: boolean;
  writeHead: (status: number, statusMessage?: string | Record<string, string>, headers?: Record<string, string>) => MockServerResponse;
  write: (chunk: string | Buffer | Uint8Array) => boolean;
  end: (data?: string | Buffer | Uint8Array | (() => void), encoding?: BufferEncoding | (() => void), callback?: () => void) => MockServerResponse;
  setHeader: (name: string, value: string | string[]) => void;
  getHeader: (name: string) => string | string[] | undefined;
  getHeaders: () => Record<string, string | string[]>;
  hasHeader: (name: string) => boolean;
  removeHeader: (name: string) => void;
  writeContinue: () => void;
  setTimeout: () => MockServerResponse;
  flushHeaders: () => void;
  cork: () => void;
  uncork: () => void;
  addTrailers: () => void;
};

/**
 * Create a mock Node.js ServerResponse for capturing response data.
 */
function createMockResponse(): {
  mock: MockServerResponse;
  getResponse: () => { status: number; headers: Record<string, string>; body: string };
} {
  const responseHeaders: Record<string, string | string[]> = {};
  const responseChunks: string[] = [];
  let responseStatus = 200;
  let headersSent = false;

  const mock = new EventEmitter() as MockServerResponse;

  mock.statusCode = 200;
  mock.statusMessage = 'OK';
  mock.headersSent = false;
  mock.finished = false;
  mock.writable = true;

  mock.writeHead = (
    status: number,
    statusMessage?: string | Record<string, string>,
    headers?: Record<string, string>
  ) => {
    responseStatus = status;
    mock.statusCode = status;

    let actualHeaders: Record<string, string> | undefined;
    if (typeof statusMessage === 'object') {
      actualHeaders = statusMessage;
    } else {
      if (statusMessage) mock.statusMessage = statusMessage;
      actualHeaders = headers;
    }

    if (actualHeaders) {
      Object.assign(responseHeaders, actualHeaders);
    }
    headersSent = true;
    mock.headersSent = true;
    return mock;
  };

  mock.write = (chunk: string | Buffer | Uint8Array) => {
    if (chunk instanceof Uint8Array) {
      responseChunks.push(new TextDecoder().decode(chunk));
    } else {
      responseChunks.push(chunk.toString());
    }
    return true;
  };

  mock.end = (
    data?: string | Buffer | Uint8Array | (() => void),
    encoding?: BufferEncoding | (() => void),
    callback?: () => void
  ) => {
    if (typeof data === 'function') {
      data();
    } else if (data instanceof Uint8Array) {
      responseChunks.push(new TextDecoder().decode(data));
    } else if (data) {
      responseChunks.push(data.toString());
    }
    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof callback === 'function') {
      callback();
    }
    mock.finished = true;
    mock.emit('finish');
    return mock;
  };

  mock.setHeader = (name: string, value: string | string[]) => {
    responseHeaders[name] = value;
  };

  mock.getHeader = (name: string) => responseHeaders[name];
  mock.getHeaders = () => ({ ...responseHeaders });
  mock.hasHeader = (name: string) => name in responseHeaders;
  mock.removeHeader = (name: string) => {
    delete responseHeaders[name];
  };

  // Additional methods that might be called
  mock.writeContinue = () => {};
  mock.setTimeout = () => mock;
  mock.flushHeaders = () => {};
  mock.cork = () => {};
  mock.uncork = () => {};
  mock.addTrailers = () => {};

  const getResponse = () => ({
    status: responseStatus,
    headers: Object.entries(responseHeaders).reduce(
      (acc, [key, value]) => {
        acc[key] = Array.isArray(value) ? value.join(', ') : value;
        return acc;
      },
      {} as Record<string, string>
    ),
    body: responseChunks.join(''),
  });

  return { mock, getResponse };
}

const app = new Hono();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Session storage for stateful connections
const sessions: Map<string, StreamableHTTPServerTransport> = new Map();
const sessionLastAccess: Map<string, number> = new Map();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Periodic cleanup of stale sessions.
 * Removes sessions that haven't been accessed within SESSION_TIMEOUT_MS.
 */
const sessionCleanupInterval = setInterval(() => {
  const now = Date.now();
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
}, SESSION_CLEANUP_INTERVAL_MS);

// Prevent cleanup interval from keeping the process alive
sessionCleanupInterval.unref();

// Create the MCP server once at startup
const mcpServer = createMCPServer();

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

// Body size limit: prevent memory exhaustion from oversized payloads
app.use(
  '/mcp',
  bodyLimit({
    maxSize: 1024 * 1024, // 1 MB
    onError: (c) => {
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Request body too large' },
          id: null,
        },
        413
      );
    },
  })
);

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
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid session ID format',
        },
        id: null,
      },
      400
    );
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

      await mcpServer.connect(transport);
    } else {
      // Invalid request - no session for non-init request
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Invalid session. Send an initialize request without mcp-session-id to start.',
          },
          id: null,
        },
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
    logger.error('MCP request error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      sessionId,
    });

    // requestId was captured from the first parse (if successful)
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: requestId,
      },
      500
    );
  }
});

/**
 * MCP endpoint - handles GET requests for SSE streams.
 */
app.get('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id');

  // Validate session ID format and existence
  if (!isValidSessionId(sessionId)) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid or missing session ID',
        },
        id: null,
      },
      400
    );
  }

  if (!sessions.has(sessionId)) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found',
        },
        id: null,
      },
      400
    );
  }

  const transport = sessions.get(sessionId)!;

  // Handle SSE request
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
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      },
      500
    );
  }
});

/**
 * MCP endpoint - handles DELETE requests to close sessions.
 */
app.delete('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id');

  // Validate session ID format and existence
  if (!isValidSessionId(sessionId)) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid or missing session ID',
        },
        id: null,
      },
      400
    );
  }

  if (!sessions.has(sessionId)) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found',
        },
        id: null,
      },
      400
    );
  }

  const transport = sessions.get(sessionId)!;

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
 * Graceful shutdown handler.
 */
async function handleShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully`);

  // Close all active sessions and await completion
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
