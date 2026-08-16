# Known Issues

Defects found while building the test suite. Each is pinned by a test in the
`known defects` block of the relevant spec, so the current behaviour cannot
change silently. Fixing one means updating its test.

---

## KI-1 — A throwing Zod transform escapes `safeParse`

**Where:** `src/utils/unicode.ts` (`validateNoControlChars`), `src/validators/utils.ts`
(`validateStudyList`), reached from all three validator schemas.
**Test:** `tests/unit/schemas.test.ts` → "KI-1"

Both helpers signal failure by `throw`ing, and both are called from inside a Zod
`.transform()`. Zod does not trap exceptions thrown in a transform, so they
propagate straight through `safeParse()` instead of producing `success: false`.

Every tool wraps `safeParse` in a `try/catch` that routes to `toErrorResult` →
`handleApiError`, which deliberately sanitizes unrecognised errors. The result:

| Input | Message the user gets | Message intended |
|---|---|---|
| `query` containing `\x00` | "An unexpected error occurred…" | "Invalid query: contains null byte…" |
| `list: "gen"` | "An unexpected error occurred…" | "Invalid study list 'gen'. Valid lists: 'ap', 'mac'." |

No security impact — the input is still rejected. The cost is that a self-correcting
LLM client is told nothing useful about what to fix.

**Fix:** report through Zod's issue channel rather than throwing, e.g. use
`.transform((v, ctx) => …ctx.addIssue…)`, or wrap each call so the thrown
message becomes a Zod issue.

---

## KI-2 — A whitespace-only basic search query validates, then becomes empty

**Where:** `src/validators/basicSearch.ts`
**Test:** `tests/unit/schemas.test.ts` → "KI-2"

```ts
z.string().min(1, 'Search query cannot be empty')
  .transform((v) => validateNoControlChars(normalizeJapaneseText(v.trim()), 'query'))
```

`.min(1)` runs *before* the `.trim()` inside the transform, so `"   "` passes the
length check and is then reduced to `""`. `executeBasicSearch` builds
`` `search/${encodeURIComponent('')}` `` and requests the bare `search/` endpoint.

**Fix:** trim before validating length — `z.string().trim().min(1)` — or re-check
non-emptiness after the transform.

---

## KI-3 — An oversized body without `Content-Length` returns 500, not 413

**Where:** `src/app.ts`, the `bodyLimit` middleware and the `POST /mcp` handler
**Test:** `tests/integration/http.test.ts` → "KI-3"

`hono/body-limit` has two paths. With a `Content-Length` header it rejects up
front and `onError` returns the intended 413. Without one (a chunked upload) it
instead caps the stream and raises `BodyLimitError` *when the handler reads the
body* — inside `await c.req.json()`. It recovers via an `if (c.error instanceof
BodyLimitError)` check after `await next()`, which only runs if the error is
allowed to propagate. The route catches it first and returns a generic
`-32603` / 500, so that branch is never reached.

Memory is still bounded: the stream errors at the 1 MB mark either way. Only the
status code and error message are wrong.

**Fix:** recognise `BodyLimitError` in the `POST /mcp` catch block and return the
same 413 the middleware would have.

---

## Residual risks — not defects, not covered

- **`Host` header dependency.** Since SDK 1.25, `StreamableHTTPServerTransport`
  converts the Node-style request the app hands it back into a WHATWG `Request`
  via `@hono/node-server`'s `getRequestListener`, which needs `Host` to build an
  absolute URL. A request without one gets a bare 400 with an empty body rather
  than a JSON-RPC error. Every real HTTP/1.1 client sends `Host`, so this only
  bites synthetic requests — it is why `tests/integration/http.test.ts` sets it
  explicitly.

- **One `McpServer` shared by all sessions.** `app.ts` creates a single server at
  startup and calls `mcpServer.connect(transport)` per session. Request/response
  traffic across concurrent sessions is covered and works, but server-initiated
  messages (notifications, sampling) across simultaneous sessions are not
  exercised.

- **Live upstream.** Every test stubs `src/api/client.ts`. Nothing here asserts
  that the real Kanji Alive API still returns the shapes the formatters expect;
  a breaking upstream change would pass CI.
