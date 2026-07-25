import type { Density } from '@/lib/print/printRender';

/**
 * Making sure the tiles actually contain the detail we ask for.
 *
 * This is the constraint that layer settings cannot fix. Vector tiles are
 * generalised by zoom: the OpenMapTiles `transportation` layer only carries
 * minor/residential/service roads from about z12. Below that the geometry is
 * simply not in the tile, so switching the layer on draws nothing, however
 * confident the settings look.
 *
 * The old renderer worked around this by drawing every dense print on a
 * 2400px-wide offscreen canvas, which forced `fitBounds` to a high zoom. When
 * the preview became a live map sized to the screen (~630px of map area on a
 * desktop) the camera dropped to roughly z11.5 and the residential network
 * silently disappeared — the settings still said "every street".
 *
 * The fix is to render the live map on an oversized canvas and scale it down
 * with a CSS transform. MapLibre divides pointer coordinates by the element's
 * scale, so panning and zooming stay correct.
 */

/**
 * Zoom at which the residential street network is present in the tiles.
 * MapLibre requests the tile at floor(zoom), so this needs to clear 12, not
 * merely approach it.
 */
export const DENSE_ROAD_MIN_ZOOM = 12.2;

/**
 * The tile that actually contains the minor road network. MapLibre requests
 * floor(zoom), so clearing this integer is the real test; DENSE_ROAD_MIN_ZOOM
 * above simply adds margin when we choose a canvas size.
 *
 * Measured, not assumed: a camera at z=12.2 requests /12/ tiles and a camera at
 * z=11.81 requests /11/ tiles.
 */
export const DENSE_ROAD_TILE_ZOOM = 12;

/**
 * MapLibre's zoom convention for vector sources is 512px tiles, not 256.
 * Verified against a live map rather than assumed: a canvas 1076 CSS px wide
 * showing a 0.30002 degree span reports getZoom() === 11.30, which is
 * log2(360 * 1076 / (512 * 0.30002)) exactly. With 256 the formula predicts
 * 12.30 — a full zoom level of error, and precisely the amount by which the
 * residential roads were missing.
 */
const TILE_SIZE = 512;

/**
 * Ceilings on the oversized canvas. Bounding the CANVAS rather than the
 * multiplier matters: a phone starts from a much smaller display, so a factor
 * cap would leave small screens short of the zoom they need while large
 * screens sailed past it.
 *
 * The width cap is the usual WebGL texture limit; the area cap keeps us under
 * the canvas budget mobile browsers enforce (iOS is the tightest at ~16.7M).
 */
const MAX_DENSE_CANVAS_WIDTH = 4096;
const MAX_DENSE_CANVAS_PIXELS = 16_000_000;

/**
 * The zoom `fitBounds` will choose for a bbox on a canvas of a given CSS width.
 * Longitude is linear in Web Mercator, so the horizontal fit is exact.
 */
export function zoomForLonSpan(lonSpanDegrees: number, canvasWidthCss: number): number {
  const span = Math.max(Math.abs(lonSpanDegrees), 1e-9);
  const width = Math.max(canvasWidthCss, 1);
  return Math.log2((360 * width) / (TILE_SIZE * span));
}

export function lonSpanOf(bbox: [string, string, string, string]): number {
  const [, , west, east] = bbox.map(Number);
  return Math.abs(east - west);
}

/**
 * How much larger than its displayed size the map canvas must be for the
 * requested road density to exist in the tiles.
 *
 * Returns 1 whenever the frame is already zoomed in far enough, or when the
 * print is not asking for the dense network — main roads and motorways are
 * present at low zoom, so those cost nothing extra.
 */
export function supersampleFactor(
  bbox: [string, string, string, string],
  displayWidthCss: number,
  roads: Density,
  displayHeightCss?: number,
): number {
  if (roads !== 'more' || displayWidthCss <= 0) return 1;

  const zoom = zoomForLonSpan(lonSpanOf(bbox), displayWidthCss);
  if (zoom >= DENSE_ROAD_MIN_ZOOM) return 1;

  // Doubling the canvas width adds exactly one zoom level.
  const wanted = Math.pow(2, DENSE_ROAD_MIN_ZOOM - zoom);

  const height = displayHeightCss && displayHeightCss > 0 ? displayHeightCss : displayWidthCss;
  const byWidth = MAX_DENSE_CANVAS_WIDTH / displayWidthCss;
  const byArea = Math.sqrt(MAX_DENSE_CANVAS_PIXELS / (displayWidthCss * height));

  return Math.max(Math.min(wanted, byWidth, byArea), 1);
}

/**
 * The widest frame, in degrees of longitude, whose residential network can be
 * reached on a canvas of the given width.
 */
export function maxLonSpanForDenseRoads(canvasWidthCss: number): number {
  return (360 * canvasWidthCss) / (TILE_SIZE * Math.pow(2, DENSE_ROAD_TILE_ZOOM));
}

/**
 * The largest canvas the live preview will ever build, in CSS px of width.
 * The preview — not the exporter — is the binding constraint on whether we can
 * honestly promise every street, because a promise the screen cannot keep is
 * the whole complaint.
 */
export const PREVIEW_MAX_DENSE_WIDTH = MAX_DENSE_CANVAS_WIDTH;

/**
 * The width the export must render at for the same reason. Mirrors the
 * preview so the two stay the same picture.
 */
export function denseExportWidth(
  bbox: [string, string, string, string],
  targetWidth: number,
  roads: Density,
  targetHeight?: number,
): number {
  return Math.round(targetWidth * supersampleFactor(bbox, targetWidth, roads, targetHeight));
}
