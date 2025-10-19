"""Test input validation logic."""
import pytest
from pydantic import ValidationError
from kanjialive_mcp import (
    KanjiBasicSearchInput,
    KanjiAdvancedSearchInput,
    KanjiDetailInput,
    ResponseFormat
)


class TestKanjiBasicSearchInput:
    """Test basic search input validation."""

    def test_valid_kanji_character(self):
        """Should accept valid kanji character."""
        result = KanjiBasicSearchInput(query="\u89aa")
        assert result.query == "\u89aa"

    def test_valid_english(self):
        """Should accept English meaning."""
        result = KanjiBasicSearchInput(query="parent")
        assert result.query == "parent"

    def test_empty_query_rejected(self):
        """Should reject empty query."""
        with pytest.raises(ValidationError):
            KanjiBasicSearchInput(query="")

    def test_default_format_markdown(self):
        """Should default to markdown format."""
        result = KanjiBasicSearchInput(query="\u89aa")
        assert result.response_format == ResponseFormat.MARKDOWN


class TestKanjiAdvancedSearchInput:
    """Test advanced search input validation."""

    def test_onyomi_romaji_normalized(self):
        """Should normalize romaji onyomi to lowercase."""
        result = KanjiAdvancedSearchInput(on="SHIN")
        assert result.on == "shin"

    def test_kunyomi_romaji_normalized(self):
        """Should normalize romaji kunyomi to lowercase."""
        result = KanjiAdvancedSearchInput(kun="OYA")
        assert result.kun == "oya"

    def test_stroke_count_validation(self):
        """Should validate kanji stroke count range."""
        valid = KanjiAdvancedSearchInput(ks=16)
        assert valid.ks == 16

        with pytest.raises(ValidationError):
            KanjiAdvancedSearchInput(ks=0)

        with pytest.raises(ValidationError):
            KanjiAdvancedSearchInput(ks=31)

    def test_grade_validation(self):
        """Should validate grade range 1-6."""
        valid = KanjiAdvancedSearchInput(grade=2)
        assert valid.grade == 2

        with pytest.raises(ValidationError):
            KanjiAdvancedSearchInput(grade=0)

        with pytest.raises(ValidationError):
            KanjiAdvancedSearchInput(grade=7)

    def test_has_any_filter(self):
        """Should detect when at least one filter is provided."""
        no_filters = KanjiAdvancedSearchInput()
        assert not no_filters.has_any_filter()

        with_filter = KanjiAdvancedSearchInput(grade=2)
        assert with_filter.has_any_filter()


class TestKanjiDetailInput:
    """Test kanji detail input validation."""

    def test_valid_single_character(self):
        """Should accept single kanji character."""
        result = KanjiDetailInput(character="\u89aa")
        assert result.character == "\u89aa"

    def test_multiple_characters_rejected(self):
        """Should reject multiple characters."""
        with pytest.raises(ValidationError):
            KanjiDetailInput(character="ab")

    def test_empty_character_rejected(self):
        """Should reject empty character."""
        with pytest.raises(ValidationError):
            KanjiDetailInput(character="")
