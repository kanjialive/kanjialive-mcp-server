"""
Tests for the radicals MCP resource.

These tests verify questions that can ONLY be answered from the radicals resource,
not from the Kanji Alive API. This demonstrates the value of bundled reference data.
"""
import json
import pytest
from pathlib import Path


@pytest.fixture
def radicals_data():
    """Load the radicals JSON data."""
    data_file = Path(__file__).parent.parent / "data" / "japanese-radicals.json"
    with open(data_file, 'r', encoding='utf-8') as f:
        return json.load(f)


class TestRadicalsDataStructure:
    """Test the structure and completeness of the radicals data."""

    def test_total_entries(self, radicals_data):
        """Verify we have all 321 radical entries."""
        assert radicals_data['total_entries'] == 321
        assert len(radicals_data['radicals']) == 321

    def test_statistics_match_data(self, radicals_data):
        """Verify statistics accurately reflect the data."""
        radicals = radicals_data['radicals']
        stats = radicals_data['statistics']

        kangxi_count = sum(1 for r in radicals if r['origin'] == 'kangxi')
        variant_count = sum(1 for r in radicals if r['origin'] == 'variant')
        important_count = sum(1 for r in radicals if r['important'])
        pua_count = sum(1 for r in radicals if r.get('pua_encoded'))

        assert stats['kangxi_radicals'] == kangxi_count == 214
        assert stats['variants'] == variant_count == 107
        assert stats['important'] == important_count == 51
        assert stats['pua_encoded'] == pua_count == 60

    def test_all_positions_documented(self, radicals_data):
        """Verify all 7 radical positions are documented."""
        positions = radicals_data['positions']
        expected = {'hen', 'tsukuri', 'kanmuri', 'ashi', 'kamae', 'tare', 'nyou'}
        assert set(positions.keys()) == expected

    def test_font_requirement_metadata(self, radicals_data):
        """Verify font requirement information is present."""
        font_req = radicals_data['font_requirement']
        assert font_req['affected_count'] == 60
        assert 'U+E700' in font_req['pua_range']
        assert 'github.com' in font_req['font_url']
        assert font_req['font_license'] == 'Apache 2.0'


class TestRadicalQueries:
    """
    Test queries that can ONLY be answered from the resource.

    These are questions an LLM would ask that the API cannot answer.
    """

    def test_bean_radical_variant(self, radicals_data):
        """
        Question: Of what radical is the 'bean' radical (まめへん) a variant?

        This requires knowing the variant relationship, which is only
        in the resource data, not the API.
        """
        radicals = radicals_data['radicals']

        # Find the bean variant (mamehen - left-side form)
        bean_variant = next(
            (r for r in radicals
             if r['reading']['romaji'] == 'mamehen'),
            None
        )

        assert bean_variant is not None, "Bean variant (mamehen) not found"
        assert bean_variant['variant_of'] == '⾖', "Should be variant of ⾖ (mame)"
        assert bean_variant['pua_encoded'] is True, "Bean variant is PUA-encoded"
        assert 'fallback_display' in bean_variant

        # Verify the base radical exists
        base_bean = next(
            (r for r in radicals
             if r['reading']['romaji'] == 'mame' and r['origin'] == 'kangxi'),
            None
        )
        assert base_bean is not None
        assert base_bean['character'] == '⾖'
        assert base_bean['meaning'] == 'bean'

    def test_most_important_radicals(self, radicals_data):
        """
        Question: What are the most important radicals to learn?

        The API doesn't provide importance rankings - only the resource does.
        """
        radicals = radicals_data['radicals']

        important = [r for r in radicals if r['important']]

        assert len(important) == 51, "Should have 51 important radicals"

        # Check some expected important radicals
        important_readings = {r['reading']['romaji'] for r in important}

        # Common important radicals that beginners should know
        expected_important = {
            'ninben',      # person (left)
            'kuchihen',    # mouth (left)
            'tsuchihen',   # earth (left)
            'onnahen',     # woman (left)
            'sanzui',      # water (left)
            'hihen',       # fire (left)
            'kihen',       # tree (left)
            'gonben',      # word/say (left)
            'kunigamae',   # enclosure
            'gandare',     # cliff
        }

        for radical in expected_important:
            assert radical in important_readings, f"{radical} should be marked important"

    def test_find_radicals_by_position(self, radicals_data):
        """
        Question: What radicals appear on the left side (hen) of kanji?

        Position-based queries require the resource data.
        """
        radicals = radicals_data['radicals']

        hen_radicals = [
            r for r in radicals
            if r.get('position') and r['position'].get('romaji') == 'hen'
        ]

        # Should have many left-side radicals
        assert len(hen_radicals) > 20, "Should have many hen (left-side) radicals"

        # All should have hen position
        for r in hen_radicals:
            assert r['position']['japanese'] == 'へん'

    def test_find_pua_radicals_with_fallback(self, radicals_data):
        """
        Question: Which radicals won't display without a special font?

        The fallback_display field is crucial for accessibility.
        """
        radicals = radicals_data['radicals']

        pua_radicals = [r for r in radicals if r.get('pua_encoded')]

        assert len(pua_radicals) == 60

        # All PUA radicals should have fallback display
        for r in pua_radicals:
            assert 'fallback_display' in r, f"PUA radical missing fallback: {r['reading']}"
            assert 'pua_codepoint' in r, f"PUA radical missing codepoint: {r['reading']}"

            # Fallback should be readable (contain the base radical and reading)
            fallback = r['fallback_display']
            if r.get('variant_of'):
                assert r['variant_of'] in fallback, "Fallback should include base radical"
            assert r['reading']['japanese'] in fallback, "Fallback should include reading"

    def test_radical_stroke_counts(self, radicals_data):
        """
        Question: How many radicals have exactly 3 strokes?

        Stroke-based grouping from the resource.
        """
        radicals = radicals_data['radicals']

        three_stroke = [r for r in radicals if r['strokes'] == 3]

        # There should be multiple 3-stroke radicals
        assert len(three_stroke) > 10

        # Check a known 3-stroke radical
        kuchi = next(
            (r for r in three_stroke if r['meaning'] == 'mouth'),
            None
        )
        assert kuchi is not None

    def test_find_all_variants_of_person_radical(self, radicals_data):
        """
        Question: What are all the position variants of the 'person' radical?

        Understanding variant relationships requires the resource.
        """
        radicals = radicals_data['radicals']

        # Find the base person radical (hito)
        person_base = next(
            (r for r in radicals
             if r['reading']['romaji'] == 'hito' and r['origin'] == 'kangxi'),
            None
        )
        assert person_base is not None
        assert person_base['character'] == '⼈'

        # Find all variants of the person radical
        person_variants = [
            r for r in radicals
            if r.get('variant_of') == '⼈'
        ]

        # Should have multiple variants (ninben, hitoyane, hitoashi, etc.)
        assert len(person_variants) >= 2

        # Check known variants exist
        variant_readings = {r['reading']['romaji'] for r in person_variants}
        assert 'ninben' in variant_readings, "にんべん (left-side person) should exist"
        assert 'hitoyane' in variant_readings, "ひとやね (top person) should exist"


class TestRadicalLookup:
    """Test looking up specific radicals by various attributes."""

    def test_lookup_by_meaning(self, radicals_data):
        """Look up radicals by English meaning."""
        radicals = radicals_data['radicals']

        water_radicals = [
            r for r in radicals
            if r.get('meaning') and 'water' in r['meaning'].lower()
        ]

        assert len(water_radicals) >= 1
        # The main water radical is mizu (⽔)
        assert any(r['reading']['romaji'] == 'mizu' for r in water_radicals)

    def test_lookup_by_japanese_reading(self, radicals_data):
        """Look up radicals by Japanese hiragana reading."""
        radicals = radicals_data['radicals']

        # Find さんずい (water radical, left position)
        sanzui = next(
            (r for r in radicals
             if r['reading']['japanese'] == 'さんずい'),
            None
        )

        assert sanzui is not None
        assert sanzui['meaning'] == 'water'
        assert sanzui['position']['romaji'] == 'hen'
        assert sanzui['important'] is True

    def test_lookup_kangxi_only(self, radicals_data):
        """Find only the 214 original Kangxi radicals (no variants)."""
        radicals = radicals_data['radicals']

        kangxi_only = [r for r in radicals if r['origin'] == 'kangxi']

        assert len(kangxi_only) == 214

        # Kangxi radicals should not have variant_of
        for r in kangxi_only:
            assert 'variant_of' not in r, f"Kangxi radical should not be a variant: {r['reading']}"


class TestResourceMetadata:
    """Test the resource metadata and documentation."""

    def test_source_attribution(self, radicals_data):
        """Verify proper source attribution."""
        assert 'kanjialive.com' in radicals_data['source']
        assert 'github.com' in radicals_data['repository']
        assert radicals_data['license'] == 'Creative Commons CC-BY'

    def test_position_descriptions(self, radicals_data):
        """Verify position descriptions are helpful."""
        positions = radicals_data['positions']

        assert 'Left side' in positions['hen']['description']
        assert 'Right side' in positions['tsukuri']['description']
        assert 'Top' in positions['kanmuri']['description']
        assert 'Bottom' in positions['ashi']['description']
        assert 'Enclosure' in positions['kamae']['description']
