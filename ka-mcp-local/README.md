# Kanji Alive MCP Server - Local (Stdio)

Python-based MCP server for local use with stdio transport. This server is designed for use with Claude Desktop and other MCP clients that support stdio communication.

## Features

- **3 Tools**: Basic search, advanced search, kanji details
- **1 Resource**: Japanese radicals reference (321 entries)
- Access to 1,235 kanji taught in Japanese elementary schools
- Bilingual input support (romaji and Japanese scripts)
- Comprehensive validation and error handling

## Installation

```bash
cd ka-mcp-local
uv sync
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

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kanjialive": {
      "command": "/path/to/ka-mcp-local/.venv/bin/python",
      "args": ["/path/to/ka-mcp-local/kanjialive_mcp.py"],
      "env": {
        "RAPIDAPI_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Development

```bash
# Install dependencies
uv sync

# Run the server directly (for testing)
uv run python kanjialive_mcp.py
```

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
