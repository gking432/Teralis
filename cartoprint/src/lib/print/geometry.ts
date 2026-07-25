import type { Orientation } from '@/lib/print/orientation';
import { getBorderFraction, type BorderWeight } from '@/lib/print/printRender';
import { rectForSlot, slotReservesBand, type TitleDesign } from '@/lib/print/title';

/**
 * Print geometry, shared by the live preview and the export.
 *
 * Both renderers derive the map rectangle from this one function, so the frame
 * you drag on screen is the frame that gets printed. Previously the preview
 * and the exporter each computed their own layout, and the exporter also drew
 * a full-size map canvas into a smaller bordered box — a non-uniform scale that
 * visibly squashed the map whenever the border was thick.
 */

export const ORIENTATION_RATIOS: Record<Orientation, number> = {
  portrait: 4 / 3,
  landscape: 3 / 4,
  square: 1,
};

export interface NormalisedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintGeometry {
  /** Sheet height / width. */
  ratio: number;
  /** Border thickness as a fraction of sheet width (0 when there is none). */
  borderFracW: number;
  /** Border thickness as a fraction of sheet height. */
  borderFracH: number;
  /** The area the map is drawn into, including nothing else. */
  mapRect: NormalisedRect;
  /** The area the map plus its ink border occupies. */
  mapFrameRect: NormalisedRect;
  /** Aspect (height / width) of the map area — what the camera must fit. */
  mapRatio: number;
  /** The band reserved for a footer/header title, if any. */
  titleBand: { edge: 'top' | 'bottom'; height: number } | null;
}

export function printGeometry(
  orientation: Orientation,
  border: BorderWeight,
  title: Pick<TitleDesign, 'enabled' | 'slot'>,
): PrintGeometry {
  const ratio = ORIENTATION_RATIOS[orientation];

  // Border thickness is a fraction of the render WIDTH, so converting it to a
  // height fraction requires dividing by the sheet ratio.
  const borderFracW = getBorderFraction(border);
  const borderFracH = borderFracW / ratio;

  const edge = title.enabled ? slotReservesBand(title.slot) : null;
  const bandHeight = edge ? rectForSlot(title.slot).h : 0;
  const titleBand = edge ? { edge, height: bandHeight } : null;

  const frameTop = edge === 'top' ? bandHeight : 0;
  const frameHeight = 1 - bandHeight;

  const mapFrameRect: NormalisedRect = { x: 0, y: frameTop, w: 1, h: frameHeight };
  const mapRect: NormalisedRect = {
    x: borderFracW,
    y: frameTop + borderFracH,
    w: Math.max(1 - borderFracW * 2, 0.01),
    h: Math.max(frameHeight - borderFracH * 2, 0.01),
  };

  // Aspect of the map area expressed as height/width in sheet units.
  const mapRatio = (mapRect.h * ratio) / mapRect.w;

  return { ratio, borderFracW, borderFracH, mapRect, mapFrameRect, mapRatio, titleBand };
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}
