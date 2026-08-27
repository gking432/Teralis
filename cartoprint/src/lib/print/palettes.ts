import type { PreviewColorSettings } from '@/lib/print/colorSchemes';

/**
 * Colour, and only colour.
 *
 * Previously a "Look" bundled the palette together with the title placement,
 * the border, and the linework weight, so every colour choice silently moved
 * the title and every layout choice silently recoloured the map. Those are two
 * independent questions and the user has to be able to answer them separately:
 * pick a layout, then pick a colour scheme.
 */

export interface Palette {
  id: string;
  name: string;
  blurb: string;
  colors: PreviewColorSettings;
  /** Accents known to work against this palette's paper. */
  accents: string[];
  /** Dark paper needs different title derivation and mount suggestions. */
  darkPaper: boolean;
  /** Relative linework weight — pale-on-dark needs a touch more ink. */
  strokeWeight: number;
}

const PAPER_WHITE = '#ffffff';
const PAPER_INK = '#101820';
const PAPER_NIGHT = '#0b0f14';

/**
 * The v1 colourways.
 *
 * Colour is the only choice on a city product page, so these are the ones we
 * advertise and the ones almost every order will use. Each is a single ink on
 * paper — one confident colour reads better at print size than a scheme, and
 * it keeps the storefront a row of swatches instead of a settings panel.
 */
export const CITY_COLORWAYS = ['charcoal', 'navy', 'crimson', 'forest-green', 'ochre-gold', 'paper-white'] as const;

const V1_PALETTES: Palette[] = [
  {
    id: 'charcoal',
    name: 'Charcoal',
    blurb: 'Graphite on white',
    colors: { land: PAPER_WHITE, water: '#8d949b', roads: '#242a2f' },
    accents: ['#242a2f', '#3a4148', '#4d545b', '#5f676e', '#71797f'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'navy',
    name: 'Blue',
    blurb: 'Deep navy on white',
    colors: { land: PAPER_WHITE, water: '#8aa4bb', roads: '#12365e' },
    accents: ['#12365e', '#1c4a7a', '#2b5f92', '#3a74aa', '#4a89c2'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'crimson',
    name: 'Red',
    blurb: 'Crimson on white',
    colors: { land: PAPER_WHITE, water: '#bd8f85', roads: '#a52a1f' },
    accents: ['#a52a1f', '#bd3527', '#8f2118', '#c94a3a', '#7a1c15'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'forest-green',
    name: 'Green',
    blurb: 'Forest green on white',
    colors: { land: PAPER_WHITE, water: '#86a396', roads: '#1d4d38' },
    accents: ['#1d4d38', '#276548', '#317c59', '#153a2a', '#3b9269'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'ochre-gold',
    name: 'Yellow',
    blurb: 'Ochre gold on white',
    colors: { land: PAPER_WHITE, water: '#b3a173', roads: '#8a6410' },
    accents: ['#8a6410', '#a37814', '#6d4f0c', '#bb8c22', '#5a410a'],
    darkPaper: false,
    strokeWeight: 1.05,
  },
  {
    id: 'paper-white',
    name: 'White',
    blurb: 'White linework on ink',
    colors: { land: '#14181c', water: '#5d6c7d', roads: '#f2f0ea' },
    accents: ['#f2f0ea', '#dcd8ce', '#c6c1b5', '#b0aa9c', '#9a9383'],
    darkPaper: true,
    strokeWeight: 1.12,
  },
];

export const PALETTES: Palette[] = [
  ...V1_PALETTES,

  {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'Navy on white',
    colors: { land: PAPER_WHITE, water: '#0a2342', roads: '#0a2342' },
    accents: ['#0a2342', '#123a5c', '#2c4a6e', '#1f3d34', '#3b2f4a'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'signal',
    name: 'Signal',
    blurb: 'Red streets, navy water',
    colors: { land: PAPER_WHITE, water: '#0a2342', roads: '#d34a32' },
    accents: ['#d34a32', '#c1362b', '#b8532c', '#a8324e', '#8f3a2a'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'ochre',
    name: 'Ochre',
    blurb: 'Gold on deep navy',
    colors: { land: PAPER_WHITE, water: '#08243e', roads: '#b8892c' },
    accents: ['#b8892c', '#9a7420', '#8c6a33', '#7a5c2e', '#6d5a3a'],
    darkPaper: false,
    strokeWeight: 1.05,
  },
  {
    id: 'harbor',
    name: 'Harbor',
    blurb: 'Sea green on blue-black',
    colors: { land: PAPER_WHITE, water: '#102f44', roads: '#1d7566' },
    accents: ['#1d7566', '#166055', '#1f5f6e', '#22694f', '#2a5c66'],
    darkPaper: false,
    strokeWeight: 0.95,
  },
  {
    id: 'bone',
    name: 'Bone',
    blurb: 'Charcoal and slate on warm paper',
    colors: { land: '#f4f0e7', water: '#617784', roads: '#4b433a' },
    accents: ['#3a352e', '#4a4239', '#5c4a3a', '#43473c', '#54473f'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    blurb: 'Clay streets, muted blue',
    colors: { land: '#faf4ec', water: '#4a6b7c', roads: '#a3542f' },
    accents: ['#a3542f', '#8e4526', '#7d4a35', '#95603a', '#6f4230'],
    darkPaper: false,
    strokeWeight: 1,
  },
  {
    id: 'slate',
    name: 'Slate',
    blurb: 'Slate linework on white',
    colors: { land: PAPER_WHITE, water: '#53616f', roads: '#53616f' },
    accents: ['#404b57', '#333c46', '#4d5a63', '#3d4a4f', '#2f3841'],
    darkPaper: false,
    strokeWeight: 0.85,
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Deep green on warm paper',
    colors: { land: '#f0ede2', water: '#28584d', roads: '#315d50' },
    accents: ['#25503f', '#1f3d34', '#2f5c46', '#38553a', '#1a4438'],
    darkPaper: false,
    strokeWeight: 0.95,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Pale streets on ink',
    colors: { land: PAPER_INK, water: '#1d2a36', roads: '#d8dde2' },
    accents: ['#d8dde2', '#e8e2d4', '#c9d6cf', '#d9c9a8', '#bcc9d6'],
    darkPaper: true,
    strokeWeight: 1.05,
  },
  {
    id: 'noir',
    name: 'Noir',
    blurb: 'White linework on black',
    colors: { land: PAPER_NIGHT, water: '#161c22', roads: '#f2f2ee' },
    accents: ['#f2f2ee', '#e6d8b8', '#d6e2e6', '#e8c9b4', '#cfd8c4'],
    darkPaper: true,
    strokeWeight: 1.15,
  },
];

export const DEFAULT_PALETTE = PALETTES.find((palette) => palette.id === 'slate')!;

export function getPalette(id: string | undefined | null): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? DEFAULT_PALETTE;
}
