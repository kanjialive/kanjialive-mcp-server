# Kanji Alive MCP Server - Hosted (HTTP)

TypeScript-based MCP server for cloud hosting with Streamable HTTP transport. Designed for Railway.com and other platforms that support HTTP-based services.

## Features

- **3 Tools**: Basic search, advanced search, kanji details
- **1 Resource**: Japanese radicals reference (321 entries)
- Access to 1,235 kanji taught in Japanese elementary schools
- Bilingual input support (romaji and Japanese scripts, auto-normalized to NFKC)
- Input validation with control character rejection
- Streamable HTTP transport with session management
- CORS support for browser-based MCP clients
- Exponential backoff with jitter and Retry-After header support

## Installation

```bash
cd ka-mcp-hosted
npm install
```

## Configuration

1. Copy the environment example file:
   ```bash
   cp .env.example .env
   ```

2. Add your RapidAPI key to `.env`:
   ```
   RAPIDAPI_KEY=your_actual_api_key_here
   ```

   Get your free API key at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RAPIDAPI_KEY` | Yes | — | Your RapidAPI key for the Kanji Alive API |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | — | Set to `production` for sanitized error messages |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warning`, `error`) |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |

## Development

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Deployment to Railway

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login and initialize:
   ```bash
   railway login
   railway init
   ```

3. Set environment variables:
   ```bash
   railway variables set RAPIDAPI_KEY=your_key_here
   railway variables set NODE_ENV=production
   ```

4. Deploy:
   ```bash
   railway up
   ```

5. Get your deployment URL:
   ```bash
   railway open
   ```

## Endpoints

### `GET /`
Server information: name, version, status, and available endpoints.

### `GET /health`
Health check endpoint for platform monitoring.

```json
{
  "status": "ok",
  "timestamp": "2026-01-15T12:00:00.000Z",
  "version": "1.1.2"
}
```

### `POST /mcp`
MCP protocol endpoint. Accepts JSON-RPC 2.0 requests. Returns an `mcp-session-id` header on session initialization that must be included in subsequent requests.

### `GET /mcp`
Server-Sent Events (SSE) endpoint for receiving MCP notifications. Requires `mcp-session-id` header.

### `DELETE /mcp`
Closes an MCP session. Requires `mcp-session-id` header.

## Tools

### kanjialive_search_basic
Search for kanji using a single search term: a kanji character (`親`), an Onyomi reading in katakana (`シン`), a Kunyomi reading in hiragana (`おや`), or an English meaning (`parent`).

### kanjialive_search_advanced
Search with multiple filter criteria. All parameters are optional but at least one must be provided:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `on` | Onyomi reading (romaji or katakana) | `shin` or `シン` |
| `kun` | Kunyomi reading (romaji or hiragana) | `oya` or `おや` |
| `kem` | Kanji English meaning | `parent` |
| `ks` | Kanji stroke count (1-30) | `16` |
| `kanji` | Kanji character | `親` |
| `rjn` | Radical Japanese name (romaji or hiragana) | `miru` or `みる` |
| `rem` | Radical English meaning | `see` |
| `rs` | Radical stroke count (1-17) | `7` |
| `rpos` | Radical position | `hen` or `へん` |
| `grade` | School grade level (1-6) | `2` |
| `list` | Study list | `ap`, `ap:c3`, `mac:c12` |

### kanjialive_get_kanji_details
Get comprehensive information about a specific kanji character including readings, radical, stroke order video, grade level, dictionary references, and example words with audio.

## Resources

### kanjialive://info/radicals
Complete reference of the 214 traditional Kangxi radicals with 107 position variants (321 total entries). Includes meanings, readings, stroke counts, and position information.

## Architecture

```
src/
├── index.ts                 # Hono HTTP server, session management, CORS
├── api/
│   ├── client.ts            # Axios client with retry logic
│   ├── constants.ts         # API configuration
│   └── types.ts             # TypeScript types
├── data/
│   └── japanese-radicals.json # 321 radical entries
├── formatters/
│   ├── markdown.ts          # Markdown output formatting
│   └── metadata.ts          # Search metadata generation
├── mcp/
│   ├── server.ts            # MCP server setup and tool/resource registration
│   ├── resources/
│   │   └── radicals.ts      # Radicals resource
│   └── tools/
│       ├── basicSearch.ts   # Basic search tool
│       ├── advancedSearch.ts # Advanced search tool
│       └── kanjiDetails.ts  # Kanji details tool
├── utils/
│   ├── errors.ts            # Error handling and shared ToolResult type
│   ├── logger.ts            # Winston logger
│   ├── unicode.ts           # Unicode normalization and validation
│   └── validation.ts        # Shared Zod error formatting
└── validators/
    ├── advancedSearch.ts    # Advanced search schema (11 optional filters)
    ├── basicSearch.ts       # Basic search schema
    ├── kanjiDetail.ts       # Kanji detail schema
    └── utils.ts             # Validator helpers (CJK detection, normalization)
```
