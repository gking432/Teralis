import type { DetailBias } from '@/lib/print/density';
import type { Density, PrintDetailSettings } from '@/lib/print/printRender';

/** Curated state editions; atlas and landmarks remain readable legacy IDs. */

export type RegionTheme = 'topographic' | 'atlas' | 'illustrated' | 'detailed' | 'landmarks';

export interface RegionDesign {
  theme: RegionTheme;
  hometown?: { name: string; coordinates: [number, number] };
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
    name: 'Terrain',
    blurb: 'Elevation relief, rivers, lakes, and open water.',
    palette: 'forest',
    font: 'editorial',
  },
  {
    id: 'detailed',
    name: 'Towns & Terrain',
    blurb: 'Cities and small towns over shaded terrain and waterways.',
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
  const atlas = design.theme === 'atlas' || design.theme === 'detailed';
  const density = densityForBias(detailBias);

  return {
    ...base,
    roads: design.theme === 'detailed' ? 'none' : atlas ? density : 'none',
    places: design.theme === 'detailed' ? 'more' : atlas && base.labels.towns ? 'neutral' : atlas && base.labels.cities ? 'less' : 'none',
    rivers: !atlas || design.theme === 'detailed',
    counties: false,
    states: kind === 'country',
    labels: {
      ...base.labels,
      cities: design.theme === 'detailed' || atlas && base.labels.cities,
      towns: design.theme === 'detailed' || atlas && base.labels.towns,
      roads: false,
      water: false,
      rivers: false,
    },
  };
}

export function regionThemeName(theme: RegionTheme): string {
  if (theme === 'detailed') return 'Towns & Terrain';
  if (theme === 'illustrated') return 'Illustrated';
  return REGION_THEMES.find((entry) => entry.id === theme)?.name ?? 'Street Atlas';
}
