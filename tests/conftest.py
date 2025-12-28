"""Shared test fixtures and configuration."""
import pytest
from unittest.mock import Mock, AsyncMock
from dataclasses import dataclass
import httpx


@dataclass
class MockLifespanContext:
    """Mock lifespan context for testing."""
    client: httpx.AsyncClient


@pytest.fixture
def mock_api_response():
    """Mock successful API response for kanji details."""
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
def mock_httpx_client():
    """Mock httpx.AsyncClient for testing API layer."""
    client = AsyncMock(spec=httpx.AsyncClient)
    return client


@pytest.fixture
def mock_mcp_context(mock_httpx_client):
    """
    Mock MCP Context for tool testing.

    Provides a mock context with lifespan client access and logging methods.
    """
    ctx = Mock()
    ctx.info = AsyncMock()
    ctx.debug = AsyncMock()
    ctx.warning = AsyncMock()
    ctx.error = AsyncMock()
    ctx.report_progress = AsyncMock()
    ctx.request_context = Mock()
    ctx.request_context.lifespan_context = MockLifespanContext(client=mock_httpx_client)

    return ctx


@pytest.fixture
def mock_successful_response(mock_search_results):
    """Create a mock successful HTTP response."""
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = mock_search_results
    mock_response.raise_for_status = Mock()
    return mock_response


@pytest.fixture
def mock_detail_response(mock_api_response):
    """Create a mock successful HTTP response for kanji details."""
    mock_response = Mock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.json.return_value = mock_api_response
    mock_response.raise_for_status = Mock()
    return mock_response
