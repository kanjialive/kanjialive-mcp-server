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

Alternatively, edit line 36 in `kanjialive_mcp.py` to set the key directly:
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

## Data Completeness 

This MCP server is designed for educational purposes and includes explicit 
measures to guarantee data completeness:

### How Completeness Works

Every search result includes metadata showing:
- **Total Results:** How many kanji match your search criteria
- **Results Returned:** How many are included in the response
- **Status:** ✓ COMPLETE or ✗ INCOMPLETE indicator

Example output:
```
## Result Completeness

- **Total Results:** 7
- **Results Returned:** 7
- **Status:** ✓ COMPLETE
- **Fields Included:** kanji, radical, meaning, strokes, grade, onyomi, kunyomi
- **Query Parameters:** grade=2, rs=8
```

### Important Usage Note

**Do NOT** take shortcuts with results:
- ✗ Don't manually hard-code a subset of kanji (e.g., assuming only 10 results are relevant to the user when the API returns 60)
- ✗ Don't assume you know all results without checking the metadata
- ✗ Don't extract only some fields and ignore the rest

**Do** use complete results:
- ✓ Always use all results returned by the API
- ✓ Verify the metadata shows "COMPLETE" status
- ✓ Process every field available in the response

### Example: Grade 2 Kanji with 8-Stroke Radicals

Search: `grade=2, rs=8`

**Correct approach:**
- Retrieve all results from API
- Verify metadata shows: Total Results = 7, Results Returned = 7, Status = ✓ COMPLETE
- Use all 7 kanji (間, 電, 雲, 聞, 雪, 長, 門)

**Incorrect approach:**
- Manually specify only: 間, 電, 聞, 門 (missing 3!)
- Hard-code results instead of using API
- Process only the results you see without verifying completeness

## Available Tools

The server provides three MCP tools:

1. **kanjialive_search_basic** - Simple search by kanji, reading, or meaning
2. **kanjialive_search_advanced** - Complex searches with multiple filters (stroke count, grade, radical, etc.)
3. **kanjialive_get_kanji_details** - Comprehensive information for a specific kanji

## Troubleshooting

### Diagnostic Script

Run the included diagnostic script to check your setup:

```bash
python diagnose.py
```

This will verify:
- Python version
- Virtual environment
- Package installation
- Server file validity
- Claude Desktop configuration

### Common Issues

**"API key not configured" warning:**
- Set the `RAPIDAPI_KEY` environment variable or update the script directly

**Server not appearing in Claude:**
- Verify the configuration file path is correct
- Check that the Python path points to your virtual environment
- Restart Claude Desktop after making changes

**"Resource not found" errors:**
- The kanji may not be in the database (only elementary school kanji are included)
- Check your search parameters for typos

**"INCOMPLETE" status in results:**
- This indicates not all matching kanji were returned
- Check the API endpoint status
- Verify your search parameters are correct
- Contact the server administrator if the issue persists
- Never proceed with incomplete results in educational contexts

## API Documentation

- [Kanji Alive API Documentation](https://app.kanjialive.com/api/docs)
- [RapidAPI Endpoint](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)

## License

## License

This server implementation is provided as-is under a [MIT license](/blob/main/LICENSE). The [data and media](https://github.com/kanjialive/kanji-data-media) shared via the Kanji Alive API is licensed under Creative Commons CC-BY.
