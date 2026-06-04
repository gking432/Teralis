import type { Orientation } from './printSnapshot';

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

export interface FrameOptionInfo {
  value: FrameOption;
  label: string;
  swatchColor: string;
  borderColor: string; // CSS color for simulated frame preview
  insetColor: string;  // inner lip highlight
}

export const SIZE_CATALOG: Record<Orientation, Record<SizeLabel, PrintSizeOption>> = {
  portrait: {
    small:  { label: 'small',  displayLabel: 'Small',       w: 12, h: 16, dimensionStr: '12 × 16"', prodigiSku: 'GLOBAL-FAP-12X16' },
    medium: { label: 'medium', displayLabel: 'Medium',      w: 18, h: 24, dimensionStr: '18 × 24"', prodigiSku: 'GLOBAL-FAP-18X24' },
    large:  { label: 'large',  displayLabel: 'Large',       w: 24, h: 32, dimensionStr: '24 × 32"', prodigiSku: 'GLOBAL-FAP-24X32' },
    xlarge: { label: 'xlarge', displayLabel: 'Extra Large', w: 30, h: 40, dimensionStr: '30 × 40"', prodigiSku: 'GLOBAL-FAP-30X40' },
  },
  square: {
    small:  { label: 'small',  displayLabel: 'Small',       w: 12, h: 12, dimensionStr: '12 × 12"', prodigiSku: 'GLOBAL-FAP-12X12' },
    medium: { label: 'medium', displayLabel: 'Medium',      w: 16, h: 16, dimensionStr: '16 × 16"', prodigiSku: 'GLOBAL-FAP-16X16' },
    large:  { label: 'large',  displayLabel: 'Large',       w: 20, h: 20, dimensionStr: '20 × 20"', prodigiSku: 'GLOBAL-FAP-20X20' },
    xlarge: { label: 'xlarge', displayLabel: 'Extra Large', w: 24, h: 24, dimensionStr: '24 × 24"', prodigiSku: 'GLOBAL-FAP-24X24' },
  },
  landscape: {
    small:  { label: 'small',  displayLabel: 'Small',       w: 16, h: 12, dimensionStr: '16 × 12"', prodigiSku: 'GLOBAL-FAP-16X12' },
    medium: { label: 'medium', displayLabel: 'Medium',      w: 24, h: 18, dimensionStr: '24 × 18"', prodigiSku: 'GLOBAL-FAP-24X18' },
    large:  { label: 'large',  displayLabel: 'Large',       w: 32, h: 24, dimensionStr: '32 × 24"', prodigiSku: 'GLOBAL-FAP-32X24' },
    xlarge: { label: 'xlarge', displayLabel: 'Extra Large', w: 40, h: 30, dimensionStr: '40 × 30"', prodigiSku: 'GLOBAL-FAP-40X30' },
  },
};

export const SIZE_LABELS: SizeLabel[] = ['small', 'medium', 'large', 'xlarge'];

export const FRAME_OPTIONS: FrameOptionInfo[] = [
  { value: 'none',  label: 'Unframed', swatchColor: 'transparent', borderColor: 'transparent',  insetColor: 'transparent' },
  { value: 'black', label: 'Black',    swatchColor: '#1a1a1a',     borderColor: '#111111',       insetColor: '#333333' },
  { value: 'white', label: 'White',    swatchColor: '#f0ede8',     borderColor: '#e8e3da',       insetColor: '#d8d3ca' },
  { value: 'wood',  label: 'Wood',     swatchColor: '#8b5c2a',     borderColor: '#7a4e22',       insetColor: '#9e6b35' },
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

export function getSizePrice(size: SizeLabel, frame: FrameOption): number {
  return SIZE_BASE_PRICE[size] + FRAME_UPCHARGE[frame];
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

// Key used for sessionStorage handoff from Step 2 → Step 3
export const SESSION_PREVIEW_KEY = 'teralis:preview';
export const SESSION_CUSTOMIZATION_KEY = 'teralis:customization';
