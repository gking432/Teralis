import type { DetailBias } from '@/lib/print/density';
import type { Density, PrintDetailSettings } from '@/lib/print/printRender';

/**
 * State and country prints come in two honest cartographic editions:
 *
 *   Topographic — elevation, rivers, lakes, and open water.
 *   Atlas       — the road network, without place-name clutter.
 *
 * The Composition panel's single Map detail control changes the amount of
 * geography inside either edition. There are no duplicate per-layer controls.
 */

export type RegionTheme = 'topographic' | 'atlas';

export interface RegionDesign {
  theme: RegionTheme;
}

export const REGION_DETAIL_LEVELS: DetailBias[] = [-1, 0, 1];

export const REGION_THEMES: Array<{
  id: RegionTheme;
  name: string;
  blurb: string;
  palette: string;
  font: 'editorial' | 'hand' | 'modern' | 'condensed';
}> = [
  {
    id: 'topographic',
    name: 'Topographic',
    blurb: 'Elevation relief, rivers, lakes, and open water.',
    palette: 'forest',
    font: 'editorial',
  },
  {
    id: 'atlas',
    name: 'Street Atlas',
    blurb: 'Road hierarchy without terrain, rivers, or place names.',
    palette: 'bone',
    font: 'condensed',
  },
];

export function defaultRegionDesign(theme: RegionTheme = 'atlas'): RegionDesign {
  return { theme };
}

export function applyRegionTheme(_current: RegionDesign, theme: RegionTheme): RegionDesign {
  return defaultRegionDesign(theme);
}

function densityForBias(bias: DetailBias): Density {
  if (bias === -1) return 'less';
  if (bias === 1) return 'more';
  return 'neutral';
}

export function hillshadeExaggeration(bias: DetailBias): number {
  // MapLibre constrains hillshade exaggeration to 0..1. Values above 1 are
  // rejected, which made the old "More detailed" setting appear to do
  // nothing. Keep all three steps legal and visibly distinct.
  if (bias === -1) return 0.52;
  if (bias === 1) return 1;
  return 0.82;
}

/**
 * The single translation from an edition and detail level to rendered layers.
 * Preview and export both use this normalized detail object.
 */
export function detailForRegion(
  design: RegionDesign,
  base: PrintDetailSettings,
  kind: 'country' | 'state' | 'city',
  detailBias: DetailBias,
): PrintDetailSettings {
  if (kind === 'city') return base;
  const atlas = design.theme === 'atlas';
  const density = densityForBias(detailBias);

  return {
    ...base,
    roads: atlas ? density : 'none',
    places: 'none',
    rivers: !atlas,
    counties: false,
    states: kind === 'country',
    labels: {
      ...base.labels,
      cities: false,
      towns: false,
      roads: false,
      water: false,
      rivers: false,
    },
  };
}

export function regionThemeName(theme: RegionTheme): string {
  return REGION_THEMES.find((entry) => entry.id === theme)?.name ?? 'Street Atlas';
}
