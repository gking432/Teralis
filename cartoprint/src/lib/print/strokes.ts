/**
 * WYSIWYG stroke scaling.
 *
 * MapLibre line widths and text sizes are expressed in CSS pixels, and the
 * camera zoom that `fitBounds` picks for a given bounding box depends on the
 * canvas size. That means the same style rendered into a 900px preview and a
 * 3600px export does NOT produce the same-looking artwork: the export lands at
 * a higher zoom (thicker strokes from the interpolation curve) but each stroke
 * covers proportionally fewer pixels of a much larger canvas.
 *
 * We fix this by authoring every print stroke curve once, at a single
 * reference canvas width, and then re-projecting the curve for whatever canvas
 * we happen to be drawing into:
 *
 *   zoomOffset  = log2(width / REFERENCE_WIDTH)
 *   widthScale  = width / REFERENCE_WIDTH
 *
 * A canvas of `width` fitting the same bbox sits at `z_ref + zoomOffset`, so
 * shifting every stop by `+zoomOffset` makes the expression evaluate to the
 * reference stop value at the corresponding zoom, and multiplying by
 * `widthScale` restores the same stroke-width-to-canvas-width ratio.
 *
 * Net effect: the live preview and the 300 DPI export are the same picture.
 */

export const STROKE_REFERENCE_WIDTH = 1200;

export interface StrokeScale {
  /** Added to every zoom stop. */
  zoomOffset: number;
  /** Multiplied into every width / text size. */
  widthScale: number;
}

export const UNSCALED: StrokeScale = { zoomOffset: 0, widthScale: 1 };

export function strokeScaleFor(canvasWidth: number): StrokeScale {
  const ratio = Math.max(canvasWidth, 1) / STROKE_REFERENCE_WIDTH;
  return { zoomOffset: Math.log2(ratio), widthScale: ratio };
}

/** [zoom, value] pairs authored at STROKE_REFERENCE_WIDTH. */
export type Stops = Array<[number, number]>;

type InterpolateExpression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
];

/**
 * Re-project reference stops onto the given canvas scale, optionally applying
 * an extra per-look weight multiplier (a "fine lines" look vs a "bold" look).
 */
export function scaledWidth(
  stops: Stops,
  scale: StrokeScale,
  weight = 1,
): InterpolateExpression {
  const flat: number[] = [];
  for (const [zoom, value] of stops) {
    flat.push(zoom + scale.zoomOffset, Math.max(value * scale.widthScale * weight, 0));
  }
  return ['interpolate', ['linear'], ['zoom'], ...flat];
}

/** Scale a single non-zoom-dependent value (halo widths, fixed line widths). */
export function scaledValue(value: number, scale: StrokeScale, weight = 1): number {
  return Math.max(value * scale.widthScale * weight, 0);
}

/**
 * Shift a zoom range so a layer becomes visible at the equivalent moment on
 * any canvas size. Clamped to MapLibre's legal 0–24 window.
 */
export function scaledZoomRange(
  min: number,
  max: number,
  scale: StrokeScale,
): [number, number] {
  const lo = Math.min(Math.max(min + scale.zoomOffset, 0), 24);
  const hi = Math.min(Math.max(max + scale.zoomOffset, 0), 24);
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

// --- Canonical print stroke curves, authored at STROKE_REFERENCE_WIDTH ---

export const STROKE_CURVES = {
  highway: [[3, 0.5], [6, 0.9], [9, 1.5], [13, 2.4]] as Stops,
  mainRoad: [[4, 0.4], [7, 0.75], [10, 1.2], [13, 1.8]] as Stops,
  street: [[4, 0.15], [7, 0.35], [10, 0.65], [13, 1.0]] as Stops,
  waterway: [[4, 0.35], [8, 0.7], [12, 1.15]] as Stops,
  stateBorder: [[2, 1.0], [4, 1.7], [6, 2.6], [9, 3.4]] as Stops,
  countyBorder: [[3, 0.55], [6, 0.65], [10, 0.8]] as Stops,
} as const;

export const TEXT_CURVES = {
  city: [[3, 11], [6, 13], [10, 15]] as Stops,
  town: [[4, 9], [7, 11], [10, 12]] as Stops,
  denseTown: [[3, 8], [7, 10], [10, 11]] as Stops,
  state: [[2, 8], [4, 11], [7, 14]] as Stops,
} as const;
