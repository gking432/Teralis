import type { Orientation } from '@/lib/print/orientation';
import type { CatalogPrintKind } from '@/lib/catalog/prints';

/**
 * Radius-based framing.
 *
 * The old framing presets multiplied the Nominatim bounding box by fixed
 * factors (0.68 / 0.42). Nominatim bboxes are wildly inconsistent — some
 * "cities" return their whole county — so the same preset meant something
 * different in every city, and the labels ("Wide", "Downtown") were unfalsifiable.
 *
 * Instead we frame by a real-world radius in miles around a center point. That
 * is consistent everywhere on earth, it reads as a number the user understands,
 * and it scales smoothly from a neighbourhood to a continent.
 */

const MILES_PER_LAT_DEGREE = 69.0;
const MIN_RADIUS_MILES = 0.25;
const MAX_RADIUS_MILES = 4000;

export interface Viewport {
  bbox: [string, string, string, string]; // south, north, west, east
  center: [number, number];               // longitude, latitude
}

function milesPerLonDegree(latitude: number): number {
  return MILES_PER_LAT_DEGREE * Math.cos((latitude * Math.PI) / 180);
}

export function clampRadius(miles: number): number {
  return Math.min(Math.max(miles, MIN_RADIUS_MILES), MAX_RADIUS_MILES);
}

/**
 * Height-to-width ratio of the paper. The radius always describes the SHORTER
 * geographic dimension, so "8 mi" means the same amount of ground on portrait,
 * landscape, and square paper — only the long axis grows.
 */
export function viewportForRadius(
  center: [number, number],
  radiusMiles: number,
  ratio: number,
): Viewport {
  const radius = clampRadius(radiusMiles);
  const [longitude, latitude] = center;

  // ratio = height / width. Portrait (>1) is narrower than it is tall, so the
  // width is the short side; landscape (<1) makes height the short side.
  const halfWidthMiles = ratio >= 1 ? radius : radius / ratio;
  const halfHeightMiles = ratio >= 1 ? radius * ratio : radius;

  const latSpan = halfHeightMiles / MILES_PER_LAT_DEGREE;
  const lonSpan = halfWidthMiles / Math.max(milesPerLonDegree(latitude), 0.0001);

  return {
    bbox: [
      String(latitude - latSpan),
      String(latitude + latSpan),
      String(longitude - lonSpan),
      String(longitude + lonSpan),
    ],
    center: [longitude, latitude],
  };
}

/** The radius that best describes an existing viewport, for round-tripping. */
export function radiusForViewport(viewport: Viewport, ratio: number): number {
  const [south, north, west, east] = viewport.bbox.map(Number);
  const latitude = (south + north) / 2;
  const halfHeightMiles = ((north - south) / 2) * MILES_PER_LAT_DEGREE;
  const halfWidthMiles = ((east - west) / 2) * milesPerLonDegree(latitude);
  return clampRadius(ratio >= 1 ? halfWidthMiles : halfHeightMiles);
}

/** The radius that covers a geocoded place's own extent. */
export function radiusForPlaceBbox(bbox: [string, string, string, string]): number {
  const [south, north, west, east] = bbox.map(Number);
  const latitude = (south + north) / 2;
  const halfHeightMiles = ((north - south) / 2) * MILES_PER_LAT_DEGREE;
  const halfWidthMiles = ((east - west) / 2) * milesPerLonDegree(latitude);
  // Use the larger half-span so the whole place fits rather than being cropped.
  return clampRadius(Math.max(halfHeightMiles, halfWidthMiles));
}

/**
 * Radius that fits a real place bbox into a specific sheet shape.
 *
 * Using the place's longest axis for both dimensions made tall states tiny on
 * portrait paper: Wisconsin's height was treated as its width, then stretched
 * again by the portrait ratio. This solves the two axes independently and
 * returns the tightest radius that contains both.
 */
export function radiusForPlaceBboxAtRatio(
  bbox: [string, string, string, string],
  ratio: number,
): number {
  const [south, north, west, east] = bbox.map(Number);
  const latitude = (south + north) / 2;
  const halfHeightMiles = ((north - south) / 2) * MILES_PER_LAT_DEGREE;
  const halfWidthMiles = ((east - west) / 2) * milesPerLonDegree(latitude);
  return clampRadius(ratio >= 1
    ? Math.max(halfWidthMiles, halfHeightMiles / ratio)
    : Math.max(halfHeightMiles, halfWidthMiles * ratio));
}

/**
 * A ladder of human-friendly radii. Presets are picked from this ladder rather
 * than computed, so the numbers people see are always round.
 */
const RADIUS_LADDER = [
  0.5, 1, 1.5, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300,
  500, 800, 1200, 2000, 3000,
];

export function formatRadius(miles: number): string {
  if (miles < 1) return `${miles.toFixed(1)} mi`;
  if (miles < 100) return `${Math.round(miles)} mi`;
  return `${Math.round(miles / 10) * 10} mi`;
}

export interface FramingPreset {
  miles: number;
  label: string;
  name: string;
}

const PRESET_NAMES: Record<CatalogPrintKind, string[]> = {
  city: ['Neighborhood', 'Whole city', 'City + surroundings'],
  state: ['Detailed region', 'Full state', 'State + neighbors'],
  country: ['Closer view', 'Full country', 'Country + neighbors'],
};

/**
 * Three presets bracketing the place's natural extent, drawn from the ladder.
 * The place's own extent lands on the middle rung, so the
 * default is always the recognisable view of what the user searched for.
 */
export function framingPresets(
  placeRadiusMiles: number,
  kind: CatalogPrintKind = 'city',
): FramingPreset[] {
  if (kind !== 'city') {
    const factors = [0.72, 1, 1.38];
    return factors.map((factor, index) => {
      const miles = clampRadius(placeRadiusMiles * factor);
      return {
        miles,
        label: formatRadius(miles),
        name: PRESET_NAMES[kind][index] ?? formatRadius(miles),
      };
    });
  }

  // Index of the ladder rung closest to (but not below) the place extent.
  let anchor = RADIUS_LADDER.findIndex((rung) => rung >= placeRadiusMiles);
  if (anchor === -1) anchor = RADIUS_LADDER.length - 1;

  // One rung tighter, the anchor, one rung wider.
  const start = Math.min(Math.max(anchor - 1, 0), RADIUS_LADDER.length - 3);
  return RADIUS_LADDER.slice(start, start + 3).map((miles, index) => ({
    miles,
    label: formatRadius(miles),
    name: PRESET_NAMES[kind][index] ?? formatRadius(miles),
  }));
}

export function defaultFramingRadius(
  placeRadiusMiles: number,
  kind: CatalogPrintKind,
): number {
  return framingPresets(placeRadiusMiles, kind)[1].miles;
}

/** Continuous zoom for the slider: maps a 0–1 position onto the ladder range. */
export function radiusFromSlider(position: number, presets: FramingPreset[]): number {
  const lo = Math.log(presets[0].miles);
  const hi = Math.log(presets[presets.length - 1].miles);
  return clampRadius(Math.exp(lo + (hi - lo) * Math.min(Math.max(position, 0), 1)));
}

export function sliderFromRadius(miles: number, presets: FramingPreset[]): number {
  const lo = Math.log(presets[0].miles);
  const hi = Math.log(presets[presets.length - 1].miles);
  if (hi === lo) return 0;
  return Math.min(Math.max((Math.log(clampRadius(miles)) - lo) / (hi - lo), 0), 1);
}

export function ratioForOrientation(orientation: Orientation): number {
  return orientation === 'portrait' ? 4 / 3 : orientation === 'landscape' ? 3 / 4 : 1;
}
