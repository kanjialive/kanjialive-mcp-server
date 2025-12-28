#!/usr/bin/env python3
"""
Convert all-radicals.csv to clean JSON for the MCP server.

This script:
1. Reads the source CSV with radical data
2. Strips HTML from Position and Notes columns
3. Extracts variant references from Notes
4. Parses encoding information
5. Detects PUA-encoded radicals and adds fallback display text
6. Outputs a clean, structured JSON file

Usage:
    python scripts/convert_radicals_csv.py

Output:
    data/japanese-radicals.json
"""

import csv
import json
import re
from pathlib import Path


# PUA range used by Kanji Alive for custom radical glyphs
# Main range: U+E700–U+E759, plus U+E766–U+E767
PUA_RANGES = [
    (0xE700, 0xE759),
    (0xE766, 0xE767),
]


def strip_html_tags(text: str) -> str:
    """Remove all HTML tags from text."""
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()


def extract_variant_of(notes: str) -> str | None:
    """
    Extract the base radical character from variant notes.

    Examples:
        '<a href="#⼑">a variant of ⼑（かたな）</a>' -> '⼑'
        '<a href="#⼈">a variant of ⼈（ひと）</a>' -> '⼈'
    """
    if not notes:
        return None

    # Pattern matches: a variant of X（...）
    match = re.search(r'a variant of\s+(\S+)（', notes)
    if match:
        return match.group(1)

    # Also try href pattern as fallback
    match = re.search(r'href="#([^"]+)"', notes)
    if match:
        return match.group(1)

    return None


def parse_encoding(encoding_str: str) -> dict | None:
    """
    Parse the encoding field into structured data.

    Example input:
        "CJK RADICAL KNIFE TWO\nUnicode: U+2E89, UTF-8: E2 BA 89"

    Returns:
        {"name": "CJK RADICAL KNIFE TWO", "unicode": "U+2E89", "utf8": "E2 BA 89"}
    """
    if not encoding_str:
        return None

    result = {}

    # Split by newline - first line is the name
    lines = encoding_str.strip().split('\n')
    if lines:
        result['name'] = lines[0].strip()

    # Parse the rest for Unicode and UTF-8 values
    full_text = encoding_str

    # Extract Unicode code point (handle surrogate pairs too)
    unicode_match = re.search(r'Unicode:\s*(U\+[0-9A-Fa-f]+(?:\s*\([^)]+\))?)', full_text)
    if unicode_match:
        result['unicode'] = unicode_match.group(1).strip()

    # Extract UTF-8 bytes
    utf8_match = re.search(r'UTF-8:\s*([0-9A-Fa-f]{2}(?:\s+[0-9A-Fa-f]{2})*)', full_text)
    if utf8_match:
        result['utf8'] = utf8_match.group(1).strip()

    # Extract Shift-JIS if present
    shiftjis_match = re.search(r'Shift-JIS:\s*([0-9A-Fa-f]+)', full_text)
    if shiftjis_match:
        result['shift_jis'] = shiftjis_match.group(1).strip()

    return result if result else None


def is_pua_encoded(encoding: dict | None) -> bool:
    """
    Check if the encoding indicates a Private Use Area character.

    PUA ranges for Kanji Alive radicals: U+E700–U+E759, U+E766–U+E767
    """
    if not encoding or 'unicode' not in encoding:
        return False

    unicode_str = encoding['unicode']

    # Extract the code point value (e.g., "U+E731" -> 0xE731)
    match = re.match(r'U\+([0-9A-Fa-f]+)', unicode_str)
    if not match:
        return False

    code_point = int(match.group(1), 16)

    # Check if code point falls within any of the PUA ranges
    return any(start <= code_point <= end for start, end in PUA_RANGES)


def build_fallback_display(record: dict) -> str:
    """
    Build a human-readable fallback display string for PUA-encoded radicals.

    Format: "{base_radical} → {reading} ({romaji}) — {meaning}, {position} position"
    Example: "⼝ → くちへん (kuchihen) — mouth, left position"
    """
    parts = []

    # Start with base radical if this is a variant
    if record.get('variant_of'):
        parts.append(record['variant_of'])
        parts.append(' → ')

    # Add reading
    reading = record.get('reading', {})
    japanese = reading.get('japanese', '')
    romaji = reading.get('romaji', '')

    if japanese:
        parts.append(japanese)
        if romaji:
            parts.append(f' ({romaji})')

    # Add meaning and position
    meaning = record.get('meaning', '')
    position = record.get('position', {})
    position_desc = position.get('romaji', '') if position else ''

    if meaning or position_desc:
        parts.append(' — ')
        if meaning:
            parts.append(meaning)
        if position_desc:
            if meaning:
                parts.append(', ')
            parts.append(f'{position_desc} position')

    return ''.join(parts)


def convert_row(row: dict) -> dict:
    """Convert a CSV row to clean JSON structure."""

    # Extract variant reference from notes
    variant_of = extract_variant_of(row.get('Notes', ''))

    # Determine origin
    origin_raw = row.get('Origin', '').strip()
    if origin_raw == 'Kangxi':
        origin = 'kangxi'
    elif variant_of:
        origin = 'variant'
    else:
        origin = 'variant'  # Non-Kangxi entries without explicit origin are variants

    # Parse encoding
    encoding = parse_encoding(row.get('Encoding', ''))

    # Build the clean record
    record = {
        'sort_order': int(row['Sort Order']) if row.get('Sort Order') else None,
        'strokes': int(row['Stroke#']) if row.get('Stroke#') else None,
        'character': row.get('Radical', '').strip() or None,
        'meaning': row.get('Meaning', '').strip() or None,
        'reading': {
            'japanese': row.get('Reading', '').strip() or None,
            'romaji': row.get('Reading-R', '').strip() or None,
        },
        'position': None,
        'important': row.get('Importance', '').strip().lower() == 'important',
        'origin': origin,
        'encoding': encoding,
    }

    # Add position if present
    position_j = row.get('Position-J', '').strip()
    position_r = row.get('Position-R', '').strip()
    if position_j or position_r:
        record['position'] = {
            'japanese': position_j or None,
            'romaji': position_r or None,
        }

    # Add variant reference if present
    if variant_of:
        record['variant_of'] = variant_of

    # Check for PUA encoding and add fallback display
    if is_pua_encoded(encoding):
        record['pua_encoded'] = True
        # Extract just the code point for easy reference
        if encoding and 'unicode' in encoding:
            match = re.match(r'(U\+[0-9A-Fa-f]+)', encoding['unicode'])
            if match:
                record['pua_codepoint'] = match.group(1)
        # Build fallback display text
        record['fallback_display'] = build_fallback_display(record)

    return record


def main():
    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    input_file = project_root / 'all-radicals.csv'
    output_dir = project_root / 'data'
    output_file = output_dir / 'japanese-radicals.json'

    # Ensure output directory exists
    output_dir.mkdir(exist_ok=True)

    # Read and convert CSV
    radicals = []

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            record = convert_row(row)
            radicals.append(record)

    # Sort by sort_order to ensure consistent ordering
    radicals.sort(key=lambda x: x['sort_order'] or 0)

    # Calculate statistics
    kangxi_count = sum(1 for r in radicals if r['origin'] == 'kangxi')
    variant_count = sum(1 for r in radicals if r['origin'] == 'variant')
    important_count = sum(1 for r in radicals if r['important'])
    pua_count = sum(1 for r in radicals if r.get('pua_encoded'))

    # Build final output structure
    output = {
        'description': 'The 214 traditional Kangxi radicals with position variants',
        'source': 'https://kanjialive.com/214-traditional-kanji-radicals/',
        'license': 'Creative Commons CC-BY',
        'repository': 'https://github.com/kanjialive/kanji-data-media',
        'total_entries': len(radicals),
        'statistics': {
            'kangxi_radicals': kangxi_count,
            'variants': variant_count,
            'important': important_count,
            'pua_encoded': pua_count,
        },
        'font_requirement': {
            'note': (
                f'{pua_count} position variants use Private Use Area (PUA) Unicode encoding '
                'and require the Kanji Alive radicals font to display correctly. '
                'These entries include a fallback_display field for readability without the font.'
            ),
            'affected_count': pua_count,
            'pua_range': 'U+E700–U+E759, U+E766–U+E767',
            'font_url': 'https://github.com/kanjialive/kanji-data-media/tree/master/radicals-font',
            'visual_reference': 'https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/radicals-font/60-custom-glyphs.png',
            'font_license': 'Apache 2.0',
        },
        'positions': {
            'hen': {'japanese': 'へん', 'description': 'Left side of kanji'},
            'tsukuri': {'japanese': 'つくり', 'description': 'Right side of kanji'},
            'kanmuri': {'japanese': 'かんむり', 'description': 'Top/crown of kanji'},
            'ashi': {'japanese': 'あし', 'description': 'Bottom/legs of kanji'},
            'kamae': {'japanese': 'かまえ', 'description': 'Enclosure/frame of kanji'},
            'tare': {'japanese': 'たれ', 'description': 'Top-left hanging element'},
            'nyou': {'japanese': 'にょう', 'description': 'Bottom-left to right element'},
        },
        'radicals': radicals,
    }

    # Write JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Converted {len(radicals)} radicals")
    print(f"  - Kangxi originals: {kangxi_count}")
    print(f"  - Variants: {variant_count}")
    print(f"  - Important: {important_count}")
    print(f"  - PUA-encoded (need font): {pua_count}")
    print(f"Output: {output_file}")


if __name__ == '__main__':
    main()
