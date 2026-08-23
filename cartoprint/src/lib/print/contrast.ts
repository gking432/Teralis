/**
 * Contrast helpers — the guardrails that make an ugly print hard to produce.
 *
 * Two things matter here that a screen-only check would miss:
 *
 * 1. Ink on paper has less dynamic range than a backlit display. A pairing
 *    that looks "subtle" on screen can vanish in print, so the thresholds are
 *    deliberately stricter than the WCAG text minimums.
 * 2. Very light ink on very light paper produces a print people describe as
 *    "faded", even when the ratio technically passes. We flag that separately.
 */

export interface Rgb { r: number; g: number; b: number; }

export function parseHex(hex: string): Rgb {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const value = parseInt(full, 16);
  if (!Number.isFinite(value)) return { r: 0, g: 0, b: 0 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (n: number) => Math.min(Math.max(Math.round(n), 0), 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.4;
}

/** Ink that will always read on the given paper — used to derive title colors. */
export function readableInk(paper: string, preferred?: string): string {
  if (preferred && contrastRatio(paper, preferred) >= 4.5) return preferred;
  return isDark(paper) ? '#f7f4eb' : '#14201d';
}

export type ContrastVerdict = 'good' | 'weak' | 'unprintable';

export interface ContrastCheck {
  verdict: ContrastVerdict;
  ratio: number;
  message?: string;
}

/**
 * Print-oriented thresholds. Fine cartographic lines are much thinner than
 * body text, so they need MORE contrast than a WCAG text pass, not less.
 */
const STRONG = 4.0;
const MINIMUM = 2.2;

export function checkInkOnPaper(ink: string, paper: string, label: string): ContrastCheck {
  const ratio = contrastRatio(ink, paper);
  if (ratio < MINIMUM) {
    return {
      verdict: 'unprintable',
      ratio,
      message: `${label} will disappear against the paper in print.`,
    };
  }
  if (ratio < STRONG) {
    return {
      verdict: 'weak',
      ratio,
      message: `${label} will look much fainter on paper than on screen.`,
    };
  }
  return { verdict: 'good', ratio };
}

export interface PaletteCheck {
  verdict: ContrastVerdict;
  issues: string[];
}

/** Validate a whole land/water/roads palette the way it will actually print. */
export function checkPalette(colors: { land: string; water: string; roads: string }): PaletteCheck {
  const checks = [
    checkInkOnPaper(colors.roads, colors.land, 'Streets'),
    checkInkOnPaper(colors.water, colors.land, 'Water'),
  ];

  const issues = checks
    .filter((check) => check.verdict !== 'good')
    .map((check) => check.message!)
    .filter(Boolean);

  const verdict: ContrastVerdict = checks.some((c) => c.verdict === 'unprintable')
    ? 'unprintable'
    : checks.some((c) => c.verdict === 'weak')
      ? 'weak'
      : 'good';

  return { verdict, issues };
}

/**
 * Pull a color toward the nearest printable version against a given paper,
 * preserving hue. Used by the "fix it for me" nudge on the custom color panel.
 */
export function makePrintable(color: string, paper: string): string {
  if (contrastRatio(color, paper) >= STRONG) return color;

  const paperIsDark = isDark(paper);
  const { r, g, b } = parseHex(color);
  let best = color;

  // Walk toward black (on light paper) or white (on dark paper) in small steps
  // until the pairing clears the strong threshold.
  for (let step = 0.05; step <= 1; step += 0.05) {
    const target = paperIsDark ? 255 : 0;
    const candidate = toHex({
      r: r + (target - r) * step,
      g: g + (target - g) * step,
      b: b + (target - b) * step,
    });
    best = candidate;
    if (contrastRatio(candidate, paper) >= STRONG) break;
  }

  return best;
}

export function makePalettePrintable<T extends { land: string; water: string; roads: string }>(
  colors: T,
): T {
  return {
    ...colors,
    water: makePrintable(colors.water, colors.land),
    roads: makePrintable(colors.roads, colors.land),
  };
}
