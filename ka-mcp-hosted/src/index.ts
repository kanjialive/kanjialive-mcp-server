/**
 * Kanji Alive MCP Server - HTTP Entry Point
 *
 * A TypeScript MCP server for Railway.com hosting, providing access to the
 * Kanji Alive API for searching and retrieving Japanese kanji information.
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createMCPServer } from './mcp/server.js';
import { logger } from './utils/logger.js';
import { getApiHeaders } from './api/client.js';

/**
 * Create a mock Node.js IncomingMessage from Hono request context.
 */
function createMockRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  _body?: unknown
): unknown {
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
  const mockReq = Object.assign(stream, {
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
 * Create a mock Node.js ServerResponse for capturing response data.
 */
function createMockResponse(): {
  mock: EventEmitter & Record<string, unknown>;
  getResponse: () => { status: number; headers: Record<string, string>; body: string };
} {
  const responseHeaders: Record<string, string | string[]> = {};
  const responseChunks: string[] = [];
  let responseStatus = 200;
  let headersSent = false;

  const mock = new EventEmitter() as EventEmitter & Record<string, unknown>;

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

// Create the MCP server once at startup
const mcpServer = createMCPServer();

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
    version: '1.1.1',
  });
});

/**
 * Root endpoint with server info.
 */
app.get('/', (c) => {
  return c.json({
    name: 'Kanji Alive MCP Server',
    version: '1.1.1',
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

  try {
    const body = await c.req.json();
    requestId = body?.id ?? null;

    if (sessionId && sessions.has(sessionId)) {
      // Reuse existing session
      transport = sessions.get(sessionId)!;
      logger.debug('Reusing session', { sessionId });
    } else if (!sessionId && isInitializeRequest(body)) {
      // New session initialization
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
          logger.info('Session initialized', { sessionId: id });
        },
      });

      // Set onclose handler BEFORE connect() to avoid race condition
      // where connection could close before handler is registered
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
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

    await transport.handleRequest(mockReq as any, mockRes as any, body);

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

  if (!sessionId || !sessions.has(sessionId)) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or missing session ID',
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

    await transport.handleRequest(mockReq as any, mockRes as any);

    const { status, headers, body: responseBody } = getResponse();
    return new Response(responseBody, { status, headers });
  } catch (error) {
    logger.error('MCP GET error', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * MCP endpoint - handles DELETE requests to close sessions.
 */
app.delete('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id');

  if (!sessionId || !sessions.has(sessionId)) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or missing session ID',
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
