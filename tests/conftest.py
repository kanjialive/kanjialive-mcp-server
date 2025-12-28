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
    """
    Mock successful API response for kanji details.

    Structure matches the real Kanji Alive API detail endpoint:
    - strokes is a direct integer (not {"count": N})
    - grade is in references object (not directly on kanji)
    - onyomi/kunyomi are comma-separated strings (not arrays)
    - video contains stroke order animations
    - examples include audio in mp3 format
    """
    return {
        "kanji": {
            "character": "\u89aa",
            "meaning": {"english": "parent"},
            "strokes": {"count": 16, "timings": [], "images": []},  # Object with count
            "onyomi": {
                "katakana": "\u30b7\u30f3",  # String, not array
                "romaji": "shin"  # String, not array
            },
            "kunyomi": {
                "hiragana": "\u304a\u3084",  # String, not array
                "romaji": "oya"  # String, not array
            },
            "video": {
                "poster": "https://media.kanjialive.com/kanji_strokes/oya_16.svg",
                "mp4": "https://media.kanjialive.com/kanji_animations/kanji_mp4/oya_00.mp4",
                "webm": "https://media.kanjialive.com/kanji_animations/kanji_webm/oya_00.webm"
            }
        },
        "radical": {
            "character": "\u898b",
            "meaning": {"english": "see"},
            "strokes": 7,
            "name": {
                "hiragana": "\u307f\u308b",
                "romaji": "miru"
            },
            "position": {
                "hiragana": "\u3064\u304f\u308a",  # tsukuri
                "romaji": "tsukuri"
            }
        },
        "references": {
            "grade": 2,  # Grade is in references, not kanji
            "kodansha": "1455",
            "classic_nelson": "4284"
        },
        "examples": [
            {
                "japanese": "\u89aa\u5b50\uff08\u304a\u3084\u3053\uff09",
                "meaning": {"english": "parent and child"},
                "audio": {
                    "mp3": "https://media.kanjialive.com/examples_audio/audio-mp3/oya_02_a.mp3"
                }
            }
        ]
    }


@pytest.fixture
def mock_search_results():
    """
    Mock search results list.

    Structure matches the real Kanji Alive API search endpoint:
    - Only basic fields: character, stroke (singular), radical info
    - No meaning, grade, or readings (these require detail endpoint)
    - Uses 'stroke' (singular), not 'strokes'
    """
    return [
        {
            "kanji": {
                "character": "\u89aa",
                "stroke": 16  # Singular 'stroke', direct integer
            },
            "radical": {
                "character": "\u898b",
                "stroke": 7,  # Singular 'stroke', direct integer
                "order": 147  # Index in 214 traditional radicals
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
