import type maplibregl from 'maplibre-gl';
import { PALETTES, getPalette, type Palette } from '@/lib/print/palettes';
import type { CatalogPrintKind } from '@/lib/catalog/prints';

/**
 * Starting points.
 *
 * Nobody should land on a blank configurator. After a place is chosen we
 * propose three finished prints and let the user pick one, which reframes the
 * task from "configure a product" to "choose art".
 *
 * The suggestions are derived from things we can actually measure — the print
 * kind, the geographic extent, and (once the map has painted) how much of the
 * frame is water — rather than pretending to know anything we don't.
 */

export interface PlaceSignals {
  kind: CatalogPrintKind;
  /** Radius in miles that the place occupies. */
  radiusMiles: number;
  /** 0–1 share of the frame covered by water, or null before it is measured. */
  waterShare: number | null;
  /** Stable per-place value so different places get different suggestions. */
  seed: number;
}

export function seedFromSlug(slug: string): number {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Sample the rendered map to find how much of the frame is water. This runs on
 * the live canvas after it paints, so it reflects the actual composition the
 * user is looking at rather than a guess from the place name.
 */
export function measureWaterShare(map: maplibregl.Map): number | null {
  try {
    const style = map.getStyle();
    if (!style?.layers) return null;

    const waterLayers = style.layers
      .filter((layer) => layer.type === 'fill' && /water|ocean|sea|lake/.test(layer.id))
      .map((layer) => layer.id)
      .filter((id) => {
        try {
          return map.getLayoutProperty(id, 'visibility') !== 'none';
        } catch {
          return false;
        }
      });

    if (waterLayers.length === 0) return 0;

    const canvas = map.getCanvas();
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    if (!width || !height) return null;

    const STEPS = 9;
    let hits = 0;
    let samples = 0;

    for (let ix = 0; ix < STEPS; ix += 1) {
      for (let iy = 0; iy < STEPS; iy += 1) {
        const point: [number, number] = [
          ((ix + 0.5) / STEPS) * width,
          ((iy + 0.5) / STEPS) * height,
        ];
        samples += 1;
        const found = map.queryRenderedFeatures(point, { layers: waterLayers });
        if (found.length > 0) hits += 1;
      }
    }

    return samples > 0 ? hits / samples : null;
  } catch {
    return null;
  }
}

/**
 * Three distinct starting points, ordered best-first.
 *
 * Rules, in plain terms:
 *  - When water is a major part of the frame, lead with a look where water
 *    reads as a deliberate shape rather than incidental background.
 *  - Very large extents (states, countries, wide metros) get heavier linework
 *    and a look that survives having few streets in it.
 *  - Otherwise lead with high-contrast street work.
 * The seed only breaks ties, so the same place always suggests the same three.
 */
export function suggestPalettes(signals: PlaceSignals): Palette[] {
  const { kind, radiusMiles, waterShare, seed } = signals;
  const wateryFirst = ['harbor', 'blueprint', 'midnight', 'slate'];
  const broadFirst = ['bone', 'slate', 'forest', 'terracotta'];
  const denseFirst = ['signal', 'blueprint', 'noir', 'ochre'];

  let order: string[];
  if (waterShare !== null && waterShare >= 0.22) {
    order = wateryFirst;
  } else if (kind !== 'city' || radiusMiles > 40) {
    order = broadFirst;
  } else {
    order = denseFirst;
  }

  // Rotate by the seed so neighbouring cities don't all propose the same trio.
  const offset = Math.floor(seed * order.length);
  const rotated = [...order.slice(offset), ...order.slice(0, offset)];

  const picked: Palette[] = [];
  for (const id of rotated) {
    const palette = getPalette(id);
    if (!picked.some((existing) => existing.id === palette.id)) picked.push(palette);
    if (picked.length === 3) break;
  }

  // Top up from the full catalogue if the rules produced fewer than three.
  for (const palette of PALETTES) {
    if (picked.length === 3) break;
    if (!picked.some((existing) => existing.id === palette.id)) picked.push(palette);
  }

  return picked;
}
