"""Shared test fixtures and configuration."""
import pytest
from unittest.mock import Mock, AsyncMock
import httpx


@pytest.fixture
def mock_api_response():
    """Mock successful API response."""
    return {
        "kanji": {
            "character": "\u89aa",
            "meaning": {"english": "parent"},
            "strokes": {"count": 16},
            "grade": 2,
            "onyomi": {
                "katakana": ["\u30b7\u30f3"],
                "romaji": ["shin"]
            },
            "kunyomi": {
                "hiragana": ["\u304a\u3084"],
                "romaji": ["oya"]
            }
        },
        "radical": {
            "character": "\u898b",
            "meaning": {"english": "see"},
            "strokes": 7,
            "name": {
                "hiragana": "\u307f\u308b",
                "romaji": "miru"
            }
        }
    }


@pytest.fixture
def mock_search_results():
    """Mock search results list."""
    return [
        {
            "kanji": {
                "character": "\u89aa",
                "meaning": {"english": "parent"},
                "strokes": {"count": 16},
                "grade": 2
            },
            "radical": {
                "character": "\u898b",
                "strokes": 7
            }
        }
    ]


@pytest.fixture
def mock_httpx_client(monkeypatch):
    """Mock httpx.AsyncClient."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = {"test": "data"}
    mock_client.get.return_value = mock_response

    async def mock_get_client():
        return mock_client

    monkeypatch.setattr("kanjialive_mcp.get_client", mock_get_client)
    return mock_client
