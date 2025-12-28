#!/usr/bin/env python3
"""
Kanji Alive MCP Server

A Model Context Protocol server for interacting with the Kanji Alive API via RapidAPI.
Provides tools for searching and retrieving information about Japanese kanji characters.

The Kanji Alive API provides data on 1,235 kanji taught in Japanese elementary schools,
including stroke order, meanings, readings, radicals, example words, and more.

IMPORTANT: This server requires a RapidAPI key to function.
Get your free API key at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji
Set the RAPIDAPI_KEY environment variable or update the RAPIDAPI_KEY constant in this file.

API Documentation: https://app.kanjialive.com/api/docs
RapidAPI Endpoint: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji
"""

import asyncio
import json
import logging
import datetime
import random
import re
import sys
import unicodedata
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import quote

import httpx
from mcp.server.fastmcp import FastMCP, Context
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel, Field, field_validator, ConfigDict

# Constants
API_BASE_URL = "https://kanjialive-api.p.rapidapi.com/api/public"
REQUEST_TIMEOUT = 30.0

# RapidAPI Configuration
# IMPORTANT: Set your RapidAPI key via environment variable or replace the default value
# Get your free API key at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji
import os
RAPIDAPI_HOST = "kanjialive-api.p.rapidapi.com"
USER_AGENT = "kanjialive-mcp/1.0 (+https://github.com/kanjialive-mcp-server)"

# Logger (configured in main)
logger = logging.getLogger(__name__)


# ============================================================================
# Application Lifespan Context
# ============================================================================

@dataclass
class AppContext:
    """Application context holding shared resources for the server lifetime."""
    client: httpx.AsyncClient


@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """
    Manage application lifecycle resources.

    This context manager handles the creation and cleanup of shared resources
    like the HTTP client, ensuring proper cleanup on any exit path.
    """
    headers = _get_api_headers()
    client = httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        headers=headers
    )
    logger.debug("Created HTTP client for server lifespan")
    try:
        yield AppContext(client=client)
    finally:
        await client.aclose()
        logger.debug("Closed HTTP client on server shutdown")


# Initialize FastMCP server with lifespan context
mcp = FastMCP(
    "Kanji Alive",
    instructions=(
        "MCP server for the Kanji Alive API - search and retrieve information about "
        "1,235 Japanese kanji characters taught in Japanese elementary schools. "
        "Provides tools for basic and advanced search, plus detailed kanji information "
        "including readings, radicals, stroke order, and example words."
    ),
    lifespan=app_lifespan
)

def _get_api_headers() -> Dict[str, str]:
    """
    Get API headers with runtime key validation.

    Returns:
        Dict of HTTP headers for RapidAPI requests

    Raises:
        ValueError: If RAPIDAPI_KEY is not configured
    """
    key = os.getenv("RAPIDAPI_KEY")
    if not key or key == "YOUR_RAPIDAPI_KEY_HERE":
        raise ValueError(
            "RAPIDAPI_KEY environment variable must be set. "
            "Get your free API key at: "
            "https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji"
        )

    return {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
        "Accept": "application/json",
        "User-Agent": USER_AGENT
    }

def _normalize_japanese_text(text: str) -> str:
    """
    Normalize Japanese text to NFKC form.

    This ensures consistent representation of characters that can be
    encoded in multiple ways (e.g., half-width vs full-width katakana,
    composed vs decomposed characters).

    Args:
        text: Japanese text to normalize

    Returns:
        Normalized text in NFKC form
    """
    if not isinstance(text, str):
        return str(text)
    return unicodedata.normalize('NFKC', text)

# Markdown escaping
_MD_SPECIAL = re.compile(r'([\\`*_{}[\]()#+\-.!|>])')

def _escape_markdown(text: str) -> str:
    """
    Escape special Markdown characters to prevent formatting issues.

    Args:
        text: String that may contain Markdown special characters

    Returns:
        Escaped string safe for Markdown output
    """
    if not isinstance(text, str):
        return str(text)
    return _MD_SPECIAL.sub(r'\\\1', text)

# Validation constants for radical positions
VALID_RADICAL_POSITIONS = {
    # Romaji (lowercase)
    'hen', 'tsukuri', 'kanmuri', 'ashi', 'kamae', 'tare', 'nyou',
    # Hiragana
    'へん', 'つくり', 'かんむり', 'あし', 'かまえ', 'たれ', 'にょう'
}

RPOS_NORMALIZE = {
    'へん': 'hen',
    'つくり': 'tsukuri',
    'かんむり': 'kanmuri',
    'あし': 'ashi',
    'かまえ': 'kamae',
    'たれ': 'tare',
    'にょう': 'nyou'
}


# ============================================================================
# Pydantic Input Models
# ============================================================================

class KanjiBasicSearchInput(BaseModel):
    """Input model for basic kanji search."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid',
        json_schema_serialization_defaults_required=True
    )

    query: str = Field(
        ...,
        description=(
            "Search term: a single kanji character (親), "
            "an Onyomi reading in katakana (シン), "
            "a Kunyomi reading in hiragana (おや), "
            "or an English meaning (parent)"
        ),
        min_length=1,
        max_length=100
    )

    @field_validator('query')
    @classmethod
    def normalize_query(cls, v: str) -> str:
        """Normalize Unicode in query string."""
        return _normalize_japanese_text(v.strip())


class KanjiAdvancedSearchInput(BaseModel):
    """Input model for advanced kanji search with multiple filter parameters."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid',
        json_schema_serialization_defaults_required=True
    )

    on: Optional[str] = Field(
        default=None,
        description="Onyomi reading in romaji or katakana (shin, シン)"
    )
    kun: Optional[str] = Field(
        default=None,
        description="Kunyomi reading in romaji or hiragana (oya, おや)"
    )
    kem: Optional[str] = Field(
        default=None,
        description="Kanji English meaning (parent, see)"
    )
    ks: Optional[int] = Field(
        default=None,
        description="Kanji stroke number (1-30)",
        ge=1,
        le=30
    )
    kanji: Optional[str] = Field(
        default=None,
        description="Kanji character (親, 見)",
        min_length=1,
        max_length=1
    )
    rjn: Optional[str] = Field(
        default=None,
        description="Radical Japanese name in romaji or hiragana (miru, みる)"
    )
    rem: Optional[str] = Field(
        default=None,
        description="Radical English meaning (see, fire, water)"
    )
    rs: Optional[int] = Field(
        default=None,
        description="Radical stroke number (1-17)",
        ge=1,
        le=17
    )
    rpos: Optional[str] = Field(
        default=None,
        description="Radical position: hen, tsukuri, kanmuri, ashi, kamae, tare, nyou, or in hiragana"
    )
    grade: Optional[int] = Field(
        default=None,
        description="School grade level (1-6) where kanji is taught in Japanese elementary schools",
        ge=1,
        le=6
    )

    @field_validator('on')
    @classmethod
    def validate_onyomi(cls, v: Optional[str]) -> Optional[str]:
        """Validate Onyomi reading format (romaji or katakana only)."""
        if v is None:
            return v

        # Normalize Unicode before validation
        v = _normalize_japanese_text(v.strip())

        # Pattern for pure katakana (including middle dot, iteration marks)
        katakana_pattern = r'^[\u30A0-\u30FF\u30FB-\u30FE・]+$'
        # Pattern for pure romaji (ASCII letters, hyphens for compounds)
        romaji_pattern = r'^[a-zA-Z\-]+$'

        is_katakana = re.match(katakana_pattern, v)
        is_romaji = re.match(romaji_pattern, v)

        if not (is_katakana or is_romaji):
            raise ValueError(
                f"Invalid Onyomi reading '{v}'. "
                f"Must be either romaji (e.g., 'shin') or katakana (e.g., 'シン'). "
                f"Do not mix scripts or use hiragana for Onyomi."
            )

        # Normalize romaji to lowercase for consistency
        return v.lower() if is_romaji else v

    @field_validator('kun', 'rjn')
    @classmethod
    def validate_hiragana_or_romaji(cls, v: Optional[str]) -> Optional[str]:
        """Validate Kunyomi/radical name format (romaji or hiragana only)."""
        if v is None:
            return v

        # Normalize Unicode before validation
        v = _normalize_japanese_text(v.strip())

        # Pattern for pure hiragana (including iteration marks, small kana, dots for okurigana)
        hiragana_pattern = r'^[\u3040-\u309F\u3099-\u309C.・]+$'
        # Pattern for pure romaji (ASCII letters, dots for okurigana, hyphens)
        romaji_pattern = r'^[a-zA-Z.\-]+$'

        is_hiragana = re.match(hiragana_pattern, v)
        is_romaji = re.match(romaji_pattern, v)

        if not (is_hiragana or is_romaji):
            raise ValueError(
                f"Invalid reading '{v}'. "
                f"Must be either romaji (e.g., 'oya') or hiragana (e.g., 'おや'). "
                f"Do not mix scripts or use katakana."
            )

        # Normalize romaji to lowercase
        return v.lower() if is_romaji else v

    @field_validator('rpos')
    @classmethod
    def validate_radical_position(cls, v: Optional[str]) -> Optional[str]:
        """Validate and normalize radical position."""
        if v is None:
            return v

        v_lower = v.strip().lower()

        if v_lower not in VALID_RADICAL_POSITIONS:
            raise ValueError(
                f"Invalid radical position '{v}'. "
                f"Valid romaji: hen, tsukuri, kanmuri, ashi, kamae, tare, nyou. "
                f"Valid hiragana: へん, つくり, かんむり, あし, かまえ, たれ, にょう"
            )

        # Normalize hiragana to romaji for API consistency
        return RPOS_NORMALIZE.get(v_lower, v_lower)

    @field_validator('kem', 'rem')
    @classmethod
    def strip_whitespace(cls, v: Optional[str]) -> Optional[str]:
        """Strip whitespace from English meaning fields."""
        return v.strip() if v else v

    def has_any_filter(self) -> bool:
        """Check if any search filter is provided."""
        return any([
            self.on, self.kun, self.kem, self.ks, self.kanji,
            self.rjn, self.rem, self.rs, self.rpos, self.grade
        ])


class KanjiDetailInput(BaseModel):
    """Input model for retrieving detailed information about a specific kanji."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid',
        json_schema_serialization_defaults_required=True
    )

    character: str = Field(
        ...,
        description="The kanji character to look up (親, 見, 日)",
        min_length=1,
        max_length=1
    )

    @field_validator('character')
    @classmethod
    def normalize_character(cls, v: str) -> str:
        """Normalize Unicode in character."""
        return _normalize_japanese_text(v.strip())


class SearchResultMetadata(BaseModel):
    """Metadata about search results."""
    results_returned: int = Field(description="Number of kanji in response")
    fields_included: List[str] = Field(description="All top-level fields in each kanji object")
    timestamp: str = Field(description="ISO format timestamp of search")
    query_parameters: Dict[str, Any] = Field(description="Parameters used in search")

    def to_markdown_header(self) -> str:
        """Format metadata as markdown header section."""
        params_str = ", ".join([f"{k}={v}" for k, v in self.query_parameters.items()])
        return (
            f"## Search Information\n\n"
            f"- **Results Returned:** {self.results_returned}\n"
            f"- **Fields Included:** {', '.join(self.fields_included)}\n"
            f"- **Query Parameters:** {params_str}\n"
            f"- **Generated:** {self.timestamp}\n\n"
        )


# ============================================================================
# Structured Output Models
# ============================================================================

class KanjiSearchOutput(BaseModel):
    """Structured output for kanji search tools."""
    metadata: SearchResultMetadata = Field(description="Search metadata including result count and query parameters")
    results: List[Dict[str, Any]] = Field(description="List of kanji objects matching the search")


class KanjiDetailMetadata(BaseModel):
    """Metadata for kanji detail response."""
    timestamp: str = Field(description="ISO format timestamp of request")
    endpoint: str = Field(description="API endpoint that was called")


class KanjiDetailOutput(BaseModel):
    """Structured output for kanji detail tool."""
    metadata: KanjiDetailMetadata = Field(description="Request metadata")
    kanji: Dict[str, Any] = Field(description="Complete kanji data including readings, radical, examples")


# ============================================================================
# Shared Utility Functions
# ============================================================================

async def _make_api_request(
    client: httpx.AsyncClient,
    endpoint: str,
    params: Optional[Dict[str, Any]] = None
) -> Tuple[Any, Dict[str, Any]]:
    """
    Make an API request to Kanji Alive via RapidAPI.

    This function returns BOTH the API response AND metadata about the request.

    Args:
        client: HTTP client from lifespan context
        endpoint: API endpoint path
        params: Optional query parameters

    Returns:
        Tuple of (response_data, request_info) where:
        - response_data: JSON response from the API
        - request_info: Dict containing {endpoint, params, timestamp}

    Raises:
        httpx.HTTPStatusError: If the API returns an error status code
        httpx.TimeoutException: If the request times out
    """
    url = f"{API_BASE_URL}/{endpoint}"

    # Retry configuration
    max_retries = 3
    backoff = 0.5  # Initial backoff in seconds
    max_backoff = 30.0  # Maximum backoff cap in seconds

    last_exception = None

    for attempt in range(1, max_retries + 1):
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()

            response_data = response.json()

            # Validate response structure
            try:
                _validate_search_response(response_data, endpoint)
            except ValueError as ve:
                logger.error(f"Response validation failed: {ve}")
                raise

            # Track request metadata
            request_info = {
                "endpoint": endpoint,
                "params": params or {},
                "timestamp": datetime.datetime.now().isoformat()
            }

            return response_data, request_info

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            # Retry on rate limiting (429) and server errors (5xx)
            if status == 429 or 500 <= status < 600:
                last_exception = e
                if attempt < max_retries:
                    # Honor Retry-After header for rate limiting
                    if status == 429:
                        retry_after = e.response.headers.get("Retry-After")
                        if retry_after and retry_after.isdigit():
                            delay = float(retry_after)
                            logger.warning(
                                f"Rate limited (429). Retry-After header: {retry_after}s. "
                                f"Waiting {delay}s before retry (attempt {attempt}/{max_retries})"
                            )
                        else:
                            # Apply jitter and cap to backoff
                            base = min(backoff, max_backoff)
                            jitter = random.uniform(0, base * 0.1)
                            delay = min(base + jitter, max_backoff)
                            logger.warning(
                                f"Rate limited (429), no Retry-After header. "
                                f"Using exponential backoff with jitter: {delay:.2f}s (attempt {attempt}/{max_retries})"
                            )
                    else:
                        # Apply jitter and cap to backoff for server errors
                        base = min(backoff, max_backoff)
                        jitter = random.uniform(0, base * 0.1)
                        delay = min(base + jitter, max_backoff)
                        logger.warning(
                            f"Server error {status}, "
                            f"retrying in {delay:.2f}s (attempt {attempt}/{max_retries})"
                        )

                    await asyncio.sleep(delay)
                    backoff = min(backoff * 2, max_backoff)  # Cap backoff growth
                    continue
            # For other HTTP errors, don't retry
            raise

        except (httpx.RequestError, httpx.TimeoutException) as e:
            last_exception = e
            if attempt < max_retries:
                # Apply jitter and cap to backoff for network errors
                base = min(backoff, max_backoff)
                jitter = random.uniform(0, base * 0.1)
                delay = min(base + jitter, max_backoff)
                logger.warning(
                    f"Network error: {type(e).__name__}, "
                    f"retrying in {delay:.2f}s (attempt {attempt}/{max_retries})"
                )
                await asyncio.sleep(delay)
                backoff = min(backoff * 2, max_backoff)  # Cap backoff growth
                continue
            # If this was the last attempt, raise
            raise

    # If we exhausted all retries, raise the last exception
    if last_exception:
        raise last_exception
    raise httpx.HTTPError("Request failed after retries")


def _validate_search_response(data: Any, endpoint: str) -> None:
    """
    Validate API response structure for search endpoints.

    Args:
        data: Response data from API
        endpoint: The endpoint that was called

    Raises:
        ValueError: If response structure is invalid
    """
    if endpoint.startswith("search"):
        if not isinstance(data, list):
            logger.error(
                f"Invalid search response type: expected list, got {type(data).__name__}",
                extra={"endpoint": endpoint, "response_type": type(data).__name__}
            )
            raise ValueError(
                f"API returned unexpected format for search. "
                f"Expected list of results, got {type(data).__name__}"
            )

        # Validate each result has required fields
        for idx, item in enumerate(data):
            if not isinstance(item, dict):
                raise ValueError(
                    f"Search result {idx} is not a dictionary (got {type(item).__name__})"
                )
            if 'kanji' not in item:
                logger.warning(
                    f"Search result {idx} missing 'kanji' field",
                    extra={"result_keys": list(item.keys())}
                )

    elif endpoint.startswith("kanji"):
        if not isinstance(data, dict):
            logger.error(
                f"Invalid kanji detail response type: expected dict, got {type(data).__name__}",
                extra={"endpoint": endpoint, "response_type": type(data).__name__}
            )
            raise ValueError(
                f"API returned unexpected format for kanji details. "
                f"Expected dictionary, got {type(data).__name__}"
            )

        # Check for required top-level fields
        required_fields = ['kanji']
        missing = [f for f in required_fields if f not in data]
        if missing:
            logger.warning(
                f"Kanji detail response missing fields: {missing}",
                extra={"available_fields": list(data.keys())}
            )


def _validate_response_not_empty(data: Any, query_info: str) -> None:
    """
    Validate that response data is not empty.

    Args:
        data: Response data from API
        query_info: Description of the query for error messages

    Raises:
        ValueError: If response is empty when it shouldn't be
    """
    if isinstance(data, list) and len(data) == 0:
        logger.info(f"Empty result set for query: {query_info}")
        # Don't raise - empty results are valid for searches
    elif isinstance(data, dict) and not data:
        raise ValueError(
            f"API returned empty response for {query_info}. "
            f"The kanji may not exist in the database."
        )
    elif data is None:
        raise ValueError(
            f"API returned null response for {query_info}. "
            f"This may indicate a server error."
        )


def _handle_api_error(e: Exception) -> None:
    """
    Handle API errors by raising ToolError with formatted message.

    Per MCP spec SEP-1303, tool errors should use isError=True to enable
    LLM self-correction. Raising ToolError causes the SDK to set isError=True
    in the response.

    Args:
        e: The exception that occurred

    Raises:
        ToolError: Always raises with formatted error message
    """
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code == 404:
            raise ToolError(
                "Resource not found. The kanji may not be in the database, "
                "or the search parameters didn't match any results. "
                "Kanji Alive supports 1,235 kanji taught in Japanese elementary schools."
            )
        elif e.response.status_code == 400:
            raise ToolError(
                "Invalid request. Please check that your search parameters are correct. "
                "For readings, use romaji or appropriate Japanese characters."
            )
        elif e.response.status_code == 429:
            raise ToolError("Rate limit exceeded. Please wait a moment before making more requests.")
        elif e.response.status_code >= 500:
            raise ToolError("Kanji Alive server error. Please try again later.")
        raise ToolError(f"API request failed with status {e.response.status_code}: {e.response.text}")
    elif isinstance(e, httpx.TimeoutException):
        raise ToolError("Request timed out. The Kanji Alive API may be experiencing issues. Please try again.")
    elif isinstance(e, httpx.RequestError):
        raise ToolError("Network error. Please check your internet connection.")

    # Log full details for debugging
    logger.error(
        f"Unexpected error in API request: {type(e).__name__}",
        exc_info=True,
        extra={
            "error_type": type(e).__name__,
            "error_message": str(e)
        }
    )

    # Raise sanitized error message to user
    raise ToolError(
        "An unexpected error occurred while processing your request. "
        "Please try again. If the problem persists, check the server logs for details."
    )


def _format_search_results_markdown(
    results: List[Dict[str, Any]],
    metadata: Optional[SearchResultMetadata] = None
) -> str:
    """
    Format search results in markdown for human readability.

    Note: The API does not expose a canonical total result count;
    we display the number of results actually returned.

    Args:
        results: List of kanji objects from the API
        metadata: SearchResultMetadata object (optional)

    Returns:
        Markdown-formatted string
    """
    if not results:
        return "No kanji found matching your search criteria."

    output = f"# Kanji Search Results\n\n"
    
    # Add completeness metadata section if available
    if metadata:
        output += metadata.to_markdown_header()
    else:
        # Fallback if metadata not provided
        output += (
            f"## Result Information\n\n"
            f"- **Results Found:** {len(results)}\n\n"
        )
    
    # Main results table
    output += "| Kanji | Meaning | Strokes | Grade | Radical | Radical Strokes |\n"
    output += "|-------|---------|---------|-------|---------|------------------|\n"
    
    for kanji in results:
        char = kanji.get('kanji', {}).get('character', '?')
        meaning = kanji.get('kanji', {}).get('meaning', {}).get('english', 'N/A')
        strokes = kanji.get('kanji', {}).get('strokes', {}).get('count', 'N/A')
        grade = kanji.get('kanji', {}).get('grade', 'N/A')

        # Get readings
        onyomi_list = kanji.get('kanji', {}).get('onyomi', {}).get('katakana', [])
        kunyomi_list = kanji.get('kanji', {}).get('kunyomi', {}).get('hiragana', [])

        onyomi = ', '.join(onyomi_list) if onyomi_list else 'None'
        kunyomi = ', '.join(kunyomi_list) if kunyomi_list else 'None'

        # Get radical info
        radical = kanji.get('radical', {})
        radical_char = radical.get('character', 'N/A')
        radical_strokes = radical.get('strokes', 'N/A')

        # Escape dynamic content for Markdown safety
        output += f"| {char} | {_escape_markdown(meaning)} | {strokes} | {grade} | {radical_char} | {radical_strokes} |\n"

    output += f"\n**Total Results Shown:** {len(results)}\n"

    return output


def _format_kanji_detail_markdown(kanji: Dict[str, Any]) -> str:
    """
    Format detailed kanji information in markdown.

    Args:
        kanji: Kanji object from the API

    Returns:
        Markdown-formatted string with comprehensive kanji details
    """
    char = kanji.get('kanji', {}).get('character', '?')
    k_info = kanji.get('kanji', {})
    meaning = k_info.get('meaning', {}).get('english', 'N/A')
    strokes = k_info.get('strokes', {}).get('count', 'N/A')
    grade = k_info.get('grade', 'N/A')

    output = f"# {char} - Kanji Details\n\n"
    output += f"**Meaning:** {_escape_markdown(meaning)}\n\n"

    # Basic info
    output += "## Basic Information\n\n"
    output += f"- **Strokes:** {strokes}\n"
    output += f"- **Grade:** {grade if grade else 'Not taught in elementary school'}\n\n"

    # Readings
    output += "## Readings\n\n"

    onyomi = k_info.get('onyomi', {})
    if onyomi:
        onyomi_kata = onyomi.get('katakana', [])
        onyomi_roma = onyomi.get('romaji', [])
        if onyomi_kata:
            output += "**Onyomi (音読み):**\n"
            for kata, roma in zip(onyomi_kata, onyomi_roma):
                output += f"- {kata} ({roma})\n"
            output += "\n"

    kunyomi = k_info.get('kunyomi', {})
    if kunyomi:
        kunyomi_hira = kunyomi.get('hiragana', [])
        kunyomi_roma = kunyomi.get('romaji', [])
        if kunyomi_hira:
            output += "**Kunyomi (訓読み):**\n"
            for hira, roma in zip(kunyomi_hira, kunyomi_roma):
                output += f"- {hira} ({roma})\n"
            output += "\n"

    # Radical
    radical = kanji.get('radical', {})
    if radical:
        output += "## Radical\n\n"
        rad_char = radical.get('character', 'N/A')
        rad_meaning = radical.get('meaning', {}).get('english', 'N/A')
        rad_strokes = radical.get('strokes', 'N/A')
        rad_name_hira = radical.get('name', {}).get('hiragana', 'N/A')
        rad_name_roma = radical.get('name', {}).get('romaji', 'N/A')
        rad_position = radical.get('position', {}).get('hiragana', '')

        output += f"- **Character:** {rad_char}\n"
        output += f"- **Meaning:** {_escape_markdown(rad_meaning)}\n"
        output += f"- **Name:** {rad_name_hira} ({_escape_markdown(rad_name_roma)})\n"
        output += f"- **Strokes:** {rad_strokes}\n"
        if rad_position:
            output += f"- **Position:** {rad_position}\n"
        output += "\n"

    # Dictionary references
    refs = kanji.get('references', {})
    if refs:
        output += "## Dictionary References\n\n"
        if refs.get('kodansha'):
            output += f"- **Kodansha:** {refs['kodansha']}\n"
        if refs.get('classic_nelson'):
            output += f"- **Classic Nelson:** {refs['classic_nelson']}\n"
        output += "\n"

    # Examples
    examples = kanji.get('examples', [])
    if examples:
        output += "## Example Words\n\n"
        for ex in examples:  # Show ALL examples - no truncation
            japanese = ex.get('japanese', '')
            meaning_en = ex.get('meaning', {}).get('english', '')
            audio = ex.get('audio', {})
            audio_url = audio.get('opus', '') or audio.get('aac', '') or audio.get('ogg', '')

            output += f"### {_escape_markdown(japanese)}\n"
            output += f"**Meaning:** {_escape_markdown(meaning_en)}\n"
            if audio_url:
                output += f"**Audio:** <{audio_url}>\n"
            output += "\n"

    return output


def _extract_fields_from_results(results: List[Dict[str, Any]]) -> List[str]:
    """
    Extract all unique field names present in kanji results.
    
    This function examines the actual structure of returned data to identify
    which fields are available. This prevents assumptions about data structure.
    
    Args:
        results: List of kanji objects from API
    
    Returns:
        List of unique top-level field names found in results
    """
    if not results:
        return []
    
    fields = set()
    for kanji in results:
        fields.update(kanji.keys())
    
    return sorted(list(fields))


def _create_search_metadata(
    results: List[Dict[str, Any]],
    query_params: Dict[str, Any],
    request_info: Dict[str, Any]
) -> SearchResultMetadata:
    """
    Create metadata object for search results.

    Args:
        results: List of kanji returned from API
        query_params: Query parameters used in search
        request_info: Request metadata (endpoint, timestamp)

    Returns:
        SearchResultMetadata object with result information
    """
    fields = _extract_fields_from_results(results)

    metadata = SearchResultMetadata(
        results_returned=len(results),
        fields_included=fields,
        timestamp=request_info['timestamp'],
        query_parameters=query_params
    )

    return metadata


# ============================================================================
# MCP Tools
# ============================================================================

@mcp.tool(
    name="kanjialive_search_basic",
    title="Basic Kanji Search",
    annotations={
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True
    }
)
async def kanjialive_search_basic(params: KanjiBasicSearchInput, ctx: Context) -> KanjiSearchOutput:
    """
    Search for kanji using a simple search term.

    This tool performs a basic search on the Kanji Alive database and returns
    all matching results from the API.

    Valid search terms include:
    - A single kanji character (e.g., 親, 見, 日)
    - An Onyomi reading in katakana (e.g., シン, ケン)
    - A Kunyomi reading in hiragana (e.g., おや, みる)
    - An English meaning (e.g., parent, see, day)

    The Kanji Alive database contains 1,235 kanji taught in Japanese elementary schools.

    Args:
        params (KanjiBasicSearchInput): Search parameters containing:
            - query (str): The search term
        ctx: MCP context for logging and accessing lifespan resources

    Returns:
        KanjiSearchOutput: Structured search results with metadata
    """
    try:
        # Get HTTP client from lifespan context
        client = ctx.request_context.lifespan_context.client

        await ctx.info(f"Basic search: {params.query}")
        encoded_query = quote(params.query, safe='')
        results, request_info = await _make_api_request(client, f"search/{encoded_query}")

        # Validate not empty for non-search terms
        _validate_response_not_empty(results, f"query '{params.query}'")

        # Ensure results is a list
        if not isinstance(results, list):
            results = [results]

        # Create metadata for this search
        metadata = _create_search_metadata(
            results=results,
            query_params={"query": params.query},
            request_info=request_info
        )

        await ctx.info(f"Basic search returned {metadata.results_returned} results")

        return KanjiSearchOutput(metadata=metadata, results=results)

    except Exception as e:
        await ctx.error(f"Tool execution error: {type(e).__name__}")
        logger.error(
            f"Tool execution error: {type(e).__name__}",
            exc_info=True,
            extra={
                "tool": "kanjialive_search_basic",
                "params": params.model_dump()
            }
        )
        _handle_api_error(e)


@mcp.tool(
    name="kanjialive_search_advanced",
    title="Advanced Kanji Search",
    annotations={
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True
    }
)
async def kanjialive_search_advanced(params: KanjiAdvancedSearchInput, ctx: Context) -> KanjiSearchOutput:
    """
    Search for kanji using multiple filter criteria.

    This tool provides advanced search capabilities with multiple filter options that can be
    combined to narrow down results. You can search by kanji properties, readings, meanings,
    radical characteristics, stroke counts, and grade levels.

    Available search parameters:
    - on: Onyomi reading (romaji or katakana) - e.g., "shin" or "シン"
    - kun: Kunyomi reading (romaji or hiragana) - e.g., "oya" or "おや"
    - kem: Kanji English meaning - e.g., "parent", "see"
    - ks: Kanji stroke number (1-30) - e.g., 5, 16
    - kanji: Specific kanji character - e.g., "親", "見"
    - rjn: Radical Japanese name (romaji or hiragana) - e.g., "miru" or "みる"
    - rem: Radical English meaning - e.g., "see", "fire", "water"
    - rs: Radical stroke number (1-17) - e.g., 3, 7
    - rpos: Radical position - hen, tsukuri, kanmuri, ashi, kamae, tare, nyou
    - grade: School grade level (1-6) where kanji is taught

    Multiple parameters can be combined for precise searches. For example, you can search for
    all 5-stroke kanji that are taught in grade 1, or all kanji using a specific radical.

    Args:
        params (KanjiAdvancedSearchInput): Advanced search parameters
        ctx: MCP context for logging and accessing lifespan resources

    Returns:
        KanjiSearchOutput: Structured search results with metadata
    """
    try:
        # Get HTTP client from lifespan context
        client = ctx.request_context.lifespan_context.client

        if not params.has_any_filter():
            raise ToolError(
                "At least one search parameter must be provided. "
                "Available parameters: on, kun, kem, ks, kanji, rjn, rem, rs, rpos, grade. "
                "For simple searches, use kanjialive_search_basic instead."
            )

        # Build query parameters
        query_params = {}
        if params.on:
            query_params['on'] = params.on
        if params.kun:
            query_params['kun'] = params.kun
        if params.kem:
            query_params['kem'] = params.kem
        if params.ks is not None:
            query_params['ks'] = params.ks
        if params.kanji:
            query_params['kanji'] = params.kanji
        if params.rjn:
            query_params['rjn'] = params.rjn
        if params.rem:
            query_params['rem'] = params.rem
        if params.rs is not None:
            query_params['rs'] = params.rs
        if params.rpos:
            query_params['rpos'] = params.rpos
        if params.grade is not None:
            query_params['grade'] = params.grade

        await ctx.info(f"Advanced search: {query_params}")
        results, request_info = await _make_api_request(client, "search/advanced", params=query_params)

        # Ensure results is a list (empty list is valid for no matches)
        if not results:
            results = []
        elif not isinstance(results, list):
            results = [results]

        # Create metadata for this search
        metadata = _create_search_metadata(
            results=results,
            query_params=query_params,
            request_info=request_info
        )

        await ctx.info(
            f"Advanced search returned {metadata.results_returned} results "
            f"matching criteria {query_params}"
        )

        return KanjiSearchOutput(metadata=metadata, results=results)

    except ToolError:
        # Re-raise ToolError as-is (it's already properly formatted)
        raise
    except Exception as e:
        await ctx.error(f"Tool execution error: {type(e).__name__}")
        logger.error(
            f"Tool execution error: {type(e).__name__}",
            exc_info=True,
            extra={
                "tool": "kanjialive_search_advanced",
                "params": params.model_dump()
            }
        )
        _handle_api_error(e)


@mcp.tool(
    name="kanjialive_get_kanji_details",
    title="Get Kanji Details",
    annotations={
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True
    }
)
async def kanjialive_get_kanji_details(params: KanjiDetailInput, ctx: Context) -> KanjiDetailOutput:
    """
    Get comprehensive information about a specific kanji character.

    This tool retrieves all available information for a single kanji from the Kanji Alive database.
    The detailed information includes:

    - Basic properties: meaning, stroke count, grade level
    - Readings: Onyomi (音読み) and Kunyomi (訓読み) in both kana and romaji
    - Radical information: character, meaning, name, strokes, position
    - Dictionary references: Kodansha and Classic Nelson reference numbers
    - Example words: Common compound words using the kanji with translations and audio
    - Stroke order data: Timing information for stroke animations
    - Video references: URLs for stroke order animations

    The API does not provide mnemonic hints through this endpoint, but all other information
    from the Kanji Alive web application is available.

    Args:
        params (KanjiDetailInput): Parameters containing:
            - character (str): The kanji character to look up
        ctx: MCP context for logging and accessing lifespan resources

    Returns:
        KanjiDetailOutput: Comprehensive kanji information including readings, radical, examples

    Example usage:
        - Get details for 親: character="親"
        - Get details for 見: character="見"
        - Get details for 日: character="日"
    """
    try:
        # Get HTTP client from lifespan context
        client = ctx.request_context.lifespan_context.client

        await ctx.info(f"Get kanji details: {params.character}")
        kanji_data, request_info = await _make_api_request(client, f"kanji/{params.character}")

        # Validate not empty
        _validate_response_not_empty(kanji_data, f"kanji '{params.character}'")

        return KanjiDetailOutput(
            metadata=KanjiDetailMetadata(
                timestamp=request_info['timestamp'],
                endpoint=request_info['endpoint']
            ),
            kanji=kanji_data
        )

    except Exception as e:
        await ctx.error(f"Tool execution error: {type(e).__name__}")
        logger.error(
            f"Tool execution error: {type(e).__name__}",
            exc_info=True,
            extra={
                "tool": "kanjialive_get_kanji_details",
                "params": params.model_dump()
            }
        )
        _handle_api_error(e)


# ============================================================================
# MCP Resources
# ============================================================================

@mcp.resource("kanjialive://info/radical-positions")
async def radical_positions_resource() -> str:
    """
    Reference documentation for valid radical position codes.

    Use this resource to understand the valid values for the 'rpos' parameter
    in advanced kanji searches. Radical position indicates where the radical
    appears within the kanji character.
    """
    return json.dumps({
        "description": "Valid radical position codes for the rpos parameter in advanced search",
        "positions": {
            "hen": {
                "meaning": "Left side of kanji",
                "hiragana": "へん",
                "example": "The water radical (氵) is hen in 海 (sea)"
            },
            "tsukuri": {
                "meaning": "Right side of kanji",
                "hiragana": "つくり",
                "example": "力 is tsukuri in 動 (move)"
            },
            "kanmuri": {
                "meaning": "Top/crown of kanji",
                "hiragana": "かんむり",
                "example": "艹 (grass) is kanmuri in 花 (flower)"
            },
            "ashi": {
                "meaning": "Bottom/legs of kanji",
                "hiragana": "あし",
                "example": "儿 is ashi in 見 (see)"
            },
            "kamae": {
                "meaning": "Enclosure/frame of kanji",
                "hiragana": "かまえ",
                "example": "門 is kamae in 間 (between)"
            },
            "tare": {
                "meaning": "Top-left hanging element",
                "hiragana": "たれ",
                "example": "广 is tare in 店 (shop)"
            },
            "nyou": {
                "meaning": "Bottom-left to right element",
                "hiragana": "にょう",
                "example": "辶 is nyou in 道 (road)"
            }
        },
        "input_formats": ["romaji (lowercase)", "hiragana"],
        "usage_example": "Use kanjialive_search_advanced with rpos='hen' to find kanji with left-side radicals"
    }, ensure_ascii=False, indent=2)


@mcp.resource("kanjialive://info/search-parameters")
async def search_parameters_resource() -> str:
    """
    Documentation for advanced search parameters.

    Use this resource to understand all available parameters for
    the kanjialive_search_advanced tool and how to use them effectively.
    """
    return json.dumps({
        "description": "Advanced search parameters for kanjialive_search_advanced tool",
        "parameters": {
            "on": {
                "description": "Onyomi (Chinese-derived) reading",
                "format": "romaji or katakana",
                "examples": ["shin", "シン", "ken", "ケン"],
                "notes": "Do not mix romaji and katakana in the same query"
            },
            "kun": {
                "description": "Kunyomi (native Japanese) reading",
                "format": "romaji or hiragana",
                "examples": ["oya", "おや", "mi.ru", "みる"],
                "notes": "Dots indicate okurigana boundaries in romaji"
            },
            "kem": {
                "description": "Kanji English meaning",
                "format": "English word(s)",
                "examples": ["parent", "see", "water", "fire"],
                "notes": "Partial matches are supported"
            },
            "ks": {
                "description": "Kanji stroke count",
                "format": "integer",
                "range": "1-30",
                "examples": [5, 10, 16]
            },
            "kanji": {
                "description": "Specific kanji character",
                "format": "single kanji character",
                "examples": ["親", "見", "日"],
                "notes": "Use for exact character lookup"
            },
            "rjn": {
                "description": "Radical Japanese name",
                "format": "romaji or hiragana",
                "examples": ["miru", "みる", "hi", "ひ"],
                "notes": "The traditional name of the radical"
            },
            "rem": {
                "description": "Radical English meaning",
                "format": "English word",
                "examples": ["see", "fire", "water", "person"],
                "notes": "Useful for finding kanji by radical concept"
            },
            "rs": {
                "description": "Radical stroke count",
                "format": "integer",
                "range": "1-17",
                "examples": [3, 7, 4]
            },
            "rpos": {
                "description": "Radical position within the kanji",
                "format": "romaji or hiragana",
                "values": ["hen", "tsukuri", "kanmuri", "ashi", "kamae", "tare", "nyou"],
                "see_also": "kanjialive://info/radical-positions for detailed position descriptions"
            },
            "grade": {
                "description": "Japanese school grade level where kanji is taught",
                "format": "integer",
                "range": "1-6",
                "notes": "Corresponds to Japanese elementary school grades"
            }
        },
        "combination_examples": [
            {
                "description": "Find all 5-stroke kanji taught in grade 1",
                "parameters": {"ks": 5, "grade": 1}
            },
            {
                "description": "Find kanji with the 'water' radical on the left side",
                "parameters": {"rem": "water", "rpos": "hen"}
            },
            {
                "description": "Find kanji with onyomi reading 'shin'",
                "parameters": {"on": "shin"}
            }
        ],
        "notes": [
            "Multiple parameters can be combined for precise searches",
            "All string parameters are case-insensitive for romaji",
            "Database contains 1,235 kanji from Japanese elementary schools (grades 1-6)",
            "At least one parameter must be provided for advanced search"
        ]
    }, ensure_ascii=False, indent=2)


# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Validate API key on startup
    try:
        _get_api_headers()
        logger.info("API key validated successfully")
    except ValueError as e:
        logger.error(str(e))
        sys.exit(1)

    mcp.run()
