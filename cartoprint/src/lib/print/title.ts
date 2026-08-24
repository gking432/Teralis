import { contrastRatio, isDark, makePrintable, readableInk } from '@/lib/print/contrast';
import type { PreviewColorSettings } from '@/lib/print/colorSchemes';

/**
 * The unified title model.
 *
 * Previously a footer title was baked into the map canvas by the renderer
 * while a "glass" title was a separate DOM overlay — two implementations, two
 * behaviours, three competing text-fitting schemes, and the DOM one was
 * mouse-only so it did not work on touch at all.
 *
 * Now there is exactly one model: a rectangle on the print, positioned either
 * by a named snap slot or freely, with one shared typography + fitting
 * routine that the live overlay and the export canvas both call. What you drag
 * is what gets printed.
 */

export type TitleSlot =
  | 'footer'
  | 'footer-tall'
  | 'top-left'
  | 'top-band'
  | 'bottom-left'
  | 'side-rail'
  | 'free';

export type TitlePanel = 'solid' | 'glass' | 'none';
export type TitleAlign = 'left' | 'center';
export type TitleFont = 'editorial' | 'hand' | 'modern' | 'condensed';

export interface TitleDesign {
  enabled: boolean;
  text: string;
  subtitle: string;
  detail: string;
  slot: TitleSlot;
  panel: TitlePanel;
  align: TitleAlign;
  font: TitleFont;
  /** Undefined means "derive from the palette" — the safe default. */
  textColor?: string;
  panelColor?: string;
  /** Sampled map color beneath a freely placed transparent/glass label. */
  backdropColor?: string;
  /**
   * True when the block is sitting on open water, so its colours must be
   * derived from the water rather than the paper. This is what makes the
   * treatment work: white type on a navy lake pops, white type on white land
   * disappears.
   */
  onWater: boolean;
  /**
   * True while the position is being chosen for the user. Cleared the moment
   * they drag it, so an automatic placement never fights a deliberate one.
   */
  autoPlaced: boolean;
  /** Normalised rect on the print. Authoritative when slot === 'free'. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface TitleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotOption {
  slot: TitleSlot;
  label: string;
  align: TitleAlign;
}

/**
 * Slot geometry, normalised to the print. `footer` reserves a band at the
 * bottom of the sheet; the map is inset above it so nothing is covered.
 */
const SLOT_RECTS: Record<Exclude<TitleSlot, 'free'>, TitleRect> = {
  footer: { x: 0, y: 0.875, w: 1, h: 0.125 },
  'footer-tall': { x: 0, y: 0.825, w: 1, h: 0.175 },
  'top-band': { x: 0, y: 0, w: 1, h: 0.115 },
  'top-left': { x: 0.055, y: 0.05, w: 0.4, h: 0.1 },
  'bottom-left': { x: 0.055, y: 0.85, w: 0.4, h: 0.095 },
  'side-rail': { x: 0.045, y: 0.18, w: 0.115, h: 0.64 },
};

export const SLOT_OPTIONS: SlotOption[] = [
  { slot: 'footer', label: 'Footer', align: 'center' },
  { slot: 'footer-tall', label: 'Poster', align: 'center' },
  { slot: 'top-band', label: 'Header', align: 'center' },
  { slot: 'top-left', label: 'Plaque', align: 'left' },
  { slot: 'bottom-left', label: 'Corner', align: 'left' },
  { slot: 'side-rail', label: 'Spine', align: 'center' },
];

/** Slots that reserve their own band, pushing the map out of the way. */
export function slotReservesBand(slot: TitleSlot): 'bottom' | 'top' | null {
  if (slot === 'footer' || slot === 'footer-tall') return 'bottom';
  if (slot === 'top-band') return 'top';
  return null;
}

export function rectForSlot(slot: TitleSlot, design?: TitleDesign): TitleRect {
  if (slot === 'free') {
    return design
      ? { x: design.x, y: design.y, w: design.w, h: design.h }
      : { x: 0.19, y: 0.08, w: 0.62, h: 0.12 };
  }
  return SLOT_RECTS[slot];
}

/** The rect actually used for rendering, whichever positioning mode is active. */
export function resolvedRect(design: TitleDesign): TitleRect {
  return rectForSlot(design.slot, design);
}

/**
 * Snap a freely-dragged rect to the nearest slot when it lands close enough.
 * This is what makes free placement feel unlimited but land somewhere good.
 */
const SNAP_DISTANCE = 0.055;

export function snapToSlot(rect: TitleRect): { slot: TitleSlot; rect: TitleRect } {
  let best: { slot: TitleSlot; rect: TitleRect; score: number } | null = null;

  for (const { slot } of SLOT_OPTIONS) {
    const candidate = SLOT_RECTS[slot as Exclude<TitleSlot, 'free'>];
    const dx = (candidate.x + candidate.w / 2) - (rect.x + rect.w / 2);
    const dy = (candidate.y + candidate.h / 2) - (rect.y + rect.h / 2);
    const distance = Math.hypot(dx, dy);
    const sizeRatio = (candidate.w * candidate.h) / Math.max(rect.w * rect.h, 0.0001);
    if (distance >= SNAP_DISTANCE || sizeRatio <= 0.45 || sizeRatio >= 2.2) continue;

    // Score on position AND footprint. Distance alone lets a taller poster band
    // steal a footer-sized block just because its centre sits fractionally
    // closer — the block the user is dragging should land in the slot that is
    // actually its own size.
    const sizePenalty = Math.abs(Math.log(sizeRatio)) * SNAP_DISTANCE * 0.6;
    const score = distance + sizePenalty;
    if (!best || score < best.score) best = { slot, rect: candidate, score };
  }

  return best ? { slot: best.slot, rect: best.rect } : { slot: 'free', rect };
}

// --- Colors -----------------------------------------------------------------

export interface ResolvedTitleColors {
  text: string;
  panel: string;
  /** Panel alpha — glass panels let the map through. */
  panelAlpha: number;
  /** True when the panel is not drawn at all. */
  transparent: boolean;
}

/** The actual surface behind title text, shared by the controls and renderer. */
export function titleBackdropColor(
  design: TitleDesign,
  colors: PreviewColorSettings,
): string {
  const paper = colors.land || '#ffffff';
  const water = colors.water || colors.roads || '#07122a';
  if (design.panel === 'none') {
    return design.backdropColor || (design.onWater ? water : paper);
  }
  return design.panelColor || (design.onWater ? water : paper);
}

/** Preserve the requested hue while guaranteeing that it will print clearly. */
export function printableTitleTextColor(
  design: TitleDesign,
  colors: PreviewColorSettings,
  requested: string,
): string {
  return makePrintable(requested, titleBackdropColor(design, colors));
}

/** Exchange the colors the customer can currently see, not unresolved defaults. */
export function swappedTitleColors(
  design: TitleDesign,
  colors: PreviewColorSettings,
): Pick<TitleDesign, 'textColor' | 'panelColor'> {
  const resolved = resolveTitleColors(design, colors);
  return {
    textColor: resolved.panel,
    panelColor: resolved.text,
  };
}

/**
 * Derive title colors from the palette unless explicitly overridden. Auto
 * derivation guarantees a readable pairing, which is why it is the default
 * and why the manual override runs through the same contrast guard.
 */
export function resolveTitleColors(
  design: TitleDesign,
  colors: PreviewColorSettings,
): ResolvedTitleColors {
  const paper = colors.land || '#ffffff';
  const ink = colors.useMapDefault ? '#4a4a48' : (colors.water || colors.roads || '#07122a');
  const water = colors.water || ink;

  if (design.panel === 'none') {
    // Text sits directly on the map. What it has to read against depends on
    // WHAT is underneath: open water for the on-the-water layout, paper
    // otherwise. Deriving from the paper while floating on a navy lake is
    // exactly how the label became invisible.
    const backdrop = titleBackdropColor(design, colors);
    // On water, prefer the paper colour — white type on a dark lake is the
    // look — falling back to whatever actually contrasts.
    const preferred = design.onWater ? paper : ink;
    return {
      text: design.textColor && contrastRatio(design.textColor, backdrop) >= 3
        ? design.textColor
        : readableInk(backdrop, preferred),
      panel: backdrop,
      panelAlpha: 0,
      transparent: true,
    };
  }

  const panel = titleBackdropColor(design, colors);
  const glass = design.panel === 'glass';
  // On a glass panel the effective background is a blend of the panel and the
  // map beneath it, so pick text against the panel but bias toward the safer
  // of the two when the panel is very translucent.
  const backdrop = glass
    ? design.backdropColor || (isDark(panel) ? panel : paper)
    : panel;

  return {
    text: design.textColor && contrastRatio(design.textColor, backdrop) >= 3
      ? design.textColor
      : readableInk(backdrop, ink),
    panel,
    panelAlpha: glass ? 0.66 : 1,
    transparent: false,
  };
}

// --- Typography: ONE fitting algorithm, shared by DOM and canvas ------------

export interface TitleTypography {
  /** All sizes are fractions of the title block's HEIGHT. */
  titleSize: number;
  subtitleSize: number;
  detailSize: number;
  titleTracking: number;
  subtitleTracking: number;
  detailTracking: number;
  gap: number;
  /** Horizontal shrink applied when the text is wider than the block. */
  fitScale: number;
  vertical: boolean;
}

const TITLE_FONT = '"Cormorant Garamond", Georgia, serif';
const BODY_FONT = '"DM Sans", system-ui, sans-serif';

export const TITLE_FONT_STACK = TITLE_FONT;
export const BODY_FONT_STACK = BODY_FONT;

export const TITLE_FONT_OPTIONS: Array<{ value: TitleFont; label: string; sample: string }> = [
  { value: 'editorial', label: 'Editorial', sample: 'Wisconsin' },
  { value: 'hand', label: 'Hand drawn', sample: 'Up North' },
  { value: 'modern', label: 'Modern', sample: 'WISCONSIN' },
  { value: 'condensed', label: 'Atlas', sample: 'WISCONSIN' },
];

/**
 * Type specimens shown in the lettering picker. They must read as the
 * customer's own print — a Colorado buyer being shown four samples that all
 * say "Wisconsin" is being shown someone else's map.
 */
export function titleFontSamples(title: string): Array<{ value: TitleFont; label: string; sample: string }> {
  const words = title.trim() || 'Your place';
  return [
    { value: 'editorial', label: 'Editorial', sample: words },
    { value: 'hand', label: 'Hand drawn', sample: words },
    { value: 'modern', label: 'Modern', sample: words.toUpperCase() },
    { value: 'condensed', label: 'Atlas', sample: words.toUpperCase() },
  ];
}

export function titleFontCss(font: TitleFont): string {
  if (font === 'hand') return 'var(--font-hand), cursive';
  if (font === 'modern') return 'var(--font-body), system-ui, sans-serif';
  if (font === 'condensed') return 'var(--font-condensed), sans-serif';
  return 'var(--font-display), Georgia, serif';
}

/** Canvas needs the generated next/font face, which is stored in the CSS var. */
export function titleFontCanvas(font: TitleFont): string {
  if (typeof document !== 'undefined') {
    const variable = font === 'hand'
      ? '--font-hand'
      : font === 'modern'
        ? '--font-body'
        : font === 'condensed'
          ? '--font-condensed'
          : '--font-display';
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    if (resolved) return resolved;
  }
  if (font === 'hand') return 'cursive';
  if (font === 'modern' || font === 'condensed') return 'sans-serif';
  return TITLE_FONT;
}

export function displayTitleText(design: Pick<TitleDesign, 'text' | 'font'>): string {
  const value = design.text.trim();
  return design.font === 'hand' ? value : value.toUpperCase();
}

let measureContext: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureContext) {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    measureContext = canvas.getContext('2d');
  }
  return measureContext;
}

/**
 * Measure a tracked, uppercased string at a given pixel size. Letter-spacing
 * is applied manually because `ctx.letterSpacing` is not universally supported
 * and we need the DOM and the canvas to agree to the pixel.
 */
function measureTracked(text: string, fontSpec: string, size: number, tracking: number): number {
  const context = getMeasureContext();
  if (!context) {
    // Server-side estimate — only used for the very first paint before hydration.
    return text.length * size * (0.52 + tracking);
  }
  context.font = fontSpec;
  return context.measureText(text).width + Math.max(text.length - 1, 0) * size * tracking;
}

/**
 * Compute the typography for a title block. This is the single source of truth:
 * `TitleOverlay` renders it as DOM, `bakeTitle` renders it to canvas, and they
 * therefore produce the same picture.
 */
export function titleTypography(
  design: TitleDesign,
  blockWidthPx: number,
  blockHeightPx: number,
): TitleTypography {
  const title = displayTitleText(design);
  const subtitle = design.subtitle.trim().toUpperCase();
  const detail = design.detail.trim().toUpperCase();
  const titleFont = titleFontCanvas(design.font ?? 'editorial');
  const hasSubtitle = subtitle.length > 0;
  const hasDetail = detail.length > 0;
  const vertical = design.slot === 'side-rail';

  // A vertical spine swaps which axis constrains the type.
  const alongPx = vertical ? blockHeightPx : blockWidthPx;
  const acrossPx = vertical ? blockWidthPx : blockHeightPx;

  const lines = 1 + (hasSubtitle ? 1 : 0) + (hasDetail ? 1 : 0);
  // Title claims most of the cross-axis; extra lines shrink it proportionally.
  const titleFraction = lines === 1 ? 0.46 : lines === 2 ? 0.34 : 0.28;
  const gap = lines === 1 ? 0 : 0.06;

  const titleSizePx = acrossPx * titleFraction;
  const subtitleSizePx = acrossPx * (lines === 3 ? 0.13 : 0.15);
  const detailSizePx = acrossPx * 0.105;

  // Longer names get tighter tracking so they stay on one line for longer.
  const tracking = design.font === 'hand' ? 0.015
    : title.length > 24 ? 0.06
    : title.length > 16 ? 0.1
      : title.length > 10 ? 0.16
        : 0.24;

  const padding = 0.92; // keep the text off the block edges
  const widths = [
    measureTracked(title, `${design.font === 'hand' ? 600 : 300} ${titleSizePx}px ${titleFont}`, titleSizePx, tracking),
    hasSubtitle ? measureTracked(subtitle, `400 ${subtitleSizePx}px ${BODY_FONT}`, subtitleSizePx, 0.24) : 0,
    hasDetail ? measureTracked(detail, `400 ${detailSizePx}px ${BODY_FONT}`, detailSizePx, 0.14) : 0,
  ];
  const widest = Math.max(...widths, 1);
  const available = alongPx * padding;
  const fitScale = widest > available ? available / widest : 1;

  return {
    titleSize: titleFraction,
    subtitleSize: lines === 3 ? 0.13 : 0.15,
    detailSize: 0.105,
    titleTracking: tracking,
    subtitleTracking: 0.24,
    detailTracking: 0.14,
    gap,
    fitScale,
    vertical,
  };
}

export function defaultTitleDesign(name: string, subtitle: string, detail: string): TitleDesign {
  return {
    enabled: false,
    text: name,
    subtitle,
    detail,
    slot: 'footer',
    panel: 'solid',
    align: 'center',
    font: 'editorial',
    onWater: false,
    autoPlaced: false,
    x: 0,
    y: 0.875,
    w: 1,
    h: 0.125,
    rotation: 0,
  };
}

export function titleCacheTag(design: TitleDesign): string {
  if (!design.enabled) return 'notitle';
  return [
    design.text, design.subtitle, design.detail,
    design.slot, design.panel, design.align, design.font,
    design.textColor || 'auto', design.panelColor || 'auto', design.backdropColor || 'unsampled',
    design.onWater ? 'water' : 'land',
    design.x.toFixed(4), design.y.toFixed(4),
    design.w.toFixed(4), design.h.toFixed(4),
    design.rotation.toFixed(2),
  ].join('|');
}
