import { parseHex } from '@/lib/print/contrast';
import type { NormalisedRect } from '@/lib/print/geometry';

/**
 * Finding somewhere on the water to put the title.
 *
 * A translucent label offered as a generic placement lands wherever it happens
 * to land — usually over the densest part of the city, where it is unreadable.
 * The treatment only works on open water: white type on a navy lake reads
 * beautifully, and the lake is the one part of the map with nothing in it.
 *
 * So rather than offer it as a position the user has to aim, we find the
 * largest label-shaped rectangle of open water in the frame and put it there.
 *
 * The mask comes from the rendered pixels rather than from feature queries.
 * We chose the water colour ourselves, so it is exactly known, and one canvas
 * readback is far cheaper than thousands of `queryRenderedFeatures` calls.
 */

/** Width of the sampling grid. Height follows the canvas aspect. */
const SAMPLE_WIDTH = 150;

/** How close a pixel must be to the water colour, per channel, summed. */
const COLOR_TOLERANCE = 48;

/** Shape of the label we are looking for: wide and short. */
const TARGET_ASPECT = 4.2;

/** Leave a margin inside the shoreline so the words do not touch land. */
const INSET = 0.86;

/** Reject placements too small to hold a readable title. */
const MIN_WIDTH_FRACTION = 0.24;

export interface WaterPlacement {
  /** Rect in MAP-area coordinates, normalised 0–1. */
  rect: NormalisedRect;
  /** Fraction of the map area that is water — useful for deciding to offer it. */
  waterShare: number;
}

function buildWaterMask(
  source: HTMLCanvasElement,
  waterHex: string,
): { mask: Uint8Array; width: number; height: number; share: number } | null {
  const aspect = source.height / Math.max(source.width, 1);
  const width = SAMPLE_WIDTH;
  const height = Math.max(Math.round(SAMPLE_WIDTH * aspect), 1);

  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(source, 0, 0, width, height);
  } catch {
    return null;
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // Tainted canvas — nothing we can do, fall back to a fixed placement.
    return null;
  }

  const target = parseHex(waterHex);
  const mask = new Uint8Array(width * height);
  let hits = 0;

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const distance =
      Math.abs(data[offset] - target.r) +
      Math.abs(data[offset + 1] - target.g) +
      Math.abs(data[offset + 2] - target.b);
    if (distance <= COLOR_TOLERANCE) {
      mask[i] = 1;
      hits += 1;
    }
  }

  return { mask, width, height, share: hits / (width * height) };
}

/**
 * Largest rectangle of the requested aspect that fits inside the mask.
 *
 * Standard largest-rectangle-in-histogram sweep, but instead of taking the
 * maximum-area rectangle we take the largest one matching the label's shape:
 * a long thin band of water is more useful to us than a big round one.
 */
function largestAspectRect(
  mask: Uint8Array,
  width: number,
  height: number,
  aspectInPixels: number,
): { x: number; y: number; w: number; h: number } | null {
  const heights = new Int32Array(width);
  let best: { x: number; y: number; w: number; h: number; area: number } | null = null;

  const consider = (left: number, right: number, barHeight: number, bottomRow: number) => {
    const spanWidth = right - left + 1;
    if (spanWidth <= 0 || barHeight <= 0) return;
    // Fit the largest label-shaped rect inside this span.
    const w = Math.min(spanWidth, barHeight * aspectInPixels);
    const h = w / aspectInPixels;
    if (h < 1 || w < 1) return;
    const area = w * h;
    if (best && area <= best.area) return;
    // Centre it inside the span it was found in.
    const x = left + (spanWidth - w) / 2;
    const y = bottomRow + 1 - barHeight + (barHeight - h) / 2;
    best = { x, y, w, h, area };
  };

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      heights[col] = mask[row * width + col] ? heights[col] + 1 : 0;
    }

    // Monotonic stack over this row's histogram.
    const stack: number[] = [];
    for (let col = 0; col <= width; col += 1) {
      const current = col === width ? 0 : heights[col];
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= current) {
        const top = stack.pop()!;
        const left = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
        consider(left, col - 1, heights[top], row);
      }
      stack.push(col);
    }
  }

  return best;
}

/**
 * Locate the best water placement in the currently rendered map.
 *
 * `mapCanvas` is the live MapLibre canvas (or the offscreen export canvas);
 * the returned rect is normalised to that canvas, which is the MAP area — the
 * caller converts it into sheet coordinates.
 */
export function findWaterPlacement(
  mapCanvas: HTMLCanvasElement,
  waterHex: string,
  sheetAspect: number,
): WaterPlacement | null {
  const built = buildWaterMask(mapCanvas, waterHex);
  if (!built) return null;
  const { mask, width, height, share } = built;
  if (share < 0.02) return null;

  // The label's aspect is expressed on the sheet; convert it into the mask's
  // pixel grid, which has its own aspect.
  const aspectInPixels = TARGET_ASPECT * (height / Math.max(width, 1)) / Math.max(sheetAspect, 0.0001);
  const found = largestAspectRect(mask, width, height, aspectInPixels);
  if (!found) return null;

  const w = (found.w / width) * INSET;
  const h = (found.h / height) * INSET;
  if (w < MIN_WIDTH_FRACTION) return null;

  const cx = (found.x + found.w / 2) / width;
  const cy = (found.y + found.h / 2) / height;

  return {
    rect: {
      x: Math.min(Math.max(cx - w / 2, 0), 1 - w),
      y: Math.min(Math.max(cy - h / 2, 0), 1 - h),
      w,
      h,
    },
    waterShare: share,
  };
}

/** Convert a rect in map-area space into sheet space. */
export function mapRectToSheet(rect: NormalisedRect, mapRect: NormalisedRect): NormalisedRect {
  return {
    x: mapRect.x + rect.x * mapRect.w,
    y: mapRect.y + rect.y * mapRect.h,
    w: rect.w * mapRect.w,
    h: rect.h * mapRect.h,
  };
}
