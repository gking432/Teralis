import type { PreviewColorSettings } from '@/lib/print/colorSchemes';
import type { BorderWeight } from '@/lib/print/printRender';
import type { TitlePanel, TitleSlot } from '@/lib/print/title';

/**
 * Looks — complete designs, not settings.
 *
 * The previous customizer exposed five unconstrained color pickers (land,
 * water, roads, title text, title panel) with no contrast checking, which made
 * an ugly print the default outcome of exploring. A Look is instead an
 * authored object: palette, stroke weight, density, border, and title
 * treatment chosen together. Picking one is a single tap and always lands on
 * something that prints well.
 *
 * Customisation then happens INSIDE a look: each look ships a small set of
 * accent colors that are known to work against its own paper, so the range of
 * expression is wide but the floor is high.
 */

export interface Look {
  id: string;
  name: string;
  blurb: string;
  colors: PreviewColorSettings;
  /** Multiplier on every print stroke — fine, normal, or bold linework. */
  strokeWeight: number;
  border: BorderWeight;
  titleSlot: TitleSlot;
  titlePanel: TitlePanel;
  /** Accents that are safe against this look's paper, for the roads color. */
  accents: string[];
  /** Dark-paper looks need different UI affordances and mount suggestions. */
  darkPaper: boolean;
}

const PAPER_WHITE = '#ffffff';
const PAPER_BONE = '#f7f3ea';
const PAPER_INK = '#101820';
const PAPER_NIGHT = '#0b0f14';

export const LOOKS: Look[] = [
  {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'Navy linework on white',
    colors: { land: PAPER_WHITE, water: '#0a2342', roads: '#0a2342' },
    strokeWeight: 1,
    border: 'thin',
    titleSlot: 'footer',
    titlePanel: 'solid',
    accents: ['#0a2342', '#123a5c', '#2c4a6e', '#1f3d34', '#3b2f4a'],
    darkPaper: false,
  },
  {
    id: 'signal',
    name: 'Signal',
    blurb: 'Red streets, deep navy water',
    colors: { land: PAPER_WHITE, water: '#0a2342', roads: '#d34a32' },
    strokeWeight: 1,
    border: 'medium',
    titleSlot: 'footer',
    titlePanel: 'solid',
    accents: ['#d34a32', '#c1362b', '#b8532c', '#a8324e', '#8f3a2a'],
    darkPaper: false,
  },
  {
    id: 'ochre',
    name: 'Ochre',
    blurb: 'Gold streets on navy water',
    colors: { land: PAPER_WHITE, water: '#08243e', roads: '#b8892c' },
    strokeWeight: 1.05,
    border: 'medium',
    titleSlot: 'footer-tall',
    titlePanel: 'solid',
    accents: ['#b8892c', '#9a7420', '#8c6a33', '#7a5c2e', '#6d5a3a'],
    darkPaper: false,
  },
  {
    id: 'harbor',
    name: 'Harbor',
    blurb: 'Sea green on blue-black',
    colors: { land: PAPER_WHITE, water: '#102f44', roads: '#1d7566' },
    strokeWeight: 0.95,
    border: 'thin',
    titleSlot: 'footer',
    titlePanel: 'solid',
    accents: ['#1d7566', '#166055', '#1f5f6e', '#22694f', '#2a5c66'],
    darkPaper: false,
  },
  {
    id: 'bone',
    name: 'Bone',
    blurb: 'Soft charcoal on warm paper',
    colors: { land: PAPER_BONE, water: '#5c574e', roads: '#3a352e' },
    strokeWeight: 0.9,
    border: 'thin',
    titleSlot: 'bottom-left',
    titlePanel: 'none',
    accents: ['#3a352e', '#4a4239', '#5c4a3a', '#43473c', '#54473f'],
    darkPaper: false,
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    blurb: 'Clay streets, muted blue water',
    colors: { land: '#faf4ec', water: '#4a6b7c', roads: '#a3542f' },
    strokeWeight: 1,
    border: 'medium',
    titleSlot: 'footer',
    titlePanel: 'solid',
    accents: ['#a3542f', '#8e4526', '#7d4a35', '#95603a', '#6f4230'],
    darkPaper: false,
  },
  {
    id: 'slate',
    name: 'Slate',
    blurb: 'Quiet grey-blue monochrome',
    colors: { land: PAPER_WHITE, water: '#54616f', roads: '#404b57' },
    strokeWeight: 0.85,
    border: 'none',
    titleSlot: 'top-left',
    titlePanel: 'none',
    accents: ['#404b57', '#333c46', '#4d5a63', '#3d4a4f', '#2f3841'],
    darkPaper: false,
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Deep green on white',
    colors: { land: PAPER_WHITE, water: '#1f3d34', roads: '#25503f' },
    strokeWeight: 1,
    border: 'thin',
    titleSlot: 'footer',
    titlePanel: 'solid',
    accents: ['#25503f', '#1f3d34', '#2f5c46', '#38553a', '#1a4438'],
    darkPaper: false,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Pale streets on deep ink',
    colors: { land: PAPER_INK, water: '#1d2a36', roads: '#d8dde2' },
    strokeWeight: 1.05,
    border: 'none',
    titleSlot: 'footer',
    titlePanel: 'solid',
    accents: ['#d8dde2', '#e8e2d4', '#c9d6cf', '#d9c9a8', '#bcc9d6'],
    darkPaper: true,
  },
  {
    id: 'noir',
    name: 'Noir',
    blurb: 'White linework on black',
    colors: { land: PAPER_NIGHT, water: '#161c22', roads: '#f2f2ee' },
    strokeWeight: 1.15,
    border: 'none',
    titleSlot: 'bottom-left',
    titlePanel: 'none',
    accents: ['#f2f2ee', '#e6d8b8', '#d6e2e6', '#e8c9b4', '#cfd8c4'],
    darkPaper: true,
  },
];

export const DEFAULT_LOOK = LOOKS[0];

export function getLook(id: string | undefined | null): Look {
  return LOOKS.find((look) => look.id === id) ?? DEFAULT_LOOK;
}

/** The look whose palette matches these colors, if any (for round-tripping). */
export function matchLook(colors: PreviewColorSettings): Look | null {
  return LOOKS.find((look) =>
    look.colors.land === colors.land &&
    look.colors.water === colors.water &&
    look.colors.roads === colors.roads,
  ) ?? null;
}

/**
 * Looks own colour, linework weight, border, and title treatment. They do NOT
 * own how much is drawn — that is resolved from the framing radius and the
 * paper size in `density.ts`, because it is a physical property of the sheet
 * rather than a stylistic choice.
 */
export function looksForKind(kind: 'city' | 'state' | 'country'): Look[] {
  if (kind === 'city') return LOOKS;
  // Wider subjects carry fewer features, so the lines they do have are drawn
  // slightly heavier to keep the print from looking thin.
  return LOOKS.map((look) => ({ ...look, strokeWeight: look.strokeWeight * 1.15 }));
}
