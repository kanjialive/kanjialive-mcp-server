import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  readRadicalsResource,
  radicalsResourceDefinition,
  RADICALS_RESOURCE_URI,
} from '../../src/mcp/resources/radicals.js';

interface RadicalEntry {
  sort_order: number;
  strokes: number;
  character: string;
  meaning: string;
  reading: { japanese: string; romaji: string };
  position: { japanese: string; romaji: string } | null;
  origin: string;
  encoding: { unicode: string };
  pua_encoded?: boolean;
  fallback_display?: string;
  variant_of?: string;
}

interface RadicalsPayload {
  total_entries: number;
  radicals: RadicalEntry[];
  positions?: unknown;
  statistics?: unknown;
}

async function loadPayload(): Promise<RadicalsPayload> {
  const result = await readRadicalsResource();
  return JSON.parse(result.contents[0].text) as RadicalsPayload;
}

describe('radicals resource definition', () => {
  it('exposes a stable URI and JSON mime type', () => {
    expect(RADICALS_RESOURCE_URI).toBe('kanjialive://info/radicals');
    expect(radicalsResourceDefinition.uri).toBe(RADICALS_RESOURCE_URI);
    expect(radicalsResourceDefinition.mimeType).toBe('application/json');
    expect(radicalsResourceDefinition.name).toBe('Japanese Radicals');
    expect(radicalsResourceDefinition.description).toMatch(/214/);
    expect(radicalsResourceDefinition.description).toMatch(/321/);
  });
});

describe('readRadicalsResource', () => {
  it('returns one JSON content block tagged with the resource URI', async () => {
    const result = await readRadicalsResource();
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe(RADICALS_RESOURCE_URI);
    expect(result.contents[0].mimeType).toBe('application/json');
    expect(() => JSON.parse(result.contents[0].text)).not.toThrow();
  });

  it('ships all 321 entries, and the count matches the declared total', async () => {
    const payload = await loadPayload();
    expect(payload.total_entries).toBe(321);
    expect(payload.radicals).toHaveLength(321);
  });

  it('contains the 214 Kangxi radicals plus 107 variants', async () => {
    const payload = await loadPayload();
    const kangxi = payload.radicals.filter((r) => r.origin === 'kangxi');
    const variants = payload.radicals.filter((r) => r.origin === 'variant');
    expect(kangxi).toHaveLength(214);
    expect(variants).toHaveLength(107);
  });

  it('gives every entry the fields the reference is meant to provide', async () => {
    const payload = await loadPayload();
    for (const radical of payload.radicals) {
      expect(typeof radical.character).toBe('string');
      expect(radical.character.length).toBeGreaterThan(0);
      expect(typeof radical.meaning).toBe('string');
      expect(typeof radical.strokes).toBe('number');
      expect(radical.reading.japanese.length).toBeGreaterThan(0);
      expect(radical.reading.romaji.length).toBeGreaterThan(0);
    }
  });

  it('gives every private-use-area entry a font-independent fallback', async () => {
    const payload = await loadPayload();
    const pua = payload.radicals.filter((r) => r.pua_encoded);
    expect(pua).toHaveLength(60);
    for (const radical of pua) {
      // Without this, PUA glyphs render as tofu for any client lacking the font.
      expect(radical.fallback_display).toBeTruthy();
    }
  });

  it('points every PUA variant at the standard radical it stands in for', async () => {
    // Kangxi-origin PUA entries have no parent; only variants do.
    const payload = await loadPayload();
    const puaVariants = payload.radicals.filter((r) => r.pua_encoded && r.origin === 'variant');
    expect(puaVariants.length).toBeGreaterThan(0);
    for (const radical of puaVariants) {
      expect(radical.variant_of).toBeTruthy();
    }
  });

  it('numbers the Kangxi radicals 1..214 without gaps', async () => {
    const payload = await loadPayload();
    const orders = payload.radicals
      .filter((r) => r.origin === 'kangxi')
      .map((r) => r.sort_order)
      .sort((a, b) => a - b);
    expect(orders[0]).toBe(1);
    expect(new Set(orders).size).toBe(214);
  });

  it('serves repeat reads from cache without re-reading the file', async () => {
    const first = await readRadicalsResource();
    const second = await readRadicalsResource();
    expect(second.contents[0].text).toBe(first.contents[0].text);
  });
});

describe('readRadicalsResource when the data file is missing', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
  });

  it('returns a JSON error payload instead of throwing', async () => {
    vi.resetModules();
    vi.doMock('node:fs/promises', () => ({
      default: {
        readFile: vi.fn().mockRejectedValue(
          Object.assign(new Error('no such file'), { code: 'ENOENT' })
        ),
      },
    }));

    const { readRadicalsResource: read } = await import('../../src/mcp/resources/radicals.js');
    const result = await read();
    const payload = JSON.parse(result.contents[0].text);

    expect(result.contents[0].uri).toBe('kanjialive://info/radicals');
    expect(payload.error).toMatch(/Radicals data file not found/);
    expect(payload.hint).toMatch(/missing from the deployment/);
  });
});
