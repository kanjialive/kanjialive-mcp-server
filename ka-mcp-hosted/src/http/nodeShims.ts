/**
 * Node.js `IncomingMessage` / `ServerResponse` shims.
 *
 * The MCP SDK's streamable-HTTP transport speaks the Node http API, but Hono
 * hands us a WHATWG `Request`. These adapt one to the other. Kept out of
 * `app.ts` so they can be tested without importing the server, its MCP
 * registration, or the session-cleanup timer.
 */

import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';

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
export function createMockRequest(
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
export function createMockResponse(): {
  mock: MockServerResponse;
  getResponse: () => { status: number; headers: Record<string, string>; body: string };
} {
  const responseHeaders: Record<string, string | string[]> = {};
  const responseChunks: string[] = [];
  let responseStatus = 200;

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
