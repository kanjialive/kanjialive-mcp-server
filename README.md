# Kanji Alive MCP Server

A Model Context Protocol (MCP) server that provides access to the [Kanji Alive API](https://app.kanjialive.com/api/docs) for searching and retrieving information about Japanese kanji. 

## Overview

This MCP server enables you to search and retrieve detailed information about 1,235 kanji taught in Japanese elementary schools, including:

- Kanji meanings, readings (Onyomi/Kunyomi), and stroke counts
- Radical information and positions
- Grade levels where kanji are taught
- Example words with translations
- Dictionary references
- Stroke order data

## Prerequisites

- Python 3.10 or higher
- [uv](https://docs.astral.sh/uv/) package manager
- A RapidAPI key (free tier available)
- An MCP-compatible client ([Claude Desktop](https://claude.ai/download) recommended)

## Installation

### 1. Get a RapidAPI Key

1. Visit [Kanji Alive API on RapidAPI](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)
2. Sign up for a free account
3. Subscribe to the free tier
4. Copy your API key

### 2. Clone the Repository

```bash
git clone https://github.com/BoQsc/kanjialive-mcp-server.git
cd kanjialive-mcp-server
```

### 3. Install Dependencies

```bash
uv sync
```

This creates a `.venv` virtual environment and installs all dependencies from the lock file.

### 4. Configure API Key

**Important:** The server validates the API key on startup and will fail immediately if not configured properly.

Set your RapidAPI key as an environment variable:

```bash
# On macOS/Linux (add to ~/.bashrc or ~/.zshrc for persistence):
export RAPIDAPI_KEY="your_api_key_here"

# On Windows (Command Prompt):
set RAPIDAPI_KEY=your_api_key_here

# On Windows (PowerShell):
$env:RAPIDAPI_KEY="your_api_key_here"
```

### 5. Configure Your MCP Client

This server works with any MCP-compatible client. Configuration varies by client; below is the setup for Claude Desktop.

**Other clients:** Consult your client's documentation for MCP server configuration. You'll need to provide the Python path (`.venv/bin/python`), script path (`kanjialive_mcp.py`), and the `RAPIDAPI_KEY` environment variable.

#### Claude Desktop

Add the server to your configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "Kanji Alive": {
      "command": "/path/to/kanjialive-mcp-server/.venv/bin/python",
      "args": ["/path/to/kanjialive-mcp-server/kanjialive_mcp.py"],
      "env": {
        "RAPIDAPI_KEY": "your_api_key_here"
      }
    }
  }
}
```

Replace `/path/to/kanjialive-mcp-server` with the actual path to this directory.

### 6. Restart Your Client

Restart your MCP client for changes to take effect.

#### Claude Desktop Permissions

After restarting, the server appears in **Settings → Connectors → Kanji Alive**. You can set permissions to:

- **Always Allow** - Tools run without confirmation
- **Needs Approval** - Prompts before each tool use
- **Blocked** - Claude Desktop won't see the server (tools unavailable)

## Usage

Once configured, you can ask your LLM to search for kanji information:

### Basic Search Examples

- "Find kanji that mean 'parent'"
- "Search for kanji with the reading 'シン'"
- "Look up the kanji 親"

### Advanced Search Examples

- "Find all 5-stroke kanji taught in grade 1"
- "Show me kanji using the 'fire' radical"
- "Find grade 2 kanji with the radical position 'hen'"

### Detailed Information

- "Get detailed information about the kanji 見"
- "Show me all the readings and example words for 日"

## Available Tools

The server provides three MCP tools:

1. **kanjialive_search_basic** - Simple search by kanji, reading, or meaning
2. **kanjialive_search_advanced** - Complex searches with multiple filters (stroke count, grade, radical, etc.)
3. **kanjialive_get_kanji_details** - Comprehensive information for a specific kanji

And two (draft) MCP resources for reference data:

- `kanjialive://info/radical-positions` - Valid radical position codes
- `kanjialive://info/search-parameters` - Advanced search parameter documentation

### Features

- **Bilingual Input Support**: Accepts both romaji (English) and Japanese scripts (hiragana/katakana)
  - Onyomi readings: romaji or katakana (e.g., "shin" or "シン")
  - Kunyomi readings: romaji or hiragana (e.g., "oya" or "おや")
  - Radical positions: romaji or hiragana (e.g., "hen" or "へん")
- **Unicode Normalization**: Automatically normalizes Japanese text input (NFKC) for consistent handling
- **Input Validation**: Helpful error messages guide correct script usage (katakana vs hiragana)
- **Automatic Retry**: Resilient API calls with exponential backoff and Retry-After header support
- **Response Validation**: Validates API response structure before processing
- **Connection Pooling**: HTTP client reuse for improved performance across multiple requests
- **URL Encoding**: Proper handling of special characters in search queries
- **Safe Markdown Rendering**: Properly escapes special characters in kanji data
- **Secure Error Handling**: Sanitized user-facing error messages with detailed server-side logging
- **Runtime Security**: API key validation on startup with fail-fast behavior
- **Consistent Output**: Harmonized JSON structure across all endpoints

## Development

### Running Tests

The project includes a comprehensive test suite covering validators, formatters, API layer, and tools.

```bash
# Install with dev dependencies
uv sync --all-extras

# Run all tests
uv run pytest tests/ -v

# Run specific test files
uv run pytest tests/test_validators.py -v
```

### Test Coverage

Current test coverage: **83%** (64 tests)

- Validators: Input validation, Unicode normalization, field validators
- Formatters: Markdown escaping, result formatting, metadata creation
- API layer: Retry logic, error handling, response validation
- Tools: End-to-end tool execution with mocked MCP context

## API Documentation

- [Kanji Alive API Documentation](https://app.kanjialive.com/api/docs)
- [RapidAPI Endpoint](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)

## Credit

Initially vibe coded with Claude using the [mcp-builder skill](https://github.com/anthropics/skills). Subsequent revisions drawn from GPT-5 and Claude Sonnet 4.5 code reviews, selectively implemented in Claude Code. MCP 2025-11-25 spec compliance (lifespan context, structured output, ToolError handling) and uv migration by Claude Opus 4.5.

## License

This server implementation is provided as-is under a [MIT license](/blob/main/LICENSE). The [data and media](https://github.com/kanjialive/kanji-data-media) shared via the Kanji Alive API is licensed under [Creative Commons CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en).
