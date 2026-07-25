import type { CatalogPrintKind } from '@/lib/catalog/prints';
import type { Density } from '@/lib/print/printRender';
import { SIZE_CATALOG, exportWidthForSize, type SizeLabel } from '@/lib/print/sizeCatalog';
import {
  DENSE_ROAD_TILE_ZOOM,
  PREVIEW_MAX_DENSE_WIDTH,
  maxLonSpanForDenseRoads,
  zoomForLonSpan,
} from '@/lib/print/tileZoom';
import type { Orientation } from '@/lib/print/orientation';

/**
 * How much detail a print can actually carry.
 *
 * Density was a fixed enum applied blindly, which cannot be right: whether a
 * street network reads as a network or as a grey smear is a physical property
 * of the printed sheet, not a preference. It depends on two things —
 *
 *   • how much ground is in the frame, and
 *   • how many inches of paper that ground is spread across.
 *
 * Combine them and you get GROUND MILES PER INCH OF PAPER, which is the only
 * number that matters. Every threshold below is expressed in it, so the same
 * rule covers a neighbourhood print and a print of Texas.
 *
 * Consequences that fall out of this, rather than being special-cased:
 *   • A city framed at its own extent shows every residential street on any
 *     paper size, because a city is only ~10–30 miles across.
 *   • A metro framed at 80 miles does not, because at that scale the streets
 *     would overlap into a solid tone whatever the paper size.
 *   • A state can show every town — but only once the paper is big enough to
 *     give each town label somewhere to sit.
 */

// --- Thresholds, in ground miles per inch of paper --------------------------

/**
 * Residential streets sit roughly 0.05–0.15 mi apart in a built-up area. Below
 * this they still resolve as separate lines at 300 dpi; above it they merge.
 */
const EVERY_STREET_MAX = 4.5;

/** Primary/secondary roads stay legible much further out. */
const MAIN_ROADS_MAX = 45;

/** Motorways read as structure almost to national scale. */
const HIGHWAYS_MAX = 260;

/**
 * A town label needs about half an inch of clear paper. Towns are ~5–15 mi
 * apart in settled country, so "every town" only works on a large sheet — this
 * is deliberately conservative so a small print never arrives as a wall of type.
 */
const EVERY_TOWN_MAX = 14;

/** Named towns, thinned by the base style's own importance ranking. */
const MAJOR_TOWNS_MAX = 70;

/** Beyond this only cities carry the map. */
const CITIES_MAX = 900;

export type DetailBias = -1 | 0 | 1;

export interface DensityInputs {
  kind: CatalogPrintKind;
  radiusMiles: number;
  size: SizeLabel;
  orientation: Orientation;
  bias: DetailBias;
  /**
   * Longitude span of the frame. Needed because the residential network is not
   * merely a legibility question — it has to be PRESENT in the vector tiles,
   * and which tile the render lands on depends on the span and the export size.
   */
  lonSpanDegrees?: number;
}

export interface ResolvedDensity {
  roads: Density;
  places: Density;
  /** Ground miles per inch of paper — the number the thresholds are cut on. */
  milesPerInch: number;
  /** Plain-language summary of what will actually be drawn. */
  description: string;
  /** True when the frame is showing every residential street. */
  everyStreet: boolean;
  /** True when every town in the frame is labelled. */
  everyTown: boolean;
}

/** The short side of the sheet in inches — the axis the radius is measured on. */
export function paperShortSideInches(size: SizeLabel, orientation: Orientation): number {
  const option = SIZE_CATALOG[orientation][size];
  return Math.min(option.w, option.h);
}

export function milesPerInchFor(
  radiusMiles: number,
  size: SizeLabel,
  orientation: Orientation,
): number {
  // The radius describes half the short side, so the ground across that side
  // is 2r, spread over the short side of the paper.
  return (radiusMiles * 2) / Math.max(paperShortSideInches(size, orientation), 1);
}

const ROAD_LADDER: Density[] = ['none', 'less', 'neutral', 'more'];
const PLACE_LADDER: Density[] = ['none', 'less', 'neutral', 'more'];

/**
 * How far past the comfortable threshold "Maximum" is allowed to push. Denser
 * than ideal but still resolvable at 300 dpi — beyond this the extra features
 * stop being information and become tone.
 */
const BIAS_HEADROOM = 1.6;

/**
 * Apply the user's bias, then clamp to what the sheet can physically carry.
 *
 * Without the clamp, "Maximum" on a 200-mile city frame would switch on the
 * full residential network and print a grey rectangle. Stepping DOWN is always
 * allowed — a cleaner print is never a mistake.
 */
function step(ladder: Density[], value: Density, bias: DetailBias, ceiling: Density): Density {
  const index = ladder.indexOf(value);
  const next = Math.min(Math.max(index + bias, 0), ladder.length - 1);
  return ladder[Math.min(next, ladder.indexOf(ceiling))];
}

function autoRoads(milesPerInch: number): Density {
  if (milesPerInch <= EVERY_STREET_MAX) return 'more';
  if (milesPerInch <= MAIN_ROADS_MAX) return 'neutral';
  if (milesPerInch <= HIGHWAYS_MAX) return 'less';
  return 'none';
}

function autoPlaces(milesPerInch: number): Density {
  if (milesPerInch <= EVERY_TOWN_MAX) return 'more';
  if (milesPerInch <= MAJOR_TOWNS_MAX) return 'neutral';
  if (milesPerInch <= CITIES_MAX) return 'less';
  return 'none';
}

/**
 * Whether the residential network will actually exist in the tiles this print
 * renders from. Below the threshold the layer can be switched on and nothing
 * is drawn, which is exactly how "every street" came to be a claim the artwork
 * did not honour.
 */
const MAP_AREA_FRACTION = 0.9;

export function everyStreetIsRenderable(
  lonSpanDegrees: number,
  size: SizeLabel,
  orientation: Orientation,
): boolean {
  // Bound by whichever surface is weaker. The exporter can afford a huge
  // canvas; the live preview cannot, and promising detail the screen will not
  // show is worse than showing less.
  const exportMapWidth = exportWidthForSize(size, orientation) * MAP_AREA_FRACTION;
  const widthPx = Math.min(exportMapWidth, PREVIEW_MAX_DENSE_WIDTH * MAP_AREA_FRACTION);
  return zoomForLonSpan(lonSpanDegrees, widthPx) >= DENSE_ROAD_TILE_ZOOM;
}

/**
 * The tightest frame that still cannot show every street is worth naming, so
 * the advice can be "zoom in to about 18 mi" rather than silence.
 */
export function maxRadiusForEveryStreet(
  latitudeDegrees: number,
  size: SizeLabel,
  orientation: Orientation,
): number {
  const exportMapWidth = exportWidthForSize(size, orientation) * MAP_AREA_FRACTION;
  const widthPx = Math.min(exportMapWidth, PREVIEW_MAX_DENSE_WIDTH * MAP_AREA_FRACTION);
  const maxLonSpan = maxLonSpanForDenseRoads(widthPx);
  const milesPerLon = 69 * Math.cos((latitudeDegrees * Math.PI) / 180);
  return (maxLonSpan / 2) * milesPerLon;
}

/** The densest roads setting this sheet can carry, bias included. */
function roadCeiling(milesPerInch: number): Density {
  return autoRoads(milesPerInch / BIAS_HEADROOM);
}

/** The densest place-label setting this sheet can carry, bias included. */
function placeCeiling(milesPerInch: number): Density {
  return autoPlaces(milesPerInch / BIAS_HEADROOM);
}

const ROAD_WORDS: Record<Density, string> = {
  more: 'every street',
  neutral: 'main roads',
  less: 'highways only',
  none: 'no roads',
};

const PLACE_WORDS: Record<Density, string> = {
  more: 'every town',
  neutral: 'towns and cities',
  less: 'major cities',
  none: 'no place names',
};

/**
 * Resolve what to draw. The user's bias nudges one rung either way rather than
 * overriding the physics, so "Maximum" can never produce an unreadable print
 * and "Cleaner" can never strip a city print back to nothing.
 */
export function resolveDensity({
  kind,
  radiusMiles,
  size,
  orientation,
  bias,
  lonSpanDegrees,
}: DensityInputs): ResolvedDensity {
  const milesPerInch = milesPerInchFor(radiusMiles, size, orientation);
  const roadMax = roadCeiling(milesPerInch);
  const placeMax = placeCeiling(milesPerInch);

  let roads = step(ROAD_LADDER, autoRoads(milesPerInch), bias, roadMax);
  let places = step(PLACE_LADDER, autoPlaces(milesPerInch), bias, placeMax);

  if (kind === 'city') {
    // A city print is named by its title block, so place labels inside it are
    // noise — the streets are the subject.
    places = 'none';
  } else if (kind === 'country') {
    // Roads at national scale are clutter; state outlines carry the structure.
    // "Maximum" can bring motorways back, nothing denser.
    roads = step(ROAD_LADDER, 'none', bias, 'less');
  } else {
    // A state print is a gazetteer: never show its residential streets, however
    // large the paper, or the towns stop being findable.
    if (roads === 'more') roads = 'neutral';
  }

  // Legibility said yes; now check the tiles can actually supply it.
  if (
    roads === 'more' &&
    lonSpanDegrees !== undefined &&
    !everyStreetIsRenderable(lonSpanDegrees, size, orientation)
  ) {
    roads = 'neutral';
  }

  const parts = [ROAD_WORDS[roads]];
  if (places !== 'none') parts.push(PLACE_WORDS[places]);

  return {
    roads,
    places,
    milesPerInch,
    description: `Showing ${parts.join(' and ')}`,
    everyStreet: roads === 'more',
    everyTown: places === 'more',
  };
}

/**
 * The smallest paper that would let this frame show every town — used to tell
 * the user WHY a bigger print would give them more, instead of leaving them to
 * guess.
 */
export function smallestSizeForEveryTown(
  radiusMiles: number,
  orientation: Orientation,
): SizeLabel | null {
  const sizes: SizeLabel[] = ['small', 'medium', 'large', 'xlarge'];
  return sizes.find((size) =>
    milesPerInchFor(radiusMiles, size, orientation) <= EVERY_TOWN_MAX,
  ) ?? null;
}

/** Same question for the residential street network. */
export function smallestSizeForEveryStreet(
  radiusMiles: number,
  orientation: Orientation,
  lonSpanDegrees?: number,
): SizeLabel | null {
  const sizes: SizeLabel[] = ['small', 'medium', 'large', 'xlarge'];
  return sizes.find((size) =>
    milesPerInchFor(radiusMiles, size, orientation) <= EVERY_STREET_MAX &&
    (lonSpanDegrees === undefined || everyStreetIsRenderable(lonSpanDegrees, size, orientation)),
  ) ?? null;
}
