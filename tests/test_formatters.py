"""Test output formatting functions."""
import pytest
from kanjialive_mcp import (
    _format_search_results_markdown,
    _format_kanji_detail_markdown,
    _escape_markdown,
    _extract_fields_from_results,
    _create_search_metadata
)


def test_escape_markdown_special_chars():
    """Should escape markdown special characters."""
    assert _escape_markdown("test*bold*") == r"test\*bold\*"
    assert _escape_markdown("test_italic_") == r"test\_italic\_"
    assert _escape_markdown("test[link]") == r"test\[link\]"


def test_escape_markdown_normal_text():
    """Should not modify normal text."""
    assert _escape_markdown("hello world") == "hello world"


def test_format_search_results_empty():
    """Should handle empty results gracefully."""
    output = _format_search_results_markdown([])
    assert "No kanji found" in output


def test_format_search_results_single(mock_search_results):
    """Should format single result correctly.

    Note: Search API returns minimal data - only character, stroke, radical.
    Meaning, grade, and readings are only available in detail endpoint.
    """
    output = _format_search_results_markdown(mock_search_results)
    # Check for kanji character (親 = \u89aa)
    assert "\u89aa" in output or "親" in output
    # Check stroke count is displayed
    assert "16" in output
    # Check table header exists
    assert "| Kanji |" in output
    # Check radical stroke count
    assert "7" in output
    # Check radical order (index in 214 traditional radicals) is displayed
    assert "147" in output
    # Check table header includes radical order column
    assert "Rad. #" in output


def test_format_kanji_detail_complete(mock_api_response):
    """Should format complete kanji details."""
    output = _format_kanji_detail_markdown(mock_api_response)
    assert "parent" in output
    assert "Onyomi" in output
    assert "Kunyomi" in output
    assert "Radical" in output
    # Check for stroke order video (mp4)
    assert "Stroke Order Video" in output
    assert ".mp4" in output
    # Check for example word with mp3 audio
    assert "Example Words" in output
    assert ".mp3" in output


def test_extract_fields_from_results(mock_search_results):
    """Should extract unique field names."""
    fields = _extract_fields_from_results(mock_search_results)
    assert "kanji" in fields
    assert "radical" in fields
    assert isinstance(fields, list)


def test_extract_fields_empty():
    """Should handle empty results."""
    fields = _extract_fields_from_results([])
    assert fields == []


def test_create_search_metadata(mock_search_results):
    """Should create valid metadata object."""
    request_info = {
        "endpoint": "search/parent",
        "timestamp": "2025-10-19T12:00:00",
        "params": {}
    }

    metadata = _create_search_metadata(
        mock_search_results,
        {"query": "parent"},
        request_info
    )

    assert metadata.results_returned == 1
    assert len(metadata.fields_included) > 0
    assert metadata.timestamp == "2025-10-19T12:00:00"
