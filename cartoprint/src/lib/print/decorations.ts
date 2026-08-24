import type { PrintScene } from '@/lib/print/scene';
import { printGeometry } from '@/lib/print/geometry';


import type { RegionDesign } from '@/lib/print/regionDesign';

export type { RegionTheme, FeatureLevel } from '@/lib/print/regionDesign';

/**
 * Customer-placed markers.
 *
 * Automatic illustration is gone: the region editions are cartographic, and
 * hand-drawn scenery generated for fifty states looked like clip art rather
 * than a print worth hanging. What remains is what a customer puts on their
 * own map on purpose — a star or a heart where something happened, and words
 * in their own handwriting.
 */
export type DecorationKind = 'star' | 'heart' | 'text';

export type DecorationFont = 'hand' | 'atlas' | 'modern' | 'condensed';

export interface PrintDecoration {
  id: string;
  kind: DecorationKind;
  /** Geographic anchors remain attached to the real place until moved. */
  anchor: 'geo' | 'sheet';
  lng?: number;
  lat?: number;
  /** Normalised sheet coordinates, used by hand-placed elements. */
  x?: number;
  y?: number;
  size: number;
  rotation: number;
  text?: string;
  font: DecorationFont;
  color?: string;
  source: 'personal';
}

export interface MarkerDesign {
  design: RegionDesign;
  markers: PrintDecoration[];
}

export function defaultMarkers(): PrintDecoration[] {
  return [];
}

function mercatorY(latitude: number): number {
  const safe = Math.max(-85.051129, Math.min(85.051129, latitude));
  const radians = safe * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

export function decorationSheetPosition(
  scene: Pick<PrintScene, 'viewport' | 'orientation' | 'detail' | 'title'>,
  decoration: PrintDecoration,
): { x: number; y: number } {
  if (decoration.anchor === 'sheet') {
    return { x: decoration.x ?? 0.5, y: decoration.y ?? 0.5 };
  }
  const [south, north, west, east] = scene.viewport.bbox.map(Number);
  const lng = decoration.lng ?? (west + east) / 2;
  const lat = decoration.lat ?? (south + north) / 2;
  const geo = printGeometry(scene.orientation, scene.detail.border, scene.title);
  const localX = (lng - west) / Math.max(east - west, 0.000001);
  const northY = mercatorY(north);
  const southY = mercatorY(south);
  const localY = (northY - mercatorY(lat)) / Math.max(northY - southY, 0.000001);
  return {
    x: geo.mapRect.x + localX * geo.mapRect.w,
    y: geo.mapRect.y + localY * geo.mapRect.h,
  };
}

export function visibleDecorations(scene: Pick<PrintScene, 'markers'>): PrintDecoration[] {
  return scene.markers;
}

/** Footprint of a decoration on the sheet, matching what drawDecorations paints. */
function decorationFootprint(decoration: PrintDecoration): { halfW: number; halfH: number } {
  const unit = 0.044 * decoration.size;
  if (decoration.kind !== 'text') return { halfW: unit * 0.5, halfH: unit * 0.5 };
  return {
    halfW: Math.max(0.05, (decoration.text?.length ?? 4) * unit * 0.24),
    halfH: unit * 0.42,
  };
}

/** Higher wins a collision. Words outrank symbols; nothing outranks the customer. */
function decorationPriority(decoration: PrintDecoration): number {
  return decoration.kind === 'text' ? 60 : 50;
}

/** A label and the glyph it names travel together and may sit close. */
function decorationFamily(id: string): string {
  return id.replace(/-label(-\d+)?$/, '').replace(/-\d+$/, '');
}

/**
 * What actually gets drawn, after collisions are resolved.
 *
 * Illustrations are anchored to real coordinates, so the same set of marks
 * crowds differently on every state, every orientation, and every zoom — a
 * lake label printed through a mountain is what makes a map look cheap. Rather
 * than hand-tuning each region, lower-priority scenery yields to higher at
 * render time, so the composition stays clean wherever the customer takes it.
 * The renderer, the live overlay, and /selftest all read this one function.
 */
export function layoutDecorations(
  scene: Pick<PrintScene, 'markers' | 'viewport' | 'orientation' | 'detail' | 'title'>,
): PrintDecoration[] {
  const candidates = visibleDecorations(scene)
    .map((decoration) => ({
      decoration,
      position: decorationSheetPosition(scene, decoration),
      footprint: decorationFootprint(decoration),
      priority: decorationPriority(decoration),
    }))
    .sort((a, b) => b.priority - a.priority);

  const kept: typeof candidates = [];
  for (const candidate of candidates) {
    const clashes = kept.some((other) => {
      if (decorationFamily(other.decoration.id) === decorationFamily(candidate.decoration.id)) return false;
      const overlapX = Math.abs(other.position.x - candidate.position.x)
        < (other.footprint.halfW + candidate.footprint.halfW) * 0.82;
      const overlapY = Math.abs(other.position.y - candidate.position.y)
        < (other.footprint.halfH + candidate.footprint.halfH) * 0.82;
      return overlapX && overlapY;
    });
    if (!clashes) kept.push(candidate);
  }

  // Restore the scene's own order so drawing stays predictable.
  const keptIds = new Set(kept.map((entry) => entry.decoration.id));
  return scene.markers.filter((marker) => keptIds.has(marker.id));
}

export function createPersonalDecoration(
  kind: DecorationKind,
  index: number,
  text?: string,
): PrintDecoration {
  return {
    id: `personal-${Date.now().toString(36)}-${index}`,
    kind,
    anchor: 'sheet',
    x: 0.5 + ((index % 3) - 1) * 0.08,
    y: 0.46 + (index % 4) * 0.07,
    size: kind === 'text' ? 0.82 : 0.72,
    rotation: 0,
    text: kind === 'text' ? (text || 'Where We Met') : undefined,
    font: kind === 'text' ? 'hand' : 'atlas',
    source: 'personal',
  };
}

function resolvedFont(font: DecorationFont): string {
  if (typeof document !== 'undefined') {
    const variable = font === 'hand'
      ? '--font-hand'
      : font === 'condensed'
        ? '--font-condensed'
        : font === 'modern'
          ? '--font-body'
          : '--font-display';
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    if (value) return value;
  }
  if (font === 'hand') return 'cursive';
  if (font === 'modern' || font === 'condensed') return 'sans-serif';
  return 'serif';
}

function line(ctx: CanvasRenderingContext2D, points: Array<[number, number]>): void {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  line(ctx, [[x, y + scale * 0.52], [x, y + scale * 0.12]]);
  line(ctx, [[x - scale * 0.24, y + scale * 0.23], [x, y - scale * 0.42], [x + scale * 0.24, y + scale * 0.23]]);
  line(ctx, [[x - scale * 0.31, y + scale * 0.39], [x, y - scale * 0.17], [x + scale * 0.31, y + scale * 0.39]]);
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: Exclude<DecorationKind, 'text'>, unit: number): void {
  const r = unit * 0.5;
  ctx.beginPath();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r : r * 0.42;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    // Heart: two lobes over a point, drawn as one path so it fills cleanly.
    ctx.moveTo(0, r * 0.85);
    ctx.bezierCurveTo(-r * 1.35, -r * 0.1, -r * 0.55, -r * 1.05, 0, -r * 0.35);
    ctx.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.35, -r * 0.1, 0, r * 0.85);
    ctx.closePath();
  }
  ctx.fill();
}

export function drawDecorations(
  ctx: CanvasRenderingContext2D,
  scene: PrintScene,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const ink = scene.colors.roads || scene.colors.water || '#283a34';
  layoutDecorations(scene).forEach((decoration) => {
    const position = decorationSheetPosition(scene, decoration);
    const x = position.x * canvasWidth;
    const y = position.y * canvasHeight;
    const unit = canvasWidth * 0.044 * decoration.size;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(decoration.rotation * Math.PI / 180);
    ctx.strokeStyle = decoration.color || ink;
    ctx.fillStyle = decoration.color || ink;
    ctx.lineWidth = Math.max(1.5, canvasWidth * 0.00165);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (decoration.kind === 'text') {
      const size = unit * 0.78;
      ctx.font = `${decoration.font === 'atlas' ? 500 : 600} ${size}px ${resolvedFont(decoration.font)}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(decoration.text || '', 0, 0);
    } else {
      drawIcon(ctx, decoration.kind, unit);
    }
    ctx.restore();
  });
}

export function markerCacheTag(design: RegionDesign, markers: PrintDecoration[]): string {
  return [
    design.theme,
    design.roads,
    design.places,
    design.elevation,
    design.rivers,
    design.counties ? 'c1' : 'c0',
    ...markers.map((item) => [
      item.id,
      item.kind,
      item.anchor,
      (item.lng ?? item.x ?? 0).toFixed(3),
      (item.lat ?? item.y ?? 0).toFixed(3),
      item.size.toFixed(2),
      item.rotation.toFixed(1),
      item.text ?? '',
      item.font,
    ].join('~')),
  ].join('|');
}
