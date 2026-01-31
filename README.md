# Kanji Alive MCP Server

Two Model Context Protocol (MCP) servers that provide access to the [Kanji Alive API](https://app.kanjialive.com/api/docs) for searching and retrieving information about Japanese kanji.

## Overview

This repository provides **two MCP server implementations**:

- **Hosted (HTTP):** TypeScript-based server (`https://kanjialive-mcp-server-production.up.railway.app/mcp`) for remote access (no installation required)
- **Local (stdio):** Python-based server (`ka-mcp-local/`) for local MCP clients like Claude Desktop, ChatGPT, or MSTY (requires local installation)

Both servers enable you to search and retrieve detailed information about 1,235 kanji supported by Kanji alive, including by:

- Kanji meanings, readings (Onyomi/Kunyomi), and stroke counts
- Radical information and positions
- Grade levels where kanji are taught
- Example words with translations and audio (mp3)
- Stroke order animation videos (mp4)
- Dictionary references

## Prerequisites

**For Remote Server:**
- An MCP compatible LLM client like Claude Desktop or claude.ai
- Enter `https://kanjialive-mcp-server-production.up.railway.app/mcp` as the remote MCP server name
- No authentication is needed

**For Local Server (Python):**
- Python 3.10 or higher
- [uv](https://docs.astral.sh/uv/) package manager
- A RapidAPI key (free tier available)

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

**For Local Python Server:**

```bash
cd ka-mcp-local
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

Add the server to your configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "Kanji Alive": {
      "command": "/path/to/kanjialive-mcp-server/ka-mcp-local/.venv/bin/python",
      "args": ["/path/to/kanjialive-mcp-server/ka-mcp-local/kanjialive_mcp.py"],
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
- "Search for kanji in the Macquarie University or AP Exam study lists"

### Detailed Information

- "Get detailed information about the kanji 見"
- "Show me all the readings and example words for 日"

## Available Tools

The server provides three MCP tools:

1. **kanjialive_search_basic** - Simple search by kanji, reading, or meaning
2. **kanjialive_search_advanced** - Complex searches with multiple filters (stroke count, grade, radical, study list, etc.)
3. **kanjialive_get_kanji_details** - Comprehensive information for a specific kanji including stroke order video and example audio

Two (draft) MCP resources for reference data:

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

### Project Structure

```
ka-mcp-local/       # Python stdio server for local clients
  ├── kanjialive_mcp.py
  ├── data/japanese-radicals.json
  └── pyproject.toml

ka-mcp-hosted/      # TypeScript HTTP server for hosting
  ├── src/
  ├── src/data/japanese-radicals.json
  └── package.json

extras/             # Development resources
  └── tests/        # Pytest test suite
```

### Running Tests

The project includes a comprehensive test suite for the Python server covering validators, formatters, API layer, and tools.

```bash
# From repository root
uv sync --all-extras

# Run all tests
uv run pytest extras/tests/ -v

# Run specific test files
uv run pytest extras/tests/test_validators.py -v
```

### Test Coverage

Current test coverage: **87%** (67 tests)

- Validators: Input validation, Unicode normalization, field validators
- Formatters: Markdown escaping, result formatting, metadata creation
- API layer: Retry logic, error handling, response validation
- Tools: End-to-end tool execution with mocked MCP context

## API Documentation

- [Kanji Alive API Documentation](https://app.kanjialive.com/api/docs)
- [RapidAPI Endpoint](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)

## Credit

Arno Bosse and Claude Code.

## License

This server implementation is provided as-is under a [MIT license](/blob/main/LICENSE). The [data and media](https://github.com/kanjialive/kanji-data-media) shared via the Kanji Alive API is licensed under [Creative Commons CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en).
