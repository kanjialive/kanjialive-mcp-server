import { describe, it, expect, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../../src/http/nodeShims.js';

describe('createMockRequest', () => {
  it('presents the shape of a Node IncomingMessage', () => {
    const req = createMockRequest('POST', '/mcp', { accept: 'application/json' });

    expect(req.method).toBe('POST');
    expect(req.url).toBe('/mcp');
    expect(req.headers).toEqual({ accept: 'application/json' });
    expect(req.httpVersion).toBe('1.1');
    expect(req.complete).toBe(true);
    expect(typeof req.on).toBe('function');
  });

  it('flattens headers into the rawHeaders key/value sequence', () => {
    const req = createMockRequest('GET', '/mcp', { accept: 'text/event-stream', host: 'example' });
    expect(req.rawHeaders).toEqual(['accept', 'text/event-stream', 'host', 'example']);
  });

  it('reports the forwarded client address when a proxy supplies one', () => {
    const withProxy = createMockRequest('POST', '/mcp', { 'x-forwarded-for': '203.0.113.7' });
    expect(withProxy.socket.remoteAddress).toBe('203.0.113.7');

    const direct = createMockRequest('POST', '/mcp', {});
    expect(direct.socket.remoteAddress).toBe('unknown');
  });

  it('exposes an already-ended readable body stream', async () => {
    const req = createMockRequest('POST', '/mcp', {});
    const chunks: unknown[] = [];
    for await (const chunk of req) chunks.push(chunk);
    expect(chunks).toEqual([]);
  });
});

describe('createMockResponse', () => {
  it('starts as a writable 200 with no headers sent', () => {
    const { mock, getResponse } = createMockResponse();
    expect(mock.statusCode).toBe(200);
    expect(mock.headersSent).toBe(false);
    expect(mock.writable).toBe(true);
    expect(getResponse()).toEqual({ status: 200, headers: {}, body: '' });
  });

  it('captures status and headers from writeHead(status, headers)', () => {
    const { mock, getResponse } = createMockResponse();
    mock.writeHead(404, { 'content-type': 'application/json' });

    expect(mock.headersSent).toBe(true);
    expect(getResponse().status).toBe(404);
    expect(getResponse().headers['content-type']).toBe('application/json');
  });

  it('captures status, message and headers from writeHead(status, message, headers)', () => {
    const { mock, getResponse } = createMockResponse();
    mock.writeHead(202, 'Accepted', { 'x-test': '1' });

    expect(mock.statusMessage).toBe('Accepted');
    expect(getResponse().status).toBe(202);
    expect(getResponse().headers['x-test']).toBe('1');
  });

  it('decodes Uint8Array chunks as UTF-8 rather than stringifying the bytes', () => {
    // Regression guard: calling toString() on a Uint8Array yields
    // "123,34,106..." instead of text, which corrupted every SSE response.
    const { mock, getResponse } = createMockResponse();
    const payload = '{"jsonrpc":"2.0","result":{"kanji":"親"}}';

    mock.write(new TextEncoder().encode(payload));

    expect(getResponse().body).toBe(payload);
    expect(getResponse().body).not.toMatch(/^\d+,\d+/);
  });

  it('decodes a Uint8Array passed to end()', () => {
    const { mock, getResponse } = createMockResponse();
    mock.end(new TextEncoder().encode('親'));
    expect(getResponse().body).toBe('親');
  });

  it('concatenates successive writes in order', () => {
    const { mock, getResponse } = createMockResponse();
    mock.write('event: message\n');
    mock.write('data: {"a":1}\n');
    mock.end('\n');
    expect(getResponse().body).toBe('event: message\ndata: {"a":1}\n\n');
  });

  it('accepts string and Buffer chunks', () => {
    const { mock, getResponse } = createMockResponse();
    mock.write('a');
    mock.write(Buffer.from('b'));
    expect(getResponse().body).toBe('ab');
  });

  it('marks itself finished and emits finish on end()', () => {
    const { mock } = createMockResponse();
    const onFinish = vi.fn();
    mock.on('finish', onFinish);

    mock.end();

    expect(mock.finished).toBe(true);
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('invokes a callback passed as the first argument to end()', () => {
    const { mock, getResponse } = createMockResponse();
    const callback = vi.fn();
    mock.end(callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(getResponse().body).toBe('');
  });

  it('invokes a callback passed in place of the encoding argument', () => {
    const { mock } = createMockResponse();
    const callback = vi.fn();
    mock.end('body', callback);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('invokes a trailing callback after data and encoding', () => {
    const { mock, getResponse } = createMockResponse();
    const callback = vi.fn();
    mock.end('body', 'utf-8', callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(getResponse().body).toBe('body');
  });

  it('supports the setHeader/getHeader/hasHeader/removeHeader quartet', () => {
    const { mock, getResponse } = createMockResponse();

    mock.setHeader('x-one', 'a');
    expect(mock.getHeader('x-one')).toBe('a');
    expect(mock.hasHeader('x-one')).toBe(true);
    expect(mock.getHeaders()).toEqual({ 'x-one': 'a' });

    mock.removeHeader('x-one');
    expect(mock.hasHeader('x-one')).toBe(false);
    expect(mock.getHeader('x-one')).toBeUndefined();
    expect(getResponse().headers).toEqual({});
  });

  it('joins multi-value headers with commas for the Response constructor', () => {
    const { mock, getResponse } = createMockResponse();
    mock.setHeader('set-cookie', ['a=1', 'b=2']);
    expect(getResponse().headers['set-cookie']).toBe('a=1, b=2');
  });

  it('tolerates the stream-control methods the SDK may call', () => {
    const { mock } = createMockResponse();
    expect(() => {
      mock.writeContinue();
      mock.flushHeaders();
      mock.cork();
      mock.uncork();
      mock.addTrailers();
      mock.setTimeout();
    }).not.toThrow();
    expect(mock.setTimeout()).toBe(mock);
  });
});
