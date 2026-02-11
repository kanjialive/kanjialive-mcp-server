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
import os
import random
import re
import sys
import unicodedata
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import quote

import httpx
from mcp.server.fastmcp import FastMCP, Context
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel, Field, field_validator, ConfigDict

# Constants
API_BASE_URL = "https://kanjialive-api.p.rapidapi.com/api/public"
REQUEST_TIMEOUT = 30.0
RAPIDAPI_HOST = "kanjialive-api.p.rapidapi.com"
USER_AGENT = "kanjialive-mcp/1.0 (+https://github.com/kanjialive-mcp-server)"

# Logger (configured in main)
logger = logging.getLogger(__name__)

# Data directory for bundled reference data
DATA_DIR = Path(__file__).parent / "data"

# Cached radicals data (loaded once on first access)
_RADICALS_CACHE: Optional[Dict[str, Any]] = None


def _load_radicals_data_from_file() -> Dict[str, Any]:
    """
    Load the Japanese radicals reference data from bundled JSON file.

    This is the actual file loading logic, called once during server startup.
    After startup, use _get_radicals_cache() to access the cached data.

    Returns:
        Dict containing radicals data with metadata and radical entries

    Raises:
        FileNotFoundError: If the radicals JSON file is missing
        json.JSONDecodeError: If the JSON file is corrupted
    """
    radicals_file = DATA_DIR / "japanese-radicals.json"

    if not radicals_file.exists():
        raise FileNotFoundError(
            f"Radicals data file not found: {radicals_file}. "
            f"Run 'python extras/scripts/convert_radicals_csv.py' to generate it."
        )

    try:
        with open(radicals_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(
            f"Corrupted radicals data file: {radicals_file}. "
            f"The JSON file is malformed and cannot be parsed. "
            f"Original error: {e.msg}",
            e.doc,
            e.pos
        )

    logger.info(f"Loaded {data.get('total_entries', 0)} radicals from {radicals_file}")
    return data


def _get_radicals_cache() -> Dict[str, Any]:
    """
    Get the radicals cache, which must have been initialized at startup.

    Returns:
        Dict containing radicals data

    Raises:
        RuntimeError: If cache was not initialized during server startup
    """
    if _RADICALS_CACHE is None:
        raise RuntimeError(
            "Radicals cache not initialized. "
            "This should have been loaded during server startup."
        )
    return _RADICALS_CACHE



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

    Also initializes the radicals cache at startup to:
    - Fail fast if the data file is missing or corrupted
    - Avoid race conditions from lazy-loading
    """
    global _RADICALS_CACHE

    # Load radicals cache at startup (fail-fast on missing/corrupted file)
    try:
        _RADICALS_CACHE = _load_radicals_data_from_file()
        logger.info("Radicals cache initialized successfully")
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.error(f"Failed to load radicals data: {e}")
        raise

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

# Markdown escaping - characters that have special meaning in markdown
# Includes: \ ` * _ { } [ ] ( ) # + - . ! | > < ~
# Note: We escape all these characters conservatively to prevent formatting issues.
# While some characters only have special meaning in specific contexts (e.g., - and .
# at line start for lists), escaping them everywhere is safer for untrusted content.
_MD_SPECIAL = re.compile(r'([\\`*_{}[\]()#+\-.!|><~])')

def _escape_markdown(text: str) -> str:
    """
    Escape special Markdown characters to prevent formatting issues.

    Escapes characters that could be interpreted as markdown formatting:
    - Backslash, backticks, asterisks, underscores (emphasis/code)
    - Brackets, parentheses (links/images)
    - Hash, plus, minus, period (headers/lists)
    - Exclamation, pipe, greater/less than (images/tables/HTML)
    - Tilde (strikethrough in some flavors)

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


def _validate_no_control_chars(text: str, field_name: str = "input") -> str:
    """
    Validate that text does not contain null bytes or control characters.

    Control characters (U+0000-U+001F, U+007F-U+009F) can cause issues with
    HTTP libraries, URLs, and downstream systems. This rejects them early
    with a clear error message.

    Args:
        text: Text to validate
        field_name: Name of the field for error messages

    Returns:
        The original text if valid

    Raises:
        ValueError: If text contains control characters
    """
    # Check for null bytes explicitly (most dangerous)
    if '\x00' in text:
        raise ValueError(
            f"Invalid {field_name}: contains null byte (\\x00). "
            f"Please remove any null characters from your input."
        )

    # Check for other control characters (C0 and C1 control codes)
    for i, char in enumerate(text):
        code = ord(char)
        # C0 control codes (0x00-0x1F) except common whitespace (tab, newline, carriage return)
        if code < 0x20 and code not in (0x09, 0x0A, 0x0D):
            raise ValueError(
                f"Invalid {field_name}: contains control character (U+{code:04X}) at position {i}. "
                f"Please use only printable characters."
            )
        # C1 control codes (0x7F-0x9F)
        if 0x7F <= code <= 0x9F:
            raise ValueError(
                f"Invalid {field_name}: contains control character (U+{code:04X}) at position {i}. "
                f"Please use only printable characters."
            )

    return text


def _is_kanji_character(char: str) -> bool:
    """
    Check if a character is a valid kanji (CJK ideograph).

    Validates against Unicode blocks commonly containing kanji:
    - CJK Unified Ideographs (U+4E00–U+9FFF): Main kanji block
    - CJK Unified Ideographs Extension A (U+3400–U+4DBF): Rare kanji

    Args:
        char: A single character to validate

    Returns:
        True if the character is a kanji, False otherwise
    """
    if len(char) != 1:
        return False
    code_point = ord(char)
    # CJK Unified Ideographs (common kanji)
    if 0x4E00 <= code_point <= 0x9FFF:
        return True
    # CJK Unified Ideographs Extension A (rare kanji)
    if 0x3400 <= code_point <= 0x4DBF:
        return True
    return False



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
            "an Onyomi (on) reading in katakana (シン), "
            "a Kunyomi (kun) reading in hiragana (おや), "
            "or an English meaning (parent)"
        ),
        min_length=1,
        max_length=100
    )

    @field_validator('query')
    @classmethod
    def validate_and_normalize_query(cls, v: str) -> str:
        """Validate and normalize query string."""
        v = v.strip()
        # Reject control characters (null bytes, etc.) before processing
        _validate_no_control_chars(v, "query")
        return _normalize_japanese_text(v)


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
        description="Onyomi (on) reading in romaji or katakana (shin, シン)"
    )
    kun: Optional[str] = Field(
        default=None,
        description="Kunyomi (kun) reading in romaji or hiragana (oya, おや)"
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
    list: Optional[str] = Field(
        default=None,
        description=(
            "Study list to search within. "
            "Values: 'ap' (Advanced Placement Exam), 'mac' (Macquarie University). "
            "Can include chapter: 'ap:c3' for AP chapter 3, 'mac:c12' for Macquarie chapter 12."
        )
    )

    @field_validator('list')
    @classmethod
    def validate_study_list(cls, v: Optional[str]) -> Optional[str]:
        """Validate study list format."""
        if v is None:
            return v

        v = v.strip().lower()

        # Valid base lists
        valid_lists = {'ap', 'mac'}

        # Check for base list or list:chapter format
        if ':' in v:
            parts = v.split(':')
            if len(parts) != 2:
                raise ValueError(
                    f"Invalid study list format '{v}'. "
                    f"Use 'ap', 'mac', 'ap:c3', or 'mac:c12'."
                )
            base_list, chapter = parts
            if base_list not in valid_lists:
                raise ValueError(
                    f"Invalid study list '{base_list}'. "
                    f"Valid lists: 'ap' (Advanced Placement), 'mac' (Macquarie)."
                )
            # Validate chapter format (should be 'c' followed by number)
            if not re.match(r'^c\d+$', chapter):
                raise ValueError(
                    f"Invalid chapter format '{chapter}'. "
                    f"Use format 'c1', 'c2', 'c12', etc."
                )
        else:
            if v not in valid_lists:
                raise ValueError(
                    f"Invalid study list '{v}'. "
                    f"Valid lists: 'ap' (Advanced Placement), 'mac' (Macquarie)."
                )

        return v

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

    @field_validator('kanji')
    @classmethod
    def validate_kanji_character(cls, v: Optional[str]) -> Optional[str]:
        """Validate that the kanji field contains a valid kanji character."""
        if v is None:
            return v

        v = _normalize_japanese_text(v.strip())

        if not _is_kanji_character(v):
            raise ValueError(
                f"Invalid kanji character '{v}'. "
                f"Must be a CJK ideograph (e.g., 親, 見, 日). "
                f"Hiragana, katakana, romaji, and other characters are not accepted."
            )

        return v

    def has_any_filter(self) -> bool:
        """Check if any search filter is provided."""
        fields = [self.on, self.kun, self.kem, self.ks, self.kanji,
                  self.rjn, self.rem, self.rs, self.rpos, self.grade, self.list]
        return any(f is not None for f in fields)


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
    def validate_and_normalize_character(cls, v: str) -> str:
        """Validate and normalize kanji character."""
        v = _normalize_japanese_text(v.strip())

        if not _is_kanji_character(v):
            raise ValueError(
                f"Invalid kanji character '{v}'. "
                f"Must be a CJK ideograph (e.g., 親, 見, 日). "
                f"Hiragana, katakana, romaji, and other characters are not accepted."
            )

        return v


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



def _jittered_delay(backoff: float, max_backoff: float) -> float:
    """
    Calculate a delay with 0-10% jitter, capped at max_backoff.

    Args:
        backoff: Current backoff value in seconds
        max_backoff: Maximum allowed delay in seconds

    Returns:
        Delay in seconds
    """
    base = min(backoff, max_backoff)
    jitter = random.uniform(0, base * 0.1)
    return min(base + jitter, max_backoff)


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

    max_retries = 3
    backoff = 0.5  # Initial backoff in seconds
    max_backoff = 30.0  # Maximum backoff cap in seconds

    last_exception = None

    for attempt in range(1, max_retries + 1):
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()

            response_data = response.json()

            try:
                _validate_search_response(response_data, endpoint)
            except ValueError as ve:
                logger.error(f"Response validation failed: {ve}")
                raise

            request_info = {
                "endpoint": endpoint,
                "params": dict(params) if params else {},
                "timestamp": datetime.datetime.now().isoformat()
            }

            return response_data, request_info

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 429 or 500 <= status < 600:
                last_exception = e
                if attempt < max_retries:
                    # Honor Retry-After header for 429 rate limiting
                    if status == 429:
                        retry_after = e.response.headers.get("Retry-After")
                        if retry_after and retry_after.isdigit():
                            delay = min(float(retry_after), max_backoff)
                            logger.warning(
                                f"Rate limited (429). Retry-After: {retry_after}s, "
                                f"waiting {delay}s (attempt {attempt}/{max_retries})"
                            )
                        else:
                            delay = _jittered_delay(backoff, max_backoff)
                            logger.warning(
                                f"Rate limited (429), no Retry-After header. "
                                f"Backoff: {delay:.2f}s (attempt {attempt}/{max_retries})"
                            )
                    else:
                        delay = _jittered_delay(backoff, max_backoff)
                        logger.warning(
                            f"Server error {status}, "
                            f"retrying in {delay:.2f}s (attempt {attempt}/{max_retries})"
                        )

                    await asyncio.sleep(delay)
                    backoff = min(backoff * 2, max_backoff)
                    continue
            raise

        except (httpx.RequestError, httpx.TimeoutException) as e:
            last_exception = e
            if attempt < max_retries:
                delay = _jittered_delay(backoff, max_backoff)
                logger.warning(
                    f"Network error: {type(e).__name__}, "
                    f"retrying in {delay:.2f}s (attempt {attempt}/{max_retries})"
                )
                await asyncio.sleep(delay)
                backoff = min(backoff * 2, max_backoff)
                continue
            raise

    if last_exception:
        raise last_exception
    raise httpx.HTTPError(
        f"Request failed after {max_retries} retries. "
        f"URL: {url}, params: {params}"
    )


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
                "Kanji Alive supports 1,235 kanji comprising those taught in Japanese elementary schools up to Grade 6 and those taught up to the level of N2 of the Japanese Language Proficiency Test conducted by the Japan Foundation."
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
        # For other status codes, sanitize the response text to avoid information disclosure
        # Log the full response for debugging, but only show status code to user
        logger.warning(
            f"API error {e.response.status_code}",
            extra={"response_text": e.response.text[:500] if e.response.text else ""}
        )
        raise ToolError(
            f"API request failed with status {e.response.status_code}. "
            f"Please check your request parameters and try again."
        )
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

    output = "# Kanji Search Results\n\n"

    if metadata:
        output += metadata.to_markdown_header()
    else:
        output += (
            f"## Result Information\n\n"
            f"- **Results Found:** {len(results)}\n\n"
        )

    # Search API returns minimal data: character, stroke count, and radical info
    output += "| Kanji | Strokes | Radical | Rad. Strokes | Rad. # |\n"
    output += "|-------|---------|---------|--------------|--------|\n"

    for kanji in results:
        char = kanji.get('kanji', {}).get('character', '?')
        # Search API uses 'stroke' (singular) as direct integer
        strokes = kanji.get('kanji', {}).get('stroke', 'N/A')

        radical = kanji.get('radical', {})
        radical_char = radical.get('character', 'N/A')
        radical_strokes = radical.get('stroke', 'N/A')
        radical_order = radical.get('order', 'N/A')

        output += f"| {char} | {strokes} | {radical_char} | {radical_strokes} | {radical_order} |\n"

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
    # Detail API strokes: object {count, timings, images} or integer (after filtering)
    strokes_raw = k_info.get('strokes')
    if isinstance(strokes_raw, dict):
        strokes = strokes_raw.get('count', 'N/A')
    else:
        strokes = strokes_raw if strokes_raw is not None else 'N/A'
    refs = kanji.get('references', {})
    grade = refs.get('grade', None)

    output = f"# {char} - Kanji Details\n\n"
    output += f"**Meaning:** {_escape_markdown(meaning)}\n\n"

    # Basic info
    output += "## Basic Information\n\n"
    output += f"- **Strokes:** {strokes}\n"
    output += f"- **Grade:** {grade if grade else 'Not taught in elementary school'}\n"

    # Stroke order video (mp4)
    video = k_info.get('video', {})
    video_mp4 = video.get('mp4', '')
    if video_mp4:
        output += f"- **Stroke Order Video:** <{video_mp4}>\n"
    output += "\n"

    # Readings - API returns comma-separated strings, not arrays
    output += "## Readings\n\n"

    onyomi = k_info.get('onyomi', {})
    if onyomi:
        # API returns strings like "ホウ" or "otozureru, tazuneru"
        onyomi_kata = onyomi.get('katakana', '')
        onyomi_roma = onyomi.get('romaji', '')
        if onyomi_kata:
            output += "**Onyomi (音読み):**\n"
            # Split comma-separated readings and pair them
            kata_parts = [k.strip() for k in onyomi_kata.split(',') if k.strip()]
            roma_parts = [r.strip() for r in onyomi_roma.split(',') if r.strip()]
            # Zip with fallback for mismatched lengths
            for i, kata in enumerate(kata_parts):
                roma = roma_parts[i] if i < len(roma_parts) else ''
                if roma:
                    output += f"- {kata} ({roma})\n"
                else:
                    output += f"- {kata}\n"
            output += "\n"

    kunyomi = k_info.get('kunyomi', {})
    if kunyomi:
        # API returns strings with Japanese comma (、) separation
        kunyomi_hira = kunyomi.get('hiragana', '')
        kunyomi_roma = kunyomi.get('romaji', '')
        if kunyomi_hira:
            output += "**Kunyomi (訓読み):**\n"
            # Split on Japanese comma (、) or regular comma
            hira_parts = [h.strip() for h in kunyomi_hira.replace('、', ',').split(',') if h.strip()]
            roma_parts = [r.strip() for r in kunyomi_roma.split(',') if r.strip()]
            for i, hira in enumerate(hira_parts):
                roma = roma_parts[i] if i < len(roma_parts) else ''
                if roma:
                    output += f"- {hira} ({roma})\n"
                else:
                    output += f"- {hira}\n"
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

    # Dictionary references (refs already fetched above for grade)
    if refs:
        output += "## Dictionary References\n\n"
        if refs.get('kodansha'):
            output += f"- **Kodansha:** {refs['kodansha']}\n"
        if refs.get('classic_nelson'):
            output += f"- **Classic Nelson:** {refs['classic_nelson']}\n"
        output += "\n"

    # Examples - limit to prevent overwhelming responses
    MAX_EXAMPLES = 15
    examples = kanji.get('examples', [])
    if examples:
        total_examples = len(examples)
        display_examples = examples[:MAX_EXAMPLES]

        if total_examples > MAX_EXAMPLES:
            output += f"## Example Words (showing {MAX_EXAMPLES} of {total_examples})\n\n"
        else:
            output += "## Example Words\n\n"

        for ex in display_examples:
            japanese = ex.get('japanese', '')
            meaning_en = ex.get('meaning', {}).get('english', '')
            audio = ex.get('audio', {})
            # Use mp3 format only for audio
            audio_url = audio.get('mp3', '')

            output += f"### {_escape_markdown(japanese)}\n"
            output += f"**Meaning:** {_escape_markdown(meaning_en)}\n"
            if audio_url:
                output += f"**Audio:** <{audio_url}>\n"
            output += "\n"

        if total_examples > MAX_EXAMPLES:
            output += f"*... and {total_examples - MAX_EXAMPLES} more examples not shown.*\n\n"

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
    
    return sorted(fields)


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
    return SearchResultMetadata(
        results_returned=len(results),
        fields_included=_extract_fields_from_results(results),
        timestamp=request_info['timestamp'],
        query_parameters=query_params
    )



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
    radical characteristics, stroke counts, grade levels, and study lists.

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
    - list: Study list - "ap" (Advanced Placement), "mac" (Macquarie), or with chapter "ap:c3"

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
                "Available parameters: on, kun, kem, ks, kanji, rjn, rem, rs, rpos, grade, list. "
                "For simple searches, use kanjialive_search_basic instead."
            )

        # Build query parameters from all non-None fields
        all_fields = ['on', 'kun', 'kem', 'ks', 'kanji', 'rjn', 'rem', 'rs', 'rpos', 'grade', 'list']
        query_params = {
            field: getattr(params, field)
            for field in all_fields
            if getattr(params, field) is not None
        }

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


def _filter_kanji_detail_response(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filter raw API response to match the documented Kanji Alive API format.

    The Kanji Alive API returns both raw database fields and a clean nested structure.
    This function extracts only the documented fields to avoid exposing:
    - Internal database fields (_id, _rev, *_search indices)
    - Licensing-restricted data (textbook chapters, mnemonic hints)
    - Redundant/duplicate data

    The documented response format includes only:
    - kanji: character, meaning, strokes (int), onyomi, kunyomi, video
    - radical: character, strokes, image, position, name, meaning, animation
    - references: grade, kodansha, classic_nelson
    - examples: japanese, meaning, audio

    Args:
        raw_data: Raw API response from Kanji Alive

    Returns:
        Filtered dictionary matching the documented API format
    """
    filtered = {}

    # Extract and filter the 'kanji' object to documented fields only
    if 'kanji' in raw_data and isinstance(raw_data['kanji'], dict):
        kanji_raw = raw_data['kanji']
        kanji_filtered = {}

        if 'character' in kanji_raw:
            kanji_filtered['character'] = kanji_raw['character']
        if 'meaning' in kanji_raw:
            kanji_filtered['meaning'] = kanji_raw['meaning']

        # strokes: API returns object {count, timings, images}, docs show integer
        if 'strokes' in kanji_raw:
            strokes = kanji_raw['strokes']
            if isinstance(strokes, dict):
                kanji_filtered['strokes'] = strokes.get('count')
            else:
                kanji_filtered['strokes'] = strokes

        if 'onyomi' in kanji_raw:
            kanji_filtered['onyomi'] = kanji_raw['onyomi']
        if 'kunyomi' in kanji_raw:
            kanji_filtered['kunyomi'] = kanji_raw['kunyomi']
        if 'video' in kanji_raw:
            kanji_filtered['video'] = kanji_raw['video']

        filtered['kanji'] = kanji_filtered

    # Extract the 'radical' object (already matches documented format)
    if 'radical' in raw_data and isinstance(raw_data['radical'], dict):
        filtered['radical'] = raw_data['radical']

    # Extract references
    if 'references' in raw_data and isinstance(raw_data['references'], dict):
        filtered['references'] = raw_data['references']

    # Extract examples array with only documented fields
    if 'examples' in raw_data and isinstance(raw_data['examples'], list):
        filtered_examples = []
        for example in raw_data['examples']:
            if isinstance(example, dict):
                filtered_example = {}
                if 'japanese' in example:
                    filtered_example['japanese'] = example['japanese']
                if 'meaning' in example:
                    filtered_example['meaning'] = example['meaning']
                if 'audio' in example:
                    filtered_example['audio'] = example['audio']
                if filtered_example:
                    filtered_examples.append(filtered_example)
        if filtered_examples:
            filtered['examples'] = filtered_examples

    return filtered


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
        raw_data, request_info = await _make_api_request(client, f"kanji/{params.character}")

        # Validate not empty
        _validate_response_not_empty(raw_data, f"kanji '{params.character}'")

        # Filter to documented fields only (removes internal DB fields, restricted data)
        kanji_data = _filter_kanji_detail_response(raw_data)

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



@mcp.resource("kanjialive://info/radicals")
async def radicals_resource() -> str:
    """
    Complete reference of the 214 traditional Kangxi radicals with position variants.

    This resource provides comprehensive data on all 321 radical entries:
    - 214 original Kangxi radicals from the 1716 dictionary
    - 107 position variants (forms that change based on placement in kanji)
    - 51 radicals marked as important for beginning learners

    Each radical entry includes:
    - Character, meaning, stroke count
    - Japanese and romaji readings
    - Position information (hen, tsukuri, kanmuri, etc.)
    - Origin (kangxi or variant)
    - For variants: reference to the base radical

    Note: 60 position variants use Private Use Area (PUA) Unicode encoding
    (U+E700–U+E759, U+E766–U+E767) and require the Kanji Alive radicals font
    to display correctly. These entries include a 'fallback_display' field
    for readability without the font. See the font_requirement field in the
    response for download links and visual reference.

    Use this resource to:
    - Look up radical meanings and readings
    - Understand radical position terminology
    - Find the base radical for position variants
    - Identify important radicals for study prioritization
    """
    try:
        radicals_data = _get_radicals_cache()
        return json.dumps(radicals_data, ensure_ascii=False, indent=2)
    except RuntimeError as e:
        # This should never happen if server started correctly
        logger.error(f"Radicals cache access failed: {e}")
        return json.dumps({
            "error": str(e),
            "hint": "The server may not have initialized correctly. Check startup logs."
        }, ensure_ascii=False, indent=2)



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
