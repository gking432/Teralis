import type { PreviewColorSettings } from '@/lib/print/colorSchemes';
import type { PrintDetailSettings } from '@/lib/print/printRender';

/** Stable paint signature; immune to scene normalization recreating objects. */
export function printColorSettingsKey(colors: PreviewColorSettings): string {
  return [colors.land, colors.water, colors.roads, colors.useMapDefault ? '1' : '0'].join('|');
}

/** Stable layer signature; title-only edits must never change this value. */
export function printDetailSettingsKey(detail: PrintDetailSettings): string {
  return [
    detail.places,
    detail.roads,
    detail.border,
    detail.rivers ? '1' : '0',
    detail.counties ? '1' : '0',
    detail.states ? '1' : '0',
    detail.labels.cities ? '1' : '0',
    detail.labels.towns ? '1' : '0',
    detail.labels.roads ? '1' : '0',
    detail.labels.water ? '1' : '0',
    detail.labels.rivers ? '1' : '0',
  ].join('|');
}
