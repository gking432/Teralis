import type { Orientation } from './orientation';

export type SizeLabel = 'small' | 'medium' | 'large' | 'xlarge';
export type FrameOption = 'none' | 'black' | 'white' | 'wood';

export interface PrintSizeOption {
  label: SizeLabel;
  displayLabel: string;
  w: number; // inches
  h: number; // inches
  dimensionStr: string;
  prodigiSku: string; // placeholder — update from Prodigi catalog
}

export interface FulfillmentVariant {
  sku: string;
  attributes?: Record<string, string>;
}

export interface FrameOptionInfo {
  value: FrameOption;
  label: string;
  swatchColor: string;
}

export const SIZE_CATALOG: Record<Orientation, Record<SizeLabel, PrintSizeOption>> = {
  portrait: {
    small:  { label: 'small',  displayLabel: 'Small',       w: 12, h: 16, dimensionStr: '12 × 16"', prodigiSku: 'GLOBAL-FAP-12X16' },
    medium: { label: 'medium', displayLabel: 'Medium',      w: 18, h: 24, dimensionStr: '18 × 24"', prodigiSku: 'GLOBAL-FAP-18X24' },
    large:  { label: 'large',  displayLabel: 'Large',       w: 24, h: 32, dimensionStr: '24 × 32"', prodigiSku: 'GLOBAL-FAP-24X32' },
    xlarge: { label: 'xlarge', displayLabel: 'Extra Large', w: 28, h: 40, dimensionStr: '28 × 40"', prodigiSku: 'GLOBAL-FAP-28X40' },
  },
  square: {
    small:  { label: 'small',  displayLabel: 'Small',       w: 12, h: 12, dimensionStr: '12 × 12"', prodigiSku: 'GLOBAL-FAP-12X12' },
    medium: { label: 'medium', displayLabel: 'Medium',      w: 16, h: 16, dimensionStr: '16 × 16"', prodigiSku: 'GLOBAL-FAP-16X16' },
    large:  { label: 'large',  displayLabel: 'Large',       w: 20, h: 20, dimensionStr: '20 × 20"', prodigiSku: 'GLOBAL-FAP-20X20' },
    xlarge: { label: 'xlarge', displayLabel: 'Extra Large', w: 24, h: 24, dimensionStr: '24 × 24"', prodigiSku: 'GLOBAL-FAP-24X24' },
  },
  landscape: {
    small:  { label: 'small',  displayLabel: 'Small',       w: 16, h: 12, dimensionStr: '16 × 12"', prodigiSku: 'GLOBAL-FAP-12X16' },
    medium: { label: 'medium', displayLabel: 'Medium',      w: 24, h: 18, dimensionStr: '24 × 18"', prodigiSku: 'GLOBAL-FAP-18X24' },
    large:  { label: 'large',  displayLabel: 'Large',       w: 32, h: 24, dimensionStr: '32 × 24"', prodigiSku: 'GLOBAL-FAP-24X32' },
    xlarge: { label: 'xlarge', displayLabel: 'Extra Large', w: 40, h: 28, dimensionStr: '40 × 28"', prodigiSku: 'GLOBAL-FAP-28X40' },
  },
};

export const SIZE_LABELS: SizeLabel[] = ['small', 'medium', 'large', 'xlarge'];

/** Print resolution. Prodigi wants 300 dpi at the finished size. */
export const PRINT_DPI = 300;

/**
 * Pixel width the artwork must be exported at for a given size.
 *
 * This used to be a flat 3600 px for every order, which is 300 dpi on a 12x16
 * but only 120 dpi on a 30x40 — the largest, most expensive print was the
 * softest. It also capped how much map detail a large print could physically
 * contain, since the tiles are selected by the zoom the render lands on.
 */
export function exportWidthForSize(size: SizeLabel, orientation: Orientation): number {
  const option = SIZE_CATALOG[orientation][size];
  return Math.round(option.w * PRINT_DPI);
}

export const FRAME_OPTIONS: FrameOptionInfo[] = [
  { value: 'none',  label: 'Unframed', swatchColor: 'transparent' },
  { value: 'black', label: 'Black',    swatchColor: '#1a1a1a' },
  { value: 'white', label: 'White',    swatchColor: '#f0ede8' },
  { value: 'wood',  label: 'Wood',     swatchColor: '#8b5c2a' },
];

// Placeholder prices in USD cents — replace with real Prodigi base cost + margin
const SIZE_BASE_PRICE: Record<SizeLabel, number> = {
  small:  3500,
  medium: 5500,
  large:  8500,
  xlarge: 11500,
};

const FRAME_UPCHARGE: Record<FrameOption, number> = {
  none:  0,
  black: 8900,
  white: 8900,
  wood:  13900,
};

export const MAT_UPCHARGE = 1500; // $15 placeholder

export function getSizePrice(size: SizeLabel, frame: FrameOption, mat: boolean): number {
  return SIZE_BASE_PRICE[size] + FRAME_UPCHARGE[frame] + (mat && frame !== 'none' ? MAT_UPCHARGE : 0);
}

/**
 * Prodigi uses the same dimension SKU for portrait and landscape artwork.
 * Framed prints use the Classic Frame product plus color/mount attributes.
 * Product availability is still checked against Prodigi before live launch.
 */
export function getFulfillmentVariant(
  size: SizeLabel,
  orientation: Orientation,
  frame: FrameOption,
  mat: boolean,
): FulfillmentVariant {
  const paperSku = SIZE_CATALOG[orientation][size].prodigiSku;
  if (frame === 'none') return { sku: paperSku };
  return {
    sku: paperSku.replace('GLOBAL-FAP-', 'GLOBAL-CFP-'),
    attributes: {
      color: frame === 'wood' ? 'natural' : frame,
      ...(mat ? { mountColor: 'snow-white' } : {}),
    },
  };
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

// Maps our FrameOption to the Prodigi color string used in mockup filenames
const FRAME_TO_PRODIGI_COLOR: Record<Exclude<FrameOption, 'none'>, string> = {
  black: 'black',
  white: 'white',
  wood:  'natural',
};

// Maps orientation to the representative size used for mockup filenames
const ORIENTATION_TO_MOCKUP_SIZE: Record<Orientation, string> = {
  portrait:  '18x24',
  square:    '20x20',
  landscape: '24x18',
};

export function getMockupUrl(
  frame: FrameOption,
  orientation: Orientation,
  mat: boolean,
  scene: 0 | 1
): string | null {
  if (frame === 'none') return null;
  const color = FRAME_TO_PRODIGI_COLOR[frame];
  const size  = ORIENTATION_TO_MOCKUP_SIZE[orientation];
  const product     = mat ? 'cfpm' : 'cfp';
  const mountSuffix = mat ? '-snow-white-mount' : '';
  const sceneSuffix = scene === 1 ? '__1_' : '';
  return `/mockups/wall/prodigi-global-${product}-${size}-${color}-frame${mountSuffix}${sceneSuffix}.png`;
}

/** Every photographed view currently available for this exact finish. */
export function getMockupUrls(
  frame: FrameOption,
  orientation: Orientation,
  mat: boolean,
): string[] {
  if (frame === 'none') return [];
  return ([0, 1] as const)
    .map((scene) => getMockupUrl(frame, orientation, mat, scene))
    .filter((url): url is string => Boolean(url));
}

// Session storage keys for Step 2 → Step 3 handoff
export const SESSION_PREVIEW_KEY       = 'teralis:preview';
export const SESSION_CUSTOMIZATION_KEY = 'teralis:customization';
export const SESSION_FINISH_KEY        = 'teralis:finish';
