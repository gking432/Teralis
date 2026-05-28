import type { BuilderState, LayerState, MapSelection, MapViewState } from '@/types/map';
import type {
  PrintMetrics,
  PrintReadinessReport,
  PrintReadinessStatus,
  PrintSize,
  ScreenRect,
} from '@/types/order';

export const PRINT_SIZE_META: Record<
  PrintSize,
  { label: string; aspectRatio: number; safeMarginPct: number }
> = {
  '12x16': { label: '12 x 16"', aspectRatio: 12 / 16, safeMarginPct: 0.035 },
  '18x24': { label: '18 x 24"', aspectRatio: 18 / 24, safeMarginPct: 0.035 },
  '24x36': { label: '24 x 36"', aspectRatio: 24 / 36, safeMarginPct: 0.035 },
  '30x40': { label: '30 x 40"', aspectRatio: 30 / 40, safeMarginPct: 0.035 },
};

export function getPrintAspectRatio(size: PrintSize): number {
  return PRINT_SIZE_META[size].aspectRatio;
}

export function getPrintSafeMarginPct(size: PrintSize): number {
  return PRINT_SIZE_META[size].safeMarginPct;
}

export function getPrintFrameRect(
  containerWidth: number,
  containerHeight: number,
  size: PrintSize
): ScreenRect | null {
  if (!containerWidth || !containerHeight) return null;

  const ratio = getPrintAspectRatio(size);
  const maxWidth = containerWidth * 0.92;
  const maxHeight = containerHeight * 0.86;

  let frameWidth = maxWidth;
  let frameHeight = frameWidth / ratio;

  if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = frameHeight * ratio;
  }

  return {
    width: frameWidth,
    height: frameHeight,
    left: (containerWidth - frameWidth) / 2,
    top: (containerHeight - frameHeight) / 2,
  };
}

export function getSafeFrameRect(frame: ScreenRect, size: PrintSize): ScreenRect {
  const inset = Math.min(frame.width, frame.height) * getPrintSafeMarginPct(size);
  return {
    left: frame.left + inset,
    top: frame.top + inset,
    width: frame.width - inset * 2,
    height: frame.height - inset * 2,
  };
}

export function pointInRect(x: number, y: number, rect: ScreenRect): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

export function rectIntersectionArea(a: ScreenRect, b: ScreenRect): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

export function getReadinessTone(status: PrintReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'needs-adjustment':
      return 'Needs Adjustment';
    case 'blocked':
      return 'Blocked';
  }
}

function sparseWarning(builder: BuilderState, layers: LayerState): string | null {
  if (builder.scaleBand === 'local' && !layers.allroads && !layers.water) {
    return 'This local print may feel too sparse without streets or water.';
  }

  if (builder.scaleBand === 'regional' && !layers.cities && !layers.highways && !layers.water) {
    return 'This regional print may feel empty without cities, highways, or water.';
  }

  if (builder.scaleBand === 'national' && !layers.states && !layers.capitals && !layers.highways) {
    return 'This country-scale print may be too minimal to read well on a wall.';
  }

  return null;
}

function denseWarning(builder: BuilderState, layers: LayerState): string | null {
  if (builder.scaleBand === 'national' && (layers.towns || layers.allroads)) {
    return 'This wide-area map is too dense for a clean print. Reduce towns or streets.';
  }

  if (builder.scaleBand === 'regional' && layers.towns && layers.allroads && layers.terrain) {
    return 'This composition is visually crowded for print. Try fewer layers or zoom in.';
  }

  return null;
}

function frameAwareWarnings(metrics: PrintMetrics, layers: LayerState): {
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (metrics.edgeLabelCount > 0) {
    const names = metrics.edgeLabelNames.slice(0, 3).join(', ');
    warnings.push(
      names
        ? `Some labels are too close to the print edge: ${names}.`
        : 'Some labels are too close to the print edge.'
    );
    suggestions.push('Pan slightly or reduce label density to keep labels inside the safe margin.');
  }

  if ((layers.cities || layers.capitals || layers.towns) && metrics.visibleLabelCount > 0 && metrics.safeLabelCount === 0) {
    warnings.push('Visible place labels are landing outside the print safe area.');
    suggestions.push('Recenter the print frame or simplify labels before ordering.');
  }

  if (metrics.subjectCoverage !== null && metrics.subjectCoverage < 0.16) {
    warnings.push('The selected subject occupies too little of the print frame.');
    suggestions.push('Zoom in or use a tighter focus mode for a stronger composition.');
  }

  if (metrics.subjectTouchesSafeMargin) {
    warnings.push('The selected subject is crowding the print safe margin.');
    suggestions.push('Pan or zoom slightly so the subject has more breathing room.');
  }

  return { warnings, suggestions };
}

export function getPrintReadinessReport({
  size,
  builder,
  layers,
  selection,
  view,
  metrics,
}: {
  size: PrintSize;
  builder: BuilderState;
  layers: LayerState;
  selection: MapSelection | null;
  view: MapViewState;
  metrics: PrintMetrics | null;
}): PrintReadinessReport {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (builder.focusMode !== 'none' && !selection) {
    warnings.push('Focus framing is enabled, but nothing is selected yet.');
    suggestions.push('Select a country, state, county, or city before cropping or fading.');
  }

  const sparse = sparseWarning(builder, layers);
  if (sparse) {
    warnings.push(sparse);
    suggestions.push('Add more geographic detail or zoom in for a richer print.');
  }

  const dense = denseWarning(builder, layers);
  if (dense) {
    warnings.push(dense);
    suggestions.push('Reduce detail density or tighten the focus area.');
  }

  if (size === '24x36' && builder.scaleBand === 'local' && !selection) {
    warnings.push('This larger print ratio usually works better with a clearly selected subject.');
    suggestions.push('Select a city or county so the composition feels intentional.');
  }

  if (builder.focusMode === 'crop' && selection && view.zoom < 4.5) {
    warnings.push('This cropped print is still very zoomed out and may feel compositionally loose.');
    suggestions.push('Zoom in or use Outline/Fade if you want more surrounding context.');
  }

  if (layers.countrylabels && builder.scaleBand !== 'national') {
    warnings.push('Country labels may compete with the main subject at this print scale.');
    suggestions.push('Reduce labels for a cleaner composition.');
  }

  if (metrics) {
    const frameWarnings = frameAwareWarnings(metrics, layers);
    warnings.push(...frameWarnings.warnings);
    suggestions.push(...frameWarnings.suggestions);
  }

  let status: PrintReadinessStatus = 'ready';
  if (warnings.length > 0) status = 'needs-adjustment';
  if (warnings.some((warning) => /nothing is selected yet/.test(warning))) {
    status = 'blocked';
  }
  if (metrics && (metrics.edgeLabelCount >= 6 || (metrics.subjectCoverage !== null && metrics.subjectCoverage < 0.08))) {
    status = 'blocked';
  }

  return {
    status,
    warnings,
    suggestions,
  };
}
