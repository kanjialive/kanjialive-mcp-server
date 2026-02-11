# Kanji Alive MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets you search and explore 1,235 Japanese kanji through any MCP-compatible AI assistant — Claude, ChatGPT, or others.

## Quick Start (Hosted Server)

The fastest way to use Kanji Alive is through the hosted server. No installation, no configuration.

**In your MCP client** (Claude Desktop, claude.ai, ChatGPT, MSTY, etc.), add a new remote MCP server with this URL:

```
https://kanjialive-mcp-server-production.up.railway.app/mcp
```

That's it. You can now ask your AI assistant to draw on its knowledge of [Kanji alive](https://kanjialive.com) to answer questions like:

- "Look up the kanji 親"
- "Find kanji that mean 'parent'"
- "Search for kanji with the onyomi reading シン"
- "Show me kanji with the kunyomi reading おや"
- "Get detailed information about the kanji 見, including stroke order and examples"
- "Find all kanji with 5 strokes that are taught in grade 1"
- "Show me kanji that use the 'fire' radical"
- "Find kanji where the radical has 7 strokes"
- "Show me kanji with the radical in the hen (left) position"
- "What kanji are in the AP Exam study list, chapter 3?"
- "Tell me about the 214 traditional kanji radicals"

You can use either romaji or Japanese script — "shin" and "シン" both work, as do "oya" and "おや".

---

## Local Server (Python, stdio)

If you prefer to run the server locally — for offline use, development, or to avoid the hosted server — there is a Python implementation that communicates over stdio.

### Prerequisites

- Python 3.10 or higher
- [uv](https://docs.astral.sh/uv/) package manager
- A RapidAPI key (free tier available)

### 1. Get a RapidAPI Key

1. Visit [Kanji Alive API on RapidAPI](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)
2. Sign up for a free account
3. Subscribe to the free tier
4. Copy your API key

### 2. Clone and Install

```bash
git clone https://github.com/kanjialive/kanjialive-mcp-server.git
cd kanjialive-mcp-server/ka-mcp-local
uv sync
```

### 3. Configure Your MCP Client

Add the server to your MCP client's configuration file:

**Claude Desktop config location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

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

Replace `/path/to/kanjialive-mcp-server` with the actual path where you cloned the repository.

### 4. Restart Your Client

Restart your MCP client for changes to take effect.

---

## Development

### Project Structure

```
ka-mcp-local/               # Python stdio server
  ├── kanjialive_mcp.py      # Single-file MCP server
  ├── data/japanese-radicals.json
  └── pyproject.toml

ka-mcp-hosted/               # TypeScript HTTP server (see its own README)
  ├── src/
  ├── src/data/japanese-radicals.json
  └── package.json

extras/                      # Development resources
  └── tests/                 # Pytest test suite (102 tests)
```

### Running Tests

```bash
# From repository root
uv sync --all-extras

# Run all tests
PYTHONPATH=ka-mcp-local uv run pytest extras/tests/ -v

# Run a specific test file
PYTHONPATH=ka-mcp-local uv run pytest extras/tests/test_validators.py -v
```

### Hosted Server Development

See [`ka-mcp-hosted/README.md`](ka-mcp-hosted/README.md) for build, test, and deployment instructions for the TypeScript server.

### Advanced Search API Parameters

For developers working on the server or integrating directly, the advanced search tool accepts these filter parameters (all optional, at least one required):

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

## API Documentation

- [Kanji Alive API Documentation](https://app.kanjialive.com/api/docs)
- [RapidAPI Endpoint](https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji)

## Credit

Arno Bosse and [Claude Code](https://claude.ai/claude-code) (Anthropic).

## License

This server implementation is provided as-is under a [MIT license](/blob/main/LICENSE). The [data and media](https://github.com/kanjialive/kanji-data-media) shared via the Kanji Alive API is licensed under [Creative Commons CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en).
