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
import re
from enum import Enum
from typing import Optional, List, Dict, Any, Tuple

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, field_validator, ConfigDict

# Constants
API_BASE_URL = "https://kanjialive-api.p.rapidapi.com/api/public"
REQUEST_TIMEOUT = 30.0

# RapidAPI Configuration
# IMPORTANT: Set your RapidAPI key via environment variable or replace the default value
# Get your free API key at: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji
import os
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "YOUR_RAPIDAPI_KEY_HERE")
RAPIDAPI_HOST = "kanjialive-api.p.rapidapi.com"

# API Headers for RapidAPI authentication
USER_AGENT = "kanjialive-mcp/1.0 (+https://github.com/kanjialive-mcp-server)"
API_HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
    "User-Agent": USER_AGENT
}

# Logger (configured in main)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP("kanjialive_mcp")

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


class ResponseFormat(str, Enum):
    """Output format for tool responses."""
    MARKDOWN = "markdown"
    JSON = "json"


class SortMode(str, Enum):
    """Sort mode for search results."""
    KANJI_STROKE = "kanji"  # Sort by kanji stroke number
    RADICAL_STROKE = "radical"  # Sort by radical stroke number


# ============================================================================
# Pydantic Input Models
# ============================================================================

class KanjiBasicSearchInput(BaseModel):
    """Input model for basic kanji search."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid'
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
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="Output format: 'markdown' for human-readable or 'json' for structured data"
    )


class KanjiAdvancedSearchInput(BaseModel):
    """Input model for advanced kanji search with multiple filter parameters."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid'
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
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="Output format: 'markdown' for human-readable or 'json' for structured data"
    )

    @field_validator('on')
    @classmethod
    def validate_onyomi(cls, v: Optional[str]) -> Optional[str]:
        """Validate Onyomi reading format (romaji or katakana only)."""
        if v is None:
            return v

        v = v.strip()

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

        v = v.strip()

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
        extra='forbid'
    )

    character: str = Field(
        ...,
        description="The kanji character to look up (親, 見, 日)",
        min_length=1,
        max_length=1
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="Output format: 'markdown' for human-readable or 'json' for structured data"
    )


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
# Shared Utility Functions
# ============================================================================

async def _make_api_request(
    endpoint: str,
    params: Optional[Dict[str, Any]] = None
) -> Tuple[Any, Dict[str, Any]]:
    """
    Make an API request to Kanji Alive via RapidAPI.

    This function returns BOTH the API response AND metadata about the request.

    Args:
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

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, headers=API_HEADERS) as client:
        last_exception = None

        for attempt in range(1, max_retries + 1):
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()

                # Track request metadata
                request_info = {
                    "endpoint": endpoint,
                    "params": params or {},
                    "timestamp": datetime.datetime.now().isoformat()
                }

                return response.json(), request_info

            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                # Retry on rate limiting (429) and server errors (5xx)
                if status == 429 or 500 <= status < 600:
                    last_exception = e
                    if attempt < max_retries:
                        logger.warning(
                            f"Request failed with status {status}, "
                            f"retrying in {backoff}s (attempt {attempt}/{max_retries})"
                        )
                        await asyncio.sleep(backoff)
                        backoff *= 2  # Exponential backoff
                        continue
                # For other HTTP errors, don't retry
                raise

            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                last_exception = e
                if attempt < max_retries:
                    logger.warning(
                        f"Network error: {type(e).__name__}, "
                        f"retrying in {backoff}s (attempt {attempt}/{max_retries})"
                    )
                    await asyncio.sleep(backoff)
                    backoff *= 2  # Exponential backoff
                    continue
                # If this was the last attempt, raise
                raise

        # If we exhausted all retries, raise the last exception
        if last_exception:
            raise last_exception
        raise httpx.HTTPError("Request failed after retries")


def _handle_api_error(e: Exception) -> str:
    """
    Format API errors consistently for all tools.

    Args:
        e: The exception that occurred

    Returns:
        Formatted error message
    """
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code == 404:
            return (
                "Error: Resource not found. The kanji may not be in the database, "
                "or the search parameters didn't match any results. "
                "Kanji Alive supports 1,235 kanji taught in Japanese elementary schools."
            )
        elif e.response.status_code == 400:
            return (
                "Error: Invalid request. Please check that your search parameters are correct. "
                "For readings, use romaji or appropriate Japanese characters."
            )
        elif e.response.status_code == 429:
            return "Error: Rate limit exceeded. Please wait a moment before making more requests."
        elif e.response.status_code >= 500:
            return "Error: Kanji Alive server error. Please try again later."
        return f"Error: API request failed with status {e.response.status_code}: {e.response.text}"
    elif isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out. The Kanji Alive API may be experiencing issues. Please try again."
    elif isinstance(e, httpx.NetworkError):
        return "Error: Network error. Please check your internet connection."
    return f"Error: Unexpected error occurred: {type(e).__name__} - {str(e)}"


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
    output += "|-------|---------|---------|-------|---------|-----------------|​\n"
    
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
    annotations={
        "title": "Basic Kanji Search",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True
    }
)
async def kanjialive_search_basic(params: KanjiBasicSearchInput) -> str:
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
            - response_format (str): Output format ('markdown' or 'json')

    Returns:
        str: Search results with metadata
    """
    try:
        logger.info(f"Basic search: {params.query}")
        results, request_info = await _make_api_request(f"search/{params.query}")

        # Ensure results is a list
        if not isinstance(results, list):
            results = [results]

        # Create metadata for this search
        metadata = _create_search_metadata(
            results=results,
            query_params={"query": params.query},
            request_info=request_info
        )

        logger.info(f"Basic search returned {metadata.results_returned} results")

        if params.response_format == ResponseFormat.JSON:
            return json.dumps({
                "metadata": metadata.model_dump(),
                "results": results
            }, ensure_ascii=False, indent=2)
        else:
            return _format_search_results_markdown(results, metadata)

    except Exception as e:
        logger.error(f"Basic search error: {e}")
        return _handle_api_error(e)


@mcp.tool(
    name="kanjialive_search_advanced",
    annotations={
        "title": "Advanced Kanji Search",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True
    }
)
async def kanjialive_search_advanced(params: KanjiAdvancedSearchInput) -> str:
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

    Returns:
        str: All kanji matching criteria with metadata
    """
    try:
        if not params.has_any_filter():
            return (
                "Error: At least one search parameter must be provided. "
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

        logger.info(f"Advanced search: {query_params}")
        results, request_info = await _make_api_request("search/advanced", params=query_params)

        if not results:
            return "No kanji found matching your search criteria. Try adjusting your filters."

        # Ensure results is a list
        if not isinstance(results, list):
            results = [results]

        # Create metadata for this search
        metadata = _create_search_metadata(
            results=results,
            query_params=query_params,
            request_info=request_info
        )

        logger.info(
            f"Advanced search returned {metadata.results_returned} results "
            f"matching criteria {query_params}"
        )

        if params.response_format == ResponseFormat.JSON:
            return json.dumps({
                "metadata": metadata.model_dump(),
                "results": results
            }, ensure_ascii=False, indent=2)
        else:
            return _format_search_results_markdown(results, metadata)

    except Exception as e:
        logger.error(f"Advanced search error: {e}")
        return _handle_api_error(e)


@mcp.tool(
    name="kanjialive_get_kanji_details",
    annotations={
        "title": "Get Kanji Details",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True
    }
)
async def kanjialive_get_kanji_details(params: KanjiDetailInput) -> str:
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
            - response_format (str): Output format ('markdown' or 'json')

    Returns:
        str: Comprehensive kanji information in the specified format. Markdown format provides
             a well-organized, human-readable display. JSON format includes all available data
             fields including stroke timings and media URLs.

    Example usage:
        - Get details for 親: character="親"
        - Get details for 見: character="見"
        - Get details for 日: character="日"
    """
    try:
        logger.info(f"Get kanji details: {params.character}")
        kanji_data, request_info = await _make_api_request(f"kanji/{params.character}")

        if params.response_format == ResponseFormat.JSON:
            # Harmonize with search output structure
            return json.dumps({
                "metadata": {
                    "timestamp": request_info['timestamp'],
                    "endpoint": request_info['endpoint']
                },
                "kanji": kanji_data
            }, ensure_ascii=False, indent=2)
        else:
            return _format_kanji_detail_markdown(kanji_data)

    except Exception as e:
        logger.error(f"Get kanji details error: {e}")
        return _handle_api_error(e)


# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Warn if API key is not configured
    if RAPIDAPI_KEY == "YOUR_RAPIDAPI_KEY_HERE":
        logger.warning("=" * 80)
        logger.warning("WARNING: RapidAPI key not configured!")
        logger.warning("Please set the RAPIDAPI_KEY environment variable or update the script.")
        logger.warning("Get your free API key at:")
        logger.warning("https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji")
        logger.warning("=" * 80)

    mcp.run()
