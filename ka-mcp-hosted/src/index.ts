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
import { createMCPServer } from './mcp/server.js';
import { logger } from './utils/logger.js';
import { getApiHeaders } from './api/client.js';

const app = new Hono();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Session storage for stateful connections
const sessions: Map<string, StreamableHTTPServerTransport> = new Map();

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
    version: '1.0.0',
  });
});

/**
 * Root endpoint with server info.
 */
app.get('/', (c) => {
  return c.json({
    name: 'Kanji Alive MCP Server',
    version: '1.0.0',
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

  try {
    const body = await c.req.json();

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

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          logger.info('Session closed', { sessionId: transport.sessionId });
        }
      };

      const server = createMCPServer();
      await server.connect(transport);
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

    // Handle the MCP request
    // Create a pass-through for the response
    const responseHeaders = new Headers();
    let responseBody = '';
    let responseStatus = 200;

    const mockRes = {
      writeHead: (status: number, headers?: Record<string, string>) => {
        responseStatus = status;
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            responseHeaders.set(key, value);
          });
        }
      },
      write: (data: string | Buffer) => {
        responseBody += data.toString();
      },
      end: (data?: string | Buffer) => {
        if (data) {
          responseBody += data.toString();
        }
      },
      setHeader: (name: string, value: string) => {
        responseHeaders.set(name, value);
      },
      getHeader: (name: string) => responseHeaders.get(name),
      on: () => {},
    };

    // Create a mock request object that works with the transport
    const mockReq = {
      method: c.req.method,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      body,
      on: () => {},
    };

    await transport.handleRequest(mockReq as any, mockRes as any, body);

    // Return the response
    const response = new Response(responseBody, {
      status: responseStatus,
      headers: responseHeaders,
    });

    return response;
  } catch (error) {
    logger.error('MCP request error', {
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
    const responseHeaders = new Headers();
    let responseBody = '';

    const mockRes = {
      writeHead: (status: number, headers?: Record<string, string>) => {
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            responseHeaders.set(key, value);
          });
        }
      },
      write: (data: string | Buffer) => {
        responseBody += data.toString();
      },
      end: (data?: string | Buffer) => {
        if (data) {
          responseBody += data.toString();
        }
      },
      setHeader: (name: string, value: string) => {
        responseHeaders.set(name, value);
      },
      on: () => {},
    };

    const mockReq = {
      method: c.req.method,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      on: () => {},
    };

    await transport.handleRequest(mockReq as any, mockRes as any);

    return new Response(responseBody, { headers: responseHeaders });
  } catch (error) {
    logger.error('MCP GET error', { error, sessionId });
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
function handleShutdown(signal: string): void {
  logger.info(`${signal} received, shutting down gracefully`);

  // Close all active sessions
  for (const [sessionId, transport] of sessions) {
    try {
      transport.close();
      logger.debug('Closed session on shutdown', { sessionId });
    } catch {
      // Ignore errors during shutdown
    }
  }

  sessions.clear();
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

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
