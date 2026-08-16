# Tests

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # run with coverage + thresholds
npm run typecheck     # src (build config) and tests (tsconfig.test.json)
```

## Layout

| Path | Covers |
|---|---|
| `unit/unicode.test.ts` | NFKC normalization, control-character rejection |
| `unit/validatorUtils.test.ts` | Script detection, kanji block boundaries, study lists |
| `unit/schemas.test.ts` | The three Zod input schemas |
| `unit/markdown.test.ts` | Markdown escaping and both formatters |
| `unit/metadata.test.ts` | Field extraction and search metadata |
| `unit/errors.test.ts` | HTTP→message mapping, sanitization, `formatZodError` |
| `unit/retry.test.ts` | Retry predicate, exponential backoff, `Retry-After` capping |
| `unit/apiClient.test.ts` | Headers, response-shape validation (axios mocked) |
| `unit/radicals.test.ts` | The 321-entry resource and its missing-file path |
| `unit/logger.test.ts` | API log helpers |
| `unit/nodeShims.test.ts` | The Node `req`/`res` shims the SDK transport needs |
| `integration/tools.test.ts` | The three tools end to end, upstream mocked |
| `integration/http.test.ts` | Routes, sessions, CORS, body limit, real MCP protocol |

## How the HTTP tests work

`src/index.ts` binds a port and can call `process.exit`, so it holds startup only.
The Hono app lives in `src/app.ts` and is driven directly:

```ts
const res = await app.fetch(new Request('http://localhost/mcp', { … }))
```

That runs real routing, middleware, session handling and the real MCP SDK
transport in-process — no port, no subprocess. Only `src/api/client.ts` is
mocked, so no test touches the network or needs a RapidAPI key.

Two things to know when adding HTTP tests:

- **Send a `Host` header.** The SDK transport rebuilds a WHATWG `Request` and
  needs `Host` for an absolute URL. The `post()` helper does this already.
- **Responses may be SSE.** Use the `parseRpc()` helper, which handles both a
  bare JSON body and an `event:`/`data:` frame.

## Not covered

- **The live upstream.** Every test stubs `src/api/client.ts`, so nothing here
  asserts that the real Kanji Alive API still returns the shapes the formatters
  expect. A breaking upstream change would pass CI.
- **Concurrent server-initiated messages.** `app.ts` creates one `McpServer` at
  startup and connects each session's transport to it. Request/response traffic
  across concurrent sessions is covered; notifications and sampling across
  simultaneous sessions are not.
