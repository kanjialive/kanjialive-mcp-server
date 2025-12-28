"""Test API request layer including retry logic, error handling, and timeouts."""
import pytest
from unittest.mock import Mock, AsyncMock, patch
import httpx

from kanjialive_mcp import (
    _make_api_request,
    _handle_api_error,
    _validate_search_response,
    _validate_response_not_empty
)
from mcp.server.fastmcp.exceptions import ToolError


class TestMakeApiRequest:
    """Tests for _make_api_request function."""

    @pytest.mark.asyncio
    async def test_successful_request(self, mock_httpx_client):
        """Should return response data and metadata on success."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{"kanji": {"character": "親"}}]
        mock_response.raise_for_status = Mock()
        mock_httpx_client.get.return_value = mock_response

        data, info = await _make_api_request(mock_httpx_client, "search/parent")

        assert data == [{"kanji": {"character": "親"}}]
        assert "timestamp" in info
        assert info["endpoint"] == "search/parent"

    @pytest.mark.asyncio
    async def test_request_with_params(self, mock_httpx_client):
        """Should pass query parameters to request."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = []
        mock_response.raise_for_status = Mock()
        mock_httpx_client.get.return_value = mock_response

        await _make_api_request(
            mock_httpx_client,
            "search/advanced",
            params={"grade": 2, "ks": 5}
        )

        mock_httpx_client.get.assert_called_once()
        call_kwargs = mock_httpx_client.get.call_args[1]
        assert call_kwargs["params"] == {"grade": 2, "ks": 5}

    @pytest.mark.asyncio
    async def test_retry_on_429_rate_limit(self, mock_httpx_client):
        """Should retry on 429 with exponential backoff."""
        rate_limit_response = Mock()
        rate_limit_response.status_code = 429
        rate_limit_response.headers = {}

        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = []
        success_response.raise_for_status = Mock()

        mock_httpx_client.get.side_effect = [
            httpx.HTTPStatusError("Rate limited", request=Mock(), response=rate_limit_response),
            success_response
        ]

        with patch('asyncio.sleep', new_callable=AsyncMock):
            data, _ = await _make_api_request(mock_httpx_client, "search/test")
            assert data == []
            assert mock_httpx_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_retry_on_429_with_retry_after_header(self, mock_httpx_client):
        """Should respect Retry-After header on 429."""
        rate_limit_response = Mock()
        rate_limit_response.status_code = 429
        rate_limit_response.headers = {"Retry-After": "5"}

        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = []
        success_response.raise_for_status = Mock()

        mock_httpx_client.get.side_effect = [
            httpx.HTTPStatusError("Rate limited", request=Mock(), response=rate_limit_response),
            success_response
        ]

        with patch('asyncio.sleep', new_callable=AsyncMock) as mock_sleep:
            await _make_api_request(mock_httpx_client, "search/test")
            # Should use the Retry-After value (5 seconds)
            mock_sleep.assert_called()

    @pytest.mark.asyncio
    async def test_retry_on_500_server_error(self, mock_httpx_client):
        """Should retry on 5xx server errors."""
        server_error = Mock()
        server_error.status_code = 500

        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = []
        success_response.raise_for_status = Mock()

        mock_httpx_client.get.side_effect = [
            httpx.HTTPStatusError("Server error", request=Mock(), response=server_error),
            success_response
        ]

        with patch('asyncio.sleep', new_callable=AsyncMock):
            data, _ = await _make_api_request(mock_httpx_client, "search/test")
            assert mock_httpx_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_no_retry_on_400_client_error(self, mock_httpx_client):
        """Should not retry on 4xx client errors (except 429)."""
        client_error = Mock()
        client_error.status_code = 400
        client_error.text = "Bad request"

        mock_httpx_client.get.side_effect = httpx.HTTPStatusError(
            "Bad request", request=Mock(), response=client_error
        )

        with pytest.raises(httpx.HTTPStatusError):
            await _make_api_request(mock_httpx_client, "search/bad")

        assert mock_httpx_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_no_retry_on_404_not_found(self, mock_httpx_client):
        """Should not retry on 404 errors."""
        not_found_error = Mock()
        not_found_error.status_code = 404
        not_found_error.text = "Not found"

        mock_httpx_client.get.side_effect = httpx.HTTPStatusError(
            "Not found", request=Mock(), response=not_found_error
        )

        with pytest.raises(httpx.HTTPStatusError):
            await _make_api_request(mock_httpx_client, "kanji/unknown")

        assert mock_httpx_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_timeout_retry(self, mock_httpx_client):
        """Should retry on timeout."""
        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = []
        success_response.raise_for_status = Mock()

        mock_httpx_client.get.side_effect = [
            httpx.TimeoutException("Timeout"),
            success_response
        ]

        with patch('asyncio.sleep', new_callable=AsyncMock):
            data, _ = await _make_api_request(mock_httpx_client, "search/test")
            assert mock_httpx_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_network_error_retry(self, mock_httpx_client):
        """Should retry on network errors."""
        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = []
        success_response.raise_for_status = Mock()

        mock_httpx_client.get.side_effect = [
            httpx.RequestError("Connection failed"),
            success_response
        ]

        with patch('asyncio.sleep', new_callable=AsyncMock):
            data, _ = await _make_api_request(mock_httpx_client, "search/test")
            assert mock_httpx_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_max_retries_exceeded_server_error(self, mock_httpx_client):
        """Should raise after max retries on persistent server errors."""
        server_error = Mock()
        server_error.status_code = 503

        mock_httpx_client.get.side_effect = httpx.HTTPStatusError(
            "Service unavailable", request=Mock(), response=server_error
        )

        with patch('asyncio.sleep', new_callable=AsyncMock):
            with pytest.raises(httpx.HTTPStatusError):
                await _make_api_request(mock_httpx_client, "search/test")

        assert mock_httpx_client.get.call_count == 3  # max_retries


class TestHandleApiError:
    """Tests for _handle_api_error function."""

    def test_404_error_raises_tool_error(self):
        """Should raise ToolError with not found message."""
        response = Mock()
        response.status_code = 404
        error = httpx.HTTPStatusError("Not found", request=Mock(), response=response)

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "not found" in str(exc_info.value).lower()
        assert "1,235 kanji" in str(exc_info.value)

    def test_400_error_raises_tool_error(self):
        """Should raise ToolError with invalid request message."""
        response = Mock()
        response.status_code = 400
        response.text = "Invalid parameter"
        error = httpx.HTTPStatusError("Bad request", request=Mock(), response=response)

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "invalid request" in str(exc_info.value).lower()

    def test_429_error_raises_tool_error(self):
        """Should raise ToolError with rate limit message."""
        response = Mock()
        response.status_code = 429
        error = httpx.HTTPStatusError("Rate limited", request=Mock(), response=response)

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "rate limit" in str(exc_info.value).lower()

    def test_500_error_raises_tool_error(self):
        """Should raise ToolError with server error message."""
        response = Mock()
        response.status_code = 500
        error = httpx.HTTPStatusError("Server error", request=Mock(), response=response)

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "server error" in str(exc_info.value).lower()

    def test_timeout_error_raises_tool_error(self):
        """Should raise ToolError with timeout message."""
        error = httpx.TimeoutException("Timeout")

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "timed out" in str(exc_info.value).lower()

    def test_network_error_raises_tool_error(self):
        """Should raise ToolError with network error message."""
        error = httpx.RequestError("Connection failed")

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "network error" in str(exc_info.value).lower()

    def test_unexpected_error_raises_tool_error(self):
        """Should raise ToolError with generic message for unexpected errors."""
        error = ValueError("Unexpected error")

        with pytest.raises(ToolError) as exc_info:
            _handle_api_error(error)

        assert "unexpected error" in str(exc_info.value).lower()


class TestValidateSearchResponse:
    """Tests for _validate_search_response function."""

    def test_valid_search_response_list(self):
        """Should accept valid list response for search."""
        data = [{"kanji": {"character": "親"}}]
        # Should not raise
        _validate_search_response(data, "search/parent")

    def test_valid_empty_search_response(self):
        """Should accept empty list for search with no results."""
        data = []
        # Should not raise
        _validate_search_response(data, "search/unknown")

    def test_invalid_search_response_not_list(self):
        """Should raise ValueError for non-list search response."""
        with pytest.raises(ValueError, match="Expected list"):
            _validate_search_response({"kanji": {}}, "search/parent")

    def test_search_result_without_kanji_field_logs_warning(self):
        """Should log warning for search results missing kanji field."""
        # This should not raise, but would log a warning
        data = [{"other": "data"}]
        _validate_search_response(data, "search/test")

    def test_valid_kanji_detail_response(self):
        """Should accept valid dict response for kanji detail."""
        data = {"kanji": {"character": "親"}}
        # Should not raise
        _validate_search_response(data, "kanji/親")

    def test_invalid_kanji_detail_response_not_dict(self):
        """Should raise ValueError for non-dict kanji detail response."""
        with pytest.raises(ValueError, match="Expected dictionary"):
            _validate_search_response([{"kanji": {}}], "kanji/親")


class TestValidateResponseNotEmpty:
    """Tests for _validate_response_not_empty function."""

    def test_empty_list_is_valid_for_search(self):
        """Empty list should not raise for search (no results is valid)."""
        # Should not raise
        _validate_response_not_empty([], "query 'unknown'")

    def test_non_empty_list_is_valid(self):
        """Non-empty list should not raise."""
        _validate_response_not_empty([{"kanji": {}}], "query 'parent'")

    def test_empty_dict_raises_error(self):
        """Empty dict should raise ValueError for kanji detail."""
        with pytest.raises(ValueError, match="empty response"):
            _validate_response_not_empty({}, "kanji '親'")

    def test_none_raises_error(self):
        """None should raise ValueError."""
        with pytest.raises(ValueError, match="null response"):
            _validate_response_not_empty(None, "query 'test'")

    def test_non_empty_dict_is_valid(self):
        """Non-empty dict should not raise."""
        _validate_response_not_empty({"kanji": {"character": "親"}}, "kanji '親'")
