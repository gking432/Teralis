import type { PrintScene } from '@/lib/print/scene';
import { printGeometry } from '@/lib/print/geometry';
import generatedDoodles from '@/data/state_doodles.json';

export type IllustrationTheme = 'none' | 'doodle-atlas' | 'heritage' | 'topographic';
export type IllustrationLayerMode = 'map' | 'doodle' | 'minimal' | 'hidden';
export type DecorationKind =
  | 'forest'
  | 'mountains'
  | 'hills'
  | 'waves'
  | 'star'
  | 'heart'
  | 'cabin'
  | 'lighthouse'
  | 'text';

export type DecorationFont = 'hand' | 'atlas' | 'modern' | 'condensed';

export interface IllustrationLayers {
  roads: IllustrationLayerMode;
  terrain: IllustrationLayerMode;
  water: IllustrationLayerMode;
  landmarks: IllustrationLayerMode;
}

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
  source: 'automatic' | 'personal';
  layer: keyof IllustrationLayers | 'personal';
}

export interface IllustrationDesign {
  theme: IllustrationTheme;
  layers: IllustrationLayers;
  decorations: PrintDecoration[];
}

const DEFAULT_LAYERS: IllustrationLayers = {
  roads: 'minimal',
  terrain: 'doodle',
  water: 'doodle',
  landmarks: 'doodle',
};

function automatic(
  id: string,
  kind: DecorationKind,
  lng: number,
  lat: number,
  size: number,
  rotation: number,
  layer: keyof IllustrationLayers,
  text?: string,
  font: DecorationFont = 'hand',
): PrintDecoration {
  return { id, kind, anchor: 'geo', lng, lat, size, rotation, text, font, source: 'automatic', layer };
}

/**
 * A deliberately composed first edition. Coordinates are real geographic
 * anchors; the renderer projects them into whatever sheet shape the customer
 * chooses. Moving one converts it to a free sheet position.
 */
export function wisconsinDoodleDecorations(): PrintDecoration[] {
  return [
    automatic('wi-northwoods-west', 'forest', -91.05, 46.18, 1.28, -4, 'terrain'),
    automatic('wi-northwoods-center', 'forest', -89.85, 45.95, 1.42, 3, 'terrain'),
    automatic('wi-nicolet', 'forest', -88.70, 45.65, 1.22, -5, 'terrain'),
    automatic('wi-driftless-north', 'hills', -91.12, 44.15, 1.18, -7, 'terrain'),
    automatic('wi-driftless-south', 'hills', -90.63, 43.24, 1.08, 5, 'terrain'),
    automatic('wi-superior-waves', 'waves', -90.05, 46.78, 1.1, -2, 'water'),
    automatic('wi-michigan-waves', 'waves', -87.25, 44.10, 1.14, 90, 'water'),
    automatic('wi-door-light', 'lighthouse', -87.18, 45.12, 1.02, 4, 'landmarks'),
    automatic('wi-madison-star', 'star', -89.3842, 43.0747, 0.88, -8, 'landmarks'),
    automatic('wi-up-north', 'text', -89.72, 45.50, 1.18, -4, 'landmarks', 'Up North', 'hand'),
    automatic('wi-nicolet-label', 'text', -89.18, 46.13, 0.62, -5, 'terrain', 'Chequamegon–Nicolet', 'condensed'),
    automatic('wi-driftless-label', 'text', -90.60, 43.70, 0.72, -7, 'terrain', 'The Driftless', 'hand'),
    automatic('wi-door-label', 'text', -87.23, 44.80, 0.62, 72, 'landmarks', 'Door County', 'condensed'),
    automatic('wi-madison-label', 'text', -89.42, 42.82, 0.72, -2, 'landmarks', 'Madison', 'condensed'),
    automatic('wi-milwaukee-label', 'text', -87.70, 42.84, 0.68, -5, 'landmarks', 'Milwaukee', 'condensed'),
    automatic('wi-lake-michigan', 'text', -86.95, 43.83, 0.9, 88, 'water', 'Lake Michigan', 'hand'),
    automatic('wi-lake-superior', 'text', -89.73, 47.02, 0.82, -3, 'water', 'Lake Superior', 'hand'),
  ];
}

/**
 * The automatic doodle backbone.
 *
 * Every state and country print gets illustrations generated from real
 * geography — national forests become trees, computed terrain relief becomes
 * mountains and hills, named lakes get waves and lettering, and the capital
 * gets a star. The dataset is precomputed by scripts/gen-doodles.mjs from
 * bundled forest/lake/place data plus AWS elevation tiles, so every region is
 * produced by one pipeline instead of being hand-tuned map by map.
 *
 * A state can additionally carry a hand-curated set (Wisconsin) that layers
 * cultural wording and finer judgment on top; curation replaces generation.
 */
interface GeneratedDoodle {
  id: string;
  kind: string;
  lng: number;
  lat: number;
  size: number;
  rotation: number;
  text?: string;
  font?: string;
  layer: string;
}

const GENERATED: Record<string, GeneratedDoodle[]> = generatedDoodles as Record<string, GeneratedDoodle[]>;
const CURATED_DOODLE_STATES = new Set(['wisconsin']);

export function generatedDecorations(slug: string): PrintDecoration[] {
  return (GENERATED[slug] ?? []).map((item) => ({
    id: item.id,
    kind: item.kind as DecorationKind,
    anchor: 'geo' as const,
    lng: item.lng,
    lat: item.lat,
    size: item.size,
    rotation: item.rotation,
    text: item.text,
    font: (item.font ?? 'hand') as DecorationFont,
    source: 'automatic' as const,
    layer: item.layer as keyof IllustrationLayers,
  }));
}

/** The automatic illustrations for a region: curated where drawn, generated elsewhere. */
export function automaticDecorationsFor(slug: string): PrintDecoration[] {
  if (CURATED_DOODLE_STATES.has(slug)) return wisconsinDoodleDecorations();
  return generatedDecorations(slug);
}

export function hasDoodleContent(slug: string): boolean {
  return CURATED_DOODLE_STATES.has(slug) || generatedDecorations(slug).length >= 3;
}

export function defaultIllustrationDesign(slug: string, kind: PrintScene['place']['kind']): IllustrationDesign {
  if (kind === 'city') {
    return {
      theme: 'none',
      layers: { roads: 'map', terrain: 'hidden', water: 'map', landmarks: 'hidden' },
      decorations: [],
    };
  }
  return {
    theme: 'doodle-atlas',
    layers: { ...DEFAULT_LAYERS },
    decorations: automaticDecorationsFor(slug),
  };
}

export function illustrationForTheme(
  theme: IllustrationTheme,
  current: IllustrationDesign,
  slug: string,
): IllustrationDesign {
  const personal = current.decorations.filter((item) => item.source === 'personal');
  if (theme !== 'doodle-atlas') {
    return {
      theme,
      layers: {
        roads: 'map',
        terrain: theme === 'topographic' ? 'minimal' : 'hidden',
        water: 'map',
        landmarks: 'hidden',
      },
      decorations: personal,
    };
  }
  return {
    theme,
    layers: { ...DEFAULT_LAYERS },
    decorations: [...automaticDecorationsFor(slug), ...personal],
  };
}

/** Rebuild recipe elements omitted from compact share URLs, then apply edits. */
export function restoreIllustrationDesign(
  packed: IllustrationDesign,
  current: IllustrationDesign,
  slug: string,
): IllustrationDesign {
  const recipe = illustrationForTheme(packed.theme, current, slug);
  const overrides = packed.decorations ?? [];
  const overrideIds = new Set(overrides.map((item) => item.id));
  return {
    theme: packed.theme,
    layers: { ...recipe.layers, ...packed.layers },
    decorations: [
      ...recipe.decorations.filter((item) => !overrideIds.has(item.id)),
      ...overrides,
    ],
  };
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

export function visibleDecorations(scene: Pick<PrintScene, 'illustration'>): PrintDecoration[] {
  return scene.illustration.decorations.filter((item) => {
    if (item.layer === 'personal') return true;
    const mode = scene.illustration.layers[item.layer];
    if (mode === 'hidden' || mode === 'map') return false;
    if (mode === 'minimal') {
      if (item.layer === 'terrain') return false;
      if (item.layer === 'water') return item.kind === 'text';
      if (item.layer === 'landmarks') return item.kind === 'text' || item.kind === 'star';
    }
    return true;
  });
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

/** Higher wins a collision. Personal work always outranks generated scenery. */
function decorationPriority(decoration: PrintDecoration): number {
  if (decoration.source === 'personal') return 100;
  if (decoration.layer === 'landmarks') return 60;
  if (decoration.layer === 'water') return 50;
  if (decoration.kind === 'text') return 45;
  if (decoration.kind === 'forest') return 40;
  if (decoration.kind === 'mountains') return 30;
  return 20;
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
  scene: Pick<PrintScene, 'illustration' | 'viewport' | 'orientation' | 'detail' | 'title'>,
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
  return scene.illustration.decorations.filter((decoration) => keptIds.has(decoration.id));
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
    layer: 'personal',
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

function drawIcon(ctx: CanvasRenderingContext2D, kind: DecorationKind, unit: number): void {
  if (kind === 'forest') {
    drawTree(ctx, -unit * 0.38, unit * 0.08, unit * 0.72);
    drawTree(ctx, unit * 0.02, -unit * 0.05, unit * 0.92);
    drawTree(ctx, unit * 0.42, unit * 0.11, unit * 0.68);
    return;
  }
  if (kind === 'mountains') {
    line(ctx, [[-unit * 0.58, unit * 0.4], [-unit * 0.12, -unit * 0.42], [unit * 0.14, unit * 0.02], [unit * 0.34, -unit * 0.28], [unit * 0.62, unit * 0.4]]);
    line(ctx, [[-unit * 0.24, -unit * 0.2], [-unit * 0.1, -unit * 0.05], [unit * 0.01, -unit * 0.2]]);
    return;
  }
  if (kind === 'hills') {
    ctx.beginPath();
    ctx.moveTo(-unit * 0.62, unit * 0.32);
    ctx.bezierCurveTo(-unit * 0.4, -unit * 0.2, -unit * 0.12, -unit * 0.2, unit * 0.06, unit * 0.31);
    ctx.bezierCurveTo(unit * 0.25, -unit * 0.04, unit * 0.48, -unit * 0.03, unit * 0.64, unit * 0.32);
    ctx.stroke();
    return;
  }
  if (kind === 'waves') {
    [-0.22, 0.08, 0.38].forEach((row, index) => {
      ctx.beginPath();
      ctx.moveTo(-unit * 0.62, unit * row);
      ctx.bezierCurveTo(-unit * 0.38, unit * (row - 0.17), -unit * 0.18, unit * (row + 0.17), 0, unit * row);
      ctx.bezierCurveTo(unit * 0.2, unit * (row - 0.17), unit * 0.39, unit * (row + 0.17), unit * 0.62, unit * row);
      ctx.globalAlpha = index === 1 ? 1 : 0.72;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'star') {
    const points: Array<[number, number]> = [];
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? unit * 0.24 : unit * 0.56;
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (kind === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, unit * 0.48);
    ctx.bezierCurveTo(-unit * 0.68, unit * 0.02, -unit * 0.5, -unit * 0.52, -unit * 0.12, -unit * 0.32);
    ctx.bezierCurveTo(0, -unit * 0.55, unit * 0.48, -unit * 0.52, unit * 0.5, -unit * 0.13);
    ctx.bezierCurveTo(unit * 0.52, unit * 0.12, unit * 0.28, unit * 0.32, 0, unit * 0.48);
    ctx.stroke();
    return;
  }
  if (kind === 'cabin') {
    line(ctx, [[-unit * 0.52, -unit * 0.02], [0, -unit * 0.46], [unit * 0.52, -unit * 0.02]]);
    ctx.strokeRect(-unit * 0.4, -unit * 0.02, unit * 0.8, unit * 0.52);
    ctx.strokeRect(-unit * 0.11, unit * 0.18, unit * 0.22, unit * 0.32);
    line(ctx, [[unit * 0.25, -unit * 0.25], [unit * 0.25, -unit * 0.48], [unit * 0.37, -unit * 0.48], [unit * 0.37, -unit * 0.14]]);
    return;
  }
  if (kind === 'lighthouse') {
    line(ctx, [[-unit * 0.27, unit * 0.5], [-unit * 0.13, -unit * 0.24], [unit * 0.13, -unit * 0.24], [unit * 0.27, unit * 0.5]]);
    ctx.strokeRect(-unit * 0.2, -unit * 0.43, unit * 0.4, unit * 0.2);
    line(ctx, [[-unit * 0.14, -unit * 0.43], [0, -unit * 0.6], [unit * 0.14, -unit * 0.43]]);
    line(ctx, [[-unit * 0.48, -unit * 0.32], [-unit * 0.72, -unit * 0.45]]);
    line(ctx, [[unit * 0.48, -unit * 0.32], [unit * 0.72, -unit * 0.45]]);
  }
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

export function decorationCacheTag(illustration: IllustrationDesign): string {
  return [
    illustration.theme,
    illustration.layers.roads,
    illustration.layers.terrain,
    illustration.layers.water,
    illustration.layers.landmarks,
    ...illustration.decorations.map((item) => [
      item.id, item.kind, item.anchor,
      item.lng?.toFixed(4) ?? '', item.lat?.toFixed(4) ?? '',
      item.x?.toFixed(4) ?? '', item.y?.toFixed(4) ?? '',
      item.size.toFixed(3), item.rotation.toFixed(2), item.text ?? '', item.font,
      item.color ?? '', item.source, item.layer,
    ].join(',')),
  ].join('|');
}
