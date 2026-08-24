import type { Density, PrintDetailSettings } from '@/lib/print/printRender';

/**
 * What a state or country print actually is.
 *
 * Two cartographic editions, no illustration. Hand-drawn glyphs read as clip
 * art at print size; real cartography does not, and it is defensible for every
 * region on earth without curation.
 *
 *   Topographic — the shape of the land: elevation relief, rivers, water.
 *   Atlas       — the shape of human settlement: roads, town and city names,
 *                 county lines.
 *
 * Each feature is graded rather than switched, so a customer tunes density
 * instead of turning the map on and off.
 */

export type RegionTheme = 'topographic' | 'atlas';

/** Every graded feature uses the same three steps. */
export type FeatureLevel = 'less' | 'balanced' | 'more';

export const FEATURE_LEVELS: FeatureLevel[] = ['less', 'balanced', 'more'];

export interface RegionDesign {
  theme: RegionTheme;
  /** Highways through to local routes. */
  roads: FeatureLevel;
  /** Some cities · most towns · every town and city. */
  places: FeatureLevel;
  /** Relief strength on the topographic edition. */
  elevation: FeatureLevel;
  /** Rivers and streams. */
  rivers: FeatureLevel;
  /** County boundaries. */
  counties: boolean;
}

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
    blurb: 'Elevation relief, rivers, and water. The shape of the land itself.',
    palette: 'forest',
    font: 'condensed',
  },
  {
    id: 'atlas',
    name: 'Atlas',
    blurb: 'Roads, towns and cities by name, and county lines.',
    palette: 'bone',
    font: 'editorial',
  },
];

export function defaultRegionDesign(theme: RegionTheme = 'atlas'): RegionDesign {
  return theme === 'topographic'
    ? { theme, roads: 'less', places: 'less', elevation: 'balanced', rivers: 'balanced', counties: false }
    : { theme, roads: 'balanced', places: 'balanced', elevation: 'less', rivers: 'balanced', counties: true };
}

/** Switch edition, keeping any deliberate feature choices that still apply. */
export function applyRegionTheme(current: RegionDesign, theme: RegionTheme): RegionDesign {
  return { ...defaultRegionDesign(theme), counties: theme === 'atlas' ? current.counties : false };
}

const LEVEL_TO_DENSITY: Record<FeatureLevel, Density> = {
  less: 'less',
  balanced: 'neutral',
  more: 'more',
};

/** What each place level means, in the customer's language. */
export function placeLevelLabel(level: FeatureLevel): string {
  if (level === 'less') return 'Some cities';
  if (level === 'balanced') return 'Most towns';
  return 'Every town and city';
}

export function hillshadeExaggeration(level: FeatureLevel): number {
  if (level === 'less') return 0.45;
  if (level === 'more') return 1.15;
  return 0.8;
}

/**
 * The single translation from a design to what gets drawn. Everything that
 * renders a region print reads its layer settings from here, so the preview,
 * the export, and the ordered artwork cannot drift apart.
 */
export function detailForRegion(
  design: RegionDesign,
  base: PrintDetailSettings,
  kind: 'country' | 'state' | 'city',
): PrintDetailSettings {
  if (kind === 'city') return base;
  const atlas = design.theme === 'atlas';
  return {
    ...base,
    // The topographic edition keeps a whisper of road structure for
    // orientation; the atlas edition is built on it.
    roads: atlas ? LEVEL_TO_DENSITY[design.roads] : design.roads === 'less' ? 'none' : 'less',
    places: atlas ? LEVEL_TO_DENSITY[design.places] : 'none',
    rivers: design.rivers !== 'less',
    counties: atlas && design.counties,
    states: kind === 'country',
    labels: {
      ...base.labels,
      // Names are what makes the atlas edition an atlas.
      cities: atlas,
      towns: atlas && design.places !== 'less',
      roads: false,
      water: false,
      rivers: false,
    },
  };
}

export function regionThemeName(theme: RegionTheme): string {
  return REGION_THEMES.find((entry) => entry.id === theme)?.name ?? 'Atlas';
}
