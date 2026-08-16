import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import type { RequestInfo } from '../../src/api/types.js';

const searchKanji = vi.fn();
const getKanjiDetail = vi.fn();

// The transport is exercised for real; only the upstream API is stubbed.
vi.mock('../../src/api/client.js', () => ({
  searchKanji: (...args: unknown[]) => searchKanji(...args),
  getKanjiDetail: (...args: unknown[]) => getKanjiDetail(...args),
  getApiHeaders: () => ({ 'X-RapidAPI-Key': 'test-key' }),
}));

process.env.RAPIDAPI_KEY = 'test-key';

const { app, sessions, sessionLastAccess, closeAllSessions, sessionCleanupInterval, reapStaleSessions, SESSION_TIMEOUT_MS, isValidSessionId, VERSION } =
  await import('../../src/app.js');

const requestInfo: RequestInfo = {
  endpoint: 'search/water',
  params: {},
  timestamp: '2026-08-16T18:07:07.373Z',
};

const PROTOCOL_VERSION = '2024-11-05';

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

const MCP_ACCEPT = 'application/json, text/event-stream';

/**
 * POST a JSON-RPC body to /mcp.
 *
 * The Host header is required: the SDK transport rebuilds a WHATWG Request from
 * the Node-style request the app hands it, and needs Host to form an absolute
 * URL. Real HTTP/1.1 clients always send one; a synthetic Request does not.
 */
async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        Host: 'localhost',
        'Content-Type': 'application/json',
        Accept: MCP_ACCEPT,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

/** Read a response body as JSON. Response.json() is typed `unknown` here. */
async function json<T = Record<string, any>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Responses may be a bare JSON object or an SSE frame depending on the
 * negotiated stream; parse either into a JSON-RPC message.
 */
function parseRpc(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
    const dataLine = trimmed.split('\n').find((line) => line.startsWith('data:'));
    return JSON.parse(dataLine!.slice('data:'.length).trim());
  }
  return JSON.parse(trimmed);
}

/** Run a full initialize handshake and return the new session id. */
async function initSession(): Promise<string> {
  const res = await post(INITIALIZE_BODY);
  expect(res.status).toBe(200);
  const sessionId = res.headers.get('mcp-session-id');
  expect(sessionId).toBeTruthy();

  await post(
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { 'mcp-session-id': sessionId! }
  );

  return sessionId!;
}

const VALID_UUID = '67b54f0b-996a-47dc-bdc8-bbd91e5eed01';

beforeEach(() => {
  searchKanji.mockReset();
  getKanjiDetail.mockReset();
});

afterAll(async () => {
  await closeAllSessions();
  clearInterval(sessionCleanupInterval);
});

describe('GET /health', () => {
  it('reports ok with the package version', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.status).toBe('ok');
    expect(body.version).toBe(VERSION);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

describe('GET /', () => {
  it('advertises the tools and resources the server actually registers', async () => {
    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.name).toBe('Kanji Alive MCP Server');
    expect(body.tools).toEqual([
      'kanjialive_search_basic',
      'kanjialive_search_advanced',
      'kanjialive_get_kanji_details',
    ]);
    expect(body.resources).toEqual(['kanjialive://info/radicals']);
    expect(body.endpoints).toEqual({ mcp: '/mcp', health: '/health' });
  });
});

describe('unknown routes', () => {
  it('404s rather than falling through to the MCP handler', async () => {
    const res = await app.fetch(new Request('http://localhost/nope'));
    expect(res.status).toBe(404);
  });
});

describe('isValidSessionId', () => {
  it('accepts a UUID v4', () => {
    expect(isValidSessionId(VALID_UUID)).toBe(true);
    expect(isValidSessionId(VALID_UUID.toUpperCase())).toBe(true);
  });

  it('rejects wrong lengths, wrong versions and non-UUID text', () => {
    expect(isValidSessionId(undefined)).toBe(false);
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId('not-a-uuid')).toBe(false);
    expect(isValidSessionId(VALID_UUID.slice(0, 35))).toBe(false);
    expect(isValidSessionId(VALID_UUID + 'x')).toBe(false);
    // v1 UUID: version nibble is 1, not 4
    expect(isValidSessionId('67b54f0b-996a-17dc-bdc8-bbd91e5eed01')).toBe(false);
  });

  it('rejects an id long enough to be a log-injection or DoS vector', () => {
    expect(isValidSessionId('a'.repeat(10000))).toBe(false);
    expect(isValidSessionId(`${VALID_UUID}\nFAKE LOG LINE`)).toBe(false);
  });
});

describe('POST /mcp session handling', () => {
  it('rejects a malformed session id before touching the body', async () => {
    const res = await post(INITIALIZE_BODY, { 'mcp-session-id': 'garbage' });
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toMatch(/Invalid session ID format/);
  });

  it('rejects a well-formed but unknown session id', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'mcp-session-id': VALID_UUID }
    );
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toMatch(/Invalid session/);
  });

  it('rejects a non-initialize request that carries no session', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32000);
  });

  it('returns a JSON-RPC error, not a crash, for a malformed body', async () => {
    const res = await post('{ not json');
    expect(res.status).toBe(500);

    const body = await json(res);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.code).toBe(-32603);
  });

  it('issues a UUID v4 session id on initialize', async () => {
    const res = await post(INITIALIZE_BODY);
    expect(res.status).toBe(200);

    const sessionId = res.headers.get('mcp-session-id');
    expect(isValidSessionId(sessionId ?? undefined)).toBe(true);
    expect(sessions.has(sessionId!)).toBe(true);
  });

  it('reports the negotiated protocol and server identity', async () => {
    const res = await post(INITIALIZE_BODY);
    const rpc = parseRpc(await res.text()) as {
      result: { serverInfo: { name: string; version: string }; capabilities: object };
    };

    expect(rpc.result.serverInfo.name).toBe('Kanji Alive');
    expect(rpc.result.serverInfo.version).toBe(VERSION);
    expect(rpc.result.capabilities).toBeDefined();
  });

  it('keeps separate sessions isolated from one another', async () => {
    const first = await initSession();
    const second = await initSession();
    expect(first).not.toBe(second);
    expect(sessions.has(first)).toBe(true);
    expect(sessions.has(second)).toBe(true);
  });
});

describe('MCP protocol over HTTP', () => {
  it('lists exactly the three registered tools with their schemas', async () => {
    const sessionId = await initSession();

    const res = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    );
    const rpc = parseRpc(await res.text()) as {
      result: { tools: Array<{ name: string; inputSchema: object; annotations?: object }> };
    };

    expect(rpc.result.tools.map((t) => t.name).sort()).toEqual([
      'kanjialive_get_kanji_details',
      'kanjialive_search_advanced',
      'kanjialive_search_basic',
    ]);
    for (const tool of rpc.result.tools) {
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('marks the tools read-only and non-destructive for clients', async () => {
    const sessionId = await initSession();
    const res = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    );
    const rpc = parseRpc(await res.text()) as {
      result: { tools: Array<{ annotations?: Record<string, boolean> }> };
    };

    for (const tool of rpc.result.tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.idempotentHint).toBe(true);
    }
  });

  it('lists the radicals resource', async () => {
    const sessionId = await initSession();
    const res = await post(
      { jsonrpc: '2.0', id: 3, method: 'resources/list' },
      { 'mcp-session-id': sessionId }
    );
    const rpc = parseRpc(await res.text()) as {
      result: { resources: Array<{ uri: string; mimeType: string }> };
    };

    expect(rpc.result.resources).toHaveLength(1);
    expect(rpc.result.resources[0].uri).toBe('kanjialive://info/radicals');
  });

  it('reads the radicals resource through the transport', async () => {
    const sessionId = await initSession();
    const res = await post(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: { uri: 'kanjialive://info/radicals' },
      },
      { 'mcp-session-id': sessionId }
    );
    const rpc = parseRpc(await res.text()) as {
      result: { contents: Array<{ text: string }> };
    };

    const payload = JSON.parse(rpc.result.contents[0].text);
    expect(payload.total_entries).toBe(321);
  });

  it('calls a tool end to end and returns formatted markdown', async () => {
    searchKanji.mockResolvedValue([
      [{ kanji: { character: '水', stroke: 4 }, radical: { character: '⽔', stroke: 4, order: 109 } }],
      requestInfo,
    ]);

    const sessionId = await initSession();
    const res = await post(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'kanjialive_search_basic', arguments: { query: 'water' } },
      },
      { 'mcp-session-id': sessionId }
    );
    const rpc = parseRpc(await res.text()) as {
      result: { content: Array<{ text: string }> };
    };

    expect(rpc.result.content[0].text).toContain('# Kanji Search Results');
    expect(rpc.result.content[0].text).toContain('| 水 | 4 | ⽔ | 4 | 109 |');
    expect(searchKanji).toHaveBeenCalledWith('search/water');
  });

  it('surfaces an upstream failure as an MCP tool error, not an HTTP 500', async () => {
    searchKanji.mockRejectedValue(new Error('upstream down'));

    const sessionId = await initSession();
    const res = await post(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'kanjialive_search_basic', arguments: { query: 'water' } },
      },
      { 'mcp-session-id': sessionId }
    );

    expect(res.status).toBe(200);
    const rpc = parseRpc(await res.text()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0].text).not.toContain('upstream down');
  });

  it('reports an unknown tool as a JSON-RPC-level failure', async () => {
    const sessionId = await initSession();
    const res = await post(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'no_such_tool', arguments: {} },
      },
      { 'mcp-session-id': sessionId }
    );

    const rpc = parseRpc(await res.text()) as {
      error?: { message: string };
      result?: { isError?: boolean };
    };
    expect(rpc.error ?? rpc.result?.isError).toBeTruthy();
  });
});

describe('DELETE /mcp', () => {
  it('closes a live session and forgets it', async () => {
    const sessionId = await initSession();
    expect(sessions.has(sessionId)).toBe(true);

    const res = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'DELETE',
        headers: { 'mcp-session-id': sessionId },
      })
    );

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true });
    expect(sessions.has(sessionId)).toBe(false);
    expect(sessionLastAccess.has(sessionId)).toBe(false);
  });

  it('rejects a malformed session id', async () => {
    const res = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'DELETE',
        headers: { 'mcp-session-id': 'garbage' },
      })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32600);
  });

  it('rejects a missing session id', async () => {
    const res = await app.fetch(new Request('http://localhost/mcp', { method: 'DELETE' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32600);
  });

  it('rejects an unknown session id', async () => {
    const res = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'DELETE',
        headers: { 'mcp-session-id': VALID_UUID },
      })
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe(-32000);
  });
});

describe('GET /mcp', () => {
  it('requires a valid, known session', async () => {
    const missing = await app.fetch(new Request('http://localhost/mcp'));
    expect(missing.status).toBe(400);
    expect((await json(missing)).error.code).toBe(-32600);

    const unknown = await app.fetch(
      new Request('http://localhost/mcp', { headers: { 'mcp-session-id': VALID_UUID } })
    );
    expect(unknown.status).toBe(400);
    expect((await json(unknown)).error.code).toBe(-32000);
  });
});

describe('session expiry', () => {
  it('reaps sessions idle beyond the timeout and leaves fresh ones alone', async () => {
    const stale = await initSession();
    const fresh = await initSession();

    sessionLastAccess.set(stale, Date.now() - (SESSION_TIMEOUT_MS + 1000));
    reapStaleSessions();

    expect(sessions.has(stale)).toBe(false);
    expect(sessionLastAccess.has(stale)).toBe(false);
    expect(sessions.has(fresh)).toBe(true);
  });

  it('refreshes the last-access stamp when a session is reused', async () => {
    const sessionId = await initSession();
    sessionLastAccess.set(sessionId, Date.now() - (SESSION_TIMEOUT_MS - 1000));
    const before = sessionLastAccess.get(sessionId)!;

    await post({ jsonrpc: '2.0', id: 9, method: 'tools/list' }, { 'mcp-session-id': sessionId });

    expect(sessionLastAccess.get(sessionId)!).toBeGreaterThan(before);
  });
});

describe('CORS', () => {
  it('answers a preflight with the allowed methods and session header', async () => {
    const res = await app.fetch(
      new Request('http://localhost/mcp', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://claude.ai',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, mcp-session-id',
        },
      })
    );

    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();

    const allowedMethods = res.headers.get('access-control-allow-methods') ?? '';
    for (const method of ['GET', 'POST', 'DELETE']) {
      expect(allowedMethods).toContain(method);
    }
    expect((res.headers.get('access-control-allow-headers') ?? '').toLowerCase()).toContain(
      'mcp-session-id'
    );
  });

  it('exposes mcp-session-id so browser clients can read it', async () => {
    const res = await post(INITIALIZE_BODY, { Origin: 'https://claude.ai' });
    expect((res.headers.get('access-control-expose-headers') ?? '').toLowerCase()).toContain(
      'mcp-session-id'
    );
  });

  it('does not apply CORS to non-MCP routes', async () => {
    const res = await app.fetch(
      new Request('http://localhost/health', { headers: { Origin: 'https://claude.ai' } })
    );
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('body limit', () => {
  const OVERSIZED = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'kanjialive_search_basic',
      arguments: { query: 'x'.repeat(1024 * 1024 + 100) },
    },
  });

  it('rejects a declared payload over 1 MB with 413 before reading it', async () => {
    const res = await post(OVERSIZED, {
      'content-length': String(new TextEncoder().encode(OVERSIZED).length),
    });

    expect(res.status).toBe(413);
    const body = await json(res);
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toMatch(/too large/i);
  });

  it('accepts a payload comfortably under the limit', async () => {
    const res = await post(INITIALIZE_BODY);
    expect(res.status).toBe(200);
  });

  it('KI-3: an oversized body with no Content-Length reports 500, not 413', async () => {
    // Without Content-Length, hono/body-limit cannot reject up front; it caps
    // the stream instead and throws BodyLimitError when the handler reads the
    // body. The route's own try/catch swallows that into a generic -32603, so
    // the onError handler that would produce 413 never runs.
    // Memory is still bounded - only the status code is wrong.
    const res = await post(OVERSIZED);

    expect(res.status).toBe(500);
    expect((await json(res)).error.code).toBe(-32603);
  });
});
