import type { DetailBias } from '@/lib/print/density';
import type { Density, PrintDetailSettings } from '@/lib/print/printRender';

/**
 * State and country prints come in two honest cartographic editions:
 *
 *   Topographic — elevation, rivers, lakes, and open water.
 *   Atlas       — roads, cities, and town names.
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
    font: 'condensed',
  },
  {
    id: 'atlas',
    name: 'Street Atlas',
    blurb: 'Roads, cities, and town names. No terrain or river layer.',
    palette: 'bone',
    font: 'editorial',
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
  if (bias === -1) return 0.45;
  if (bias === 1) return 1.15;
  return 0.8;
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
    places: atlas ? density : 'none',
    rivers: !atlas,
    counties: false,
    states: kind === 'country',
    labels: {
      ...base.labels,
      cities: atlas,
      towns: atlas && detailBias !== -1,
      roads: false,
      water: false,
      rivers: false,
    },
  };
}

export function regionThemeName(theme: RegionTheme): string {
  return REGION_THEMES.find((entry) => entry.id === theme)?.name ?? 'Street Atlas';
}
