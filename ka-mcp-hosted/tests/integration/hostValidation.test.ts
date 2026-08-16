import { describe, it, expect, afterEach, vi } from 'vitest';

// The transport is exercised for real; only the upstream API is stubbed.
vi.mock('../../src/api/client.js', () => ({
  searchKanji: vi.fn(),
  getKanjiDetail: vi.fn(),
  getApiHeaders: () => ({ 'X-RapidAPI-Key': 'test-key' }),
}));

const PING = { jsonrpc: '2.0', id: 1, method: 'ping' };

/**
 * ALLOWED_HOSTS is read once at module load, so each case needs a fresh copy of
 * the app rather than a mutated env on the already-imported one.
 */
async function loadApp(allowedHosts?: string) {
  vi.resetModules();
  if (allowedHosts === undefined) {
    delete process.env.ALLOWED_HOSTS;
  } else {
    process.env.ALLOWED_HOSTS = allowedHosts;
  }
  const { app, closeAllSessions, sessionCleanupInterval } = await import('../../src/app.js');
  return { app, closeAllSessions, sessionCleanupInterval };
}

function post(app: { fetch: (req: Request) => Response | Promise<Response> }, host: string) {
  return app.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        Host: host,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(PING),
    })
  );
}

afterEach(() => {
  delete process.env.ALLOWED_HOSTS;
});

describe('ALLOWED_HOSTS', () => {
  it('rejects a Host outside the allow list with 403', async () => {
    const { app, closeAllSessions, sessionCleanupInterval } = await loadApp('kanji.example.com');
    const res = await post(app, 'evil.example.com');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });

    await closeAllSessions();
    clearInterval(sessionCleanupInterval);
  });

  it('lets an allowed Host through to session handling', async () => {
    const { app, closeAllSessions, sessionCleanupInterval } = await loadApp(
      ' kanji.example.com , other.example.com '
    );
    const res = await post(app, 'kanji.example.com');

    // Past host validation: a bare ping with no session is a session error, not a 403.
    expect(res.status).toBe(400);

    await closeAllSessions();
    clearInterval(sessionCleanupInterval);
  });

  it('is off when ALLOWED_HOSTS is unset', async () => {
    const { app, closeAllSessions, sessionCleanupInterval } = await loadApp(undefined);
    const res = await post(app, 'anything.example.com');

    expect(res.status).toBe(400);

    await closeAllSessions();
    clearInterval(sessionCleanupInterval);
  });
});
