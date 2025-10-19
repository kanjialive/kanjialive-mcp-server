# Kanji Alive MCP Server

An Model Context Protocol (MCP) server that provides access to the [Kanji Alive API](https://app.kanjialive.com/api/docs) for searching and retrieving information about Japanese kanji. Note: This is an experimental project created with Claude using the [mcp-builder skill](https://github.com/anthropics/skills). 

## Overview

This MCP server enables Claude to search and retrieve detailed information about 1,235 kanji taught in Japanese elementary schools, including:

- Kanji meanings, readings (Onyomi/Kunyomi), and stroke counts
- Radical information and positions
- Grade levels where kanji are taught
- Example words with translations
- Dictionary references
- Stroke order data

## Prerequisites

- Python 3.10 or higher
- A RapidAPI key (free tier available)
- Claude Desktop application

## Installation

### 1. Get a RapidAPI Key

1. Visit [Kanji Alive API on RapidAPI](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)
2. Sign up for a free account
3. Subscribe to the free tier
4. Copy your API key

### 2. Set Up Python Environment

```bash
# Create a virtual environment
python3 -m venv venv

# Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure API Key

Set your RapidAPI key as an environment variable:

```bash
# On macOS/Linux (add to ~/.bashrc or ~/.zshrc for persistence):
export RAPIDAPI_KEY="your_api_key_here"

# On Windows (Command Prompt):
set RAPIDAPI_KEY=your_api_key_here

# On Windows (PowerShell):
$env:RAPIDAPI_KEY="your_api_key_here"
```

Alternatively, edit line 39 in `kanjialive_mcp.py` to set the key directly:
```python
RAPIDAPI_KEY = "your_api_key_here"
```

### 4. Configure Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kanjialive": {
      "command": "/path/to/ka-mcp/venv/bin/python",
      "args": ["/path/to/ka-mcp/kanjialive_mcp.py"],
      "env": {
        "RAPIDAPI_KEY": "your_api_key_here"
      }
    }
  }
}
```

Replace `/path/to/ka-mcp` with the actual path to this directory.

### 5. Restart Claude Desktop

After updating the configuration, restart Claude Desktop for changes to take effect.

## Usage

Once configured, you can ask Claude to search for kanji information:

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

### Features

- **Bilingual Input Support**: Accepts both romaji (English) and Japanese scripts (hiragana/katakana)
  - Onyomi readings: romaji or katakana (e.g., "shin" or "シン")
  - Kunyomi readings: romaji or hiragana (e.g., "oya" or "おや")
  - Radical positions: romaji or hiragana (e.g., "hen" or "へん")
- **Input Validation**: Helpful error messages guide correct script usage (katakana vs hiragana)
- **Automatic Retry**: Resilient API calls with exponential backoff for transient failures
- **Safe Markdown Rendering**: Properly escapes special characters in kanji data
- **Consistent Output**: Harmonized JSON structure across all endpoints

## API Documentation

- [Kanji Alive API Documentation](https://app.kanjialive.com/api/docs)
- [RapidAPI Endpoint](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)

## License

This server implementation is provided as-is under a [MIT license](/blob/main/LICENSE). The [data and media](https://github.com/kanjialive/kanji-data-media) shared via the Kanji Alive API is licensed under Creative Commons CC-BY.
