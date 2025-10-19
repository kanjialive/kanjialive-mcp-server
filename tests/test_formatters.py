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
    """Should format single result correctly."""
    output = _format_search_results_markdown(mock_search_results)
    assert "parent" in output
    assert "16" in output
    assert "| Kanji |" in output


def test_format_kanji_detail_complete(mock_api_response):
    """Should format complete kanji details."""
    output = _format_kanji_detail_markdown(mock_api_response)
    assert "parent" in output
    assert "Onyomi" in output
    assert "Kunyomi" in output
    assert "Radical" in output


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
