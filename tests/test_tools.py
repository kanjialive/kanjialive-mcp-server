"""Test tool execution with mocked API responses."""
import pytest
from unittest.mock import Mock, AsyncMock, patch
import httpx

from kanjialive_mcp import (
    kanjialive_search_basic,
    kanjialive_search_advanced,
    kanjialive_get_kanji_details,
    KanjiBasicSearchInput,
    KanjiAdvancedSearchInput,
    KanjiDetailInput,
    KanjiSearchOutput,
    KanjiDetailOutput
)
from mcp.server.fastmcp.exceptions import ToolError


class TestKanjiSearchBasic:
    """Tests for basic search tool."""

    @pytest.mark.asyncio
    async def test_successful_search(self, mock_mcp_context, mock_search_results, mock_successful_response):
        """Should return structured output on success."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiBasicSearchInput(query="parent")
        result = await kanjialive_search_basic(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)
        assert result.metadata.results_returned == 1
        assert len(result.results) == 1
        mock_mcp_context.info.assert_called()

    @pytest.mark.asyncio
    async def test_empty_results(self, mock_mcp_context):
        """Should handle empty results gracefully."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = []
        mock_response.raise_for_status = Mock()
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_response

        params = KanjiBasicSearchInput(query="nonexistent")
        result = await kanjialive_search_basic(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)
        assert result.metadata.results_returned == 0
        assert result.results == []

    @pytest.mark.asyncio
    async def test_kanji_character_search(self, mock_mcp_context, mock_search_results, mock_successful_response):
        """Should handle kanji character as query."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiBasicSearchInput(query="親")
        result = await kanjialive_search_basic(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)
        mock_mcp_context.request_context.lifespan_context.client.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_api_error_raises_tool_error(self, mock_mcp_context):
        """Should raise ToolError on API failure."""
        error_response = Mock()
        error_response.status_code = 500

        mock_mcp_context.request_context.lifespan_context.client.get.side_effect = httpx.HTTPStatusError(
            "Server error", request=Mock(), response=error_response
        )

        params = KanjiBasicSearchInput(query="parent")

        with pytest.raises(ToolError):
            await kanjialive_search_basic(params, mock_mcp_context)

        mock_mcp_context.error.assert_called()


class TestKanjiSearchAdvanced:
    """Tests for advanced search tool."""

    @pytest.mark.asyncio
    async def test_no_filters_raises_error(self, mock_mcp_context):
        """Should raise ToolError when no filters provided."""
        params = KanjiAdvancedSearchInput()

        with pytest.raises(ToolError, match="At least one search parameter"):
            await kanjialive_search_advanced(params, mock_mcp_context)

    @pytest.mark.asyncio
    async def test_grade_filter(self, mock_mcp_context, mock_search_results, mock_successful_response):
        """Should filter by grade level."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiAdvancedSearchInput(grade=2)
        result = await kanjialive_search_advanced(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)
        assert result.metadata.results_returned >= 0

        # Verify grade parameter was passed
        call_args = mock_mcp_context.request_context.lifespan_context.client.get.call_args
        assert call_args[1]['params']['grade'] == 2

    @pytest.mark.asyncio
    async def test_multiple_filters(self, mock_mcp_context, mock_successful_response):
        """Should support multiple filters combined."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiAdvancedSearchInput(grade=2, ks=16, rem="see")
        result = await kanjialive_search_advanced(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)

        call_args = mock_mcp_context.request_context.lifespan_context.client.get.call_args
        assert call_args[1]['params']['grade'] == 2
        assert call_args[1]['params']['ks'] == 16
        assert call_args[1]['params']['rem'] == "see"

    @pytest.mark.asyncio
    async def test_empty_results_returns_empty_list(self, mock_mcp_context):
        """Should return empty results list, not error, when no matches."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = []
        mock_response.raise_for_status = Mock()
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_response

        params = KanjiAdvancedSearchInput(grade=6, ks=30)
        result = await kanjialive_search_advanced(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)
        assert result.metadata.results_returned == 0
        assert result.results == []

    @pytest.mark.asyncio
    async def test_onyomi_filter(self, mock_mcp_context, mock_successful_response):
        """Should filter by onyomi reading."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiAdvancedSearchInput(on="shin")
        result = await kanjialive_search_advanced(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)

        call_args = mock_mcp_context.request_context.lifespan_context.client.get.call_args
        assert call_args[1]['params']['on'] == "shin"


class TestKanjiGetDetails:
    """Tests for kanji details tool."""

    @pytest.mark.asyncio
    async def test_successful_lookup(self, mock_mcp_context, mock_api_response, mock_detail_response):
        """Should return detailed kanji information."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_detail_response

        params = KanjiDetailInput(character="親")
        result = await kanjialive_get_kanji_details(params, mock_mcp_context)

        assert isinstance(result, KanjiDetailOutput)
        assert result.kanji["kanji"]["character"] == "親"
        # Timestamp should be an ISO format string
        assert len(result.metadata.timestamp) > 0
        assert "T" in result.metadata.timestamp  # ISO format contains 'T'

    @pytest.mark.asyncio
    async def test_metadata_includes_endpoint(self, mock_mcp_context, mock_detail_response):
        """Should include endpoint in metadata."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_detail_response

        params = KanjiDetailInput(character="親")
        result = await kanjialive_get_kanji_details(params, mock_mcp_context)

        assert "kanji/" in result.metadata.endpoint

    @pytest.mark.asyncio
    async def test_api_error_raises_tool_error(self, mock_mcp_context):
        """Should raise ToolError on API failure."""
        error_response = Mock()
        error_response.status_code = 404
        error_response.text = "Not found"

        mock_mcp_context.request_context.lifespan_context.client.get.side_effect = httpx.HTTPStatusError(
            "Not found", request=Mock(), response=error_response
        )

        params = KanjiDetailInput(character="龍")  # Character not in database

        with pytest.raises(ToolError, match="not found"):
            await kanjialive_get_kanji_details(params, mock_mcp_context)

    @pytest.mark.asyncio
    async def test_context_logging_called(self, mock_mcp_context, mock_detail_response):
        """Should call context logging methods."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_detail_response

        params = KanjiDetailInput(character="親")
        await kanjialive_get_kanji_details(params, mock_mcp_context)

        mock_mcp_context.info.assert_called()


class TestToolOutputTypes:
    """Tests for structured output models."""

    @pytest.mark.asyncio
    async def test_basic_search_returns_kanji_search_output(self, mock_mcp_context, mock_successful_response):
        """Basic search should return KanjiSearchOutput type."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiBasicSearchInput(query="parent")
        result = await kanjialive_search_basic(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)
        assert hasattr(result, 'metadata')
        assert hasattr(result, 'results')
        assert hasattr(result.metadata, 'results_returned')
        assert hasattr(result.metadata, 'timestamp')

    @pytest.mark.asyncio
    async def test_advanced_search_returns_kanji_search_output(self, mock_mcp_context, mock_successful_response):
        """Advanced search should return KanjiSearchOutput type."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_successful_response

        params = KanjiAdvancedSearchInput(grade=2)
        result = await kanjialive_search_advanced(params, mock_mcp_context)

        assert isinstance(result, KanjiSearchOutput)

    @pytest.mark.asyncio
    async def test_detail_returns_kanji_detail_output(self, mock_mcp_context, mock_detail_response):
        """Kanji details should return KanjiDetailOutput type."""
        mock_mcp_context.request_context.lifespan_context.client.get.return_value = mock_detail_response

        params = KanjiDetailInput(character="親")
        result = await kanjialive_get_kanji_details(params, mock_mcp_context)

        assert isinstance(result, KanjiDetailOutput)
        assert hasattr(result, 'metadata')
        assert hasattr(result, 'kanji')
        assert hasattr(result.metadata, 'timestamp')
        assert hasattr(result.metadata, 'endpoint')
