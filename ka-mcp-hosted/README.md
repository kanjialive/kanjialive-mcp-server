# Kanji Alive MCP Server - Hosted (HTTP)

TypeScript-based MCP server for cloud hosting with HTTP transport. Designed for Railway.com and other platforms that support HTTP-based services.

## Features

- **3 Tools**: Basic search, advanced search, kanji details
- **1 Resource**: Japanese radicals reference (321 entries)
- Access to 1,235 kanji taught in Japanese elementary schools
- Bilingual input support (romaji and Japanese scripts)
- Streamable HTTP transport for cloud deployment
- Exponential backoff with retry logic for API resilience

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
   PORT=3000
   ```

   Get your free API key at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji

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

### `GET /health`
Health check endpoint for Railway monitoring.

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "version": "1.0.0"
}
```

### `POST /mcp`
MCP protocol endpoint. Accepts JSON-RPC requests for MCP operations.

### `GET /`
Server information endpoint.

## Tools

### kanjialive_search_basic
Search for kanji using a simple search term (kanji character, reading, or English meaning).

### kanjialive_search_advanced
Search with multiple filter criteria: readings, meanings, stroke counts, radical properties, grade levels, and study lists.

### kanjialive_get_kanji_details
Get comprehensive information about a specific kanji character including readings, radical, examples, and stroke order.

## Resources

### kanjialive://info/radicals
Complete reference of the 214 traditional Kangxi radicals with 107 position variants.

## Architecture

```
src/
├── index.ts                 # Hono HTTP server entry point
├── api/
│   ├── client.ts           # Axios client with retry logic
│   ├── constants.ts        # API configuration
│   └── types.ts            # TypeScript types
├── formatters/
│   ├── markdown.ts         # Markdown formatting
│   └── metadata.ts         # Metadata generation
├── mcp/
│   ├── server.ts           # MCP server configuration
│   ├── resources/
│   │   └── radicals.ts     # Radicals resource
│   └── tools/
│       ├── basicSearch.ts  # Basic search tool
│       ├── advancedSearch.ts # Advanced search tool
│       └── kanjiDetails.ts # Kanji details tool
├── utils/
│   ├── errors.ts           # Error handling
│   ├── logger.ts           # Winston logger
│   └── unicode.ts          # Unicode normalization
└── validators/
    ├── advancedSearch.ts   # Advanced search validation
    ├── basicSearch.ts      # Basic search validation
    ├── kanjiDetail.ts      # Kanji detail validation
    └── utils.ts            # Validation utilities
```
