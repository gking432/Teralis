import { applyLayout, applyPalette, normalizeScene, type PrintScene } from './scene';
import { getLayout } from './layouts';
import { getPalette } from './palettes';
import { ILLUSTRATIONS } from './illustrations';
import type { CatalogPrint } from '@/lib/catalog/prints';
import type { Orientation } from './orientation';
import type { RegionTheme } from './regionDesign';

export const CITY_VERSIONS = [
  { id: 'on-water', name: 'Open Water', description: 'Lettering nestled into a lake or bay.' },
  { id: 'footer', name: 'Gallery', description: 'A quiet caption beneath the streets.' },
  { id: 'bare', name: 'Map Only', description: 'Let the geography speak for itself.' },
];
export const STATE_EDITIONS = [
  { id: 'topographic' as const, name: 'Topographic', description: 'Elevation, rivers & lakes' },
  { id: 'atlas' as const, name: 'Street Atlas', description: 'Roads, cities & towns' },
  { id: 'illustrated' as const, name: 'Illustrated Atlas', description: 'Hand-drawn places & landscapes' },
];

export function chooseEdition(scene: PrintScene, theme: RegionTheme): PrintScene {
  if (theme === 'illustrated' && !ILLUSTRATIONS[scene.place.slug]) return scene;
  const palette = getPalette(theme === 'topographic' || theme === 'detailed' ? 'forest' : 'bone');
  const next = applyLayout(applyPalette(scene, palette), getLayout('footer'));
  return normalizeScene({
    ...next,
    region: { theme },
    // Each saved illustration carries its own designed paper orientation.
    orientation: theme === 'illustrated' ? ILLUSTRATIONS[scene.place.slug].orientation : scene.orientation,
    detailBias: theme === 'detailed' ? 1 : 0,
    detail: { ...next.detail, border: 'none', labels: { ...next.detail.labels, cities: theme === 'atlas' || theme === 'detailed', towns: theme === 'detailed' } },
    ...(theme === 'illustrated' ? { colors: { land: ILLUSTRATIONS[scene.place.slug].paper, water: '#8b3c25', roads: '#302b24' } } : {}),
    title: { ...next.title, font: 'editorial', rotation: 0 },
  });
}

/** Wide states start on a landscape sheet; customers can still change shape. */
export function recommendedOrientation(print: CatalogPrint): Orientation {
  if (print.kind !== 'state') return 'portrait';
  const [south, north, west, east] = print.bbox.map(Number);
  const physicalWidth = (east - west) * Math.cos((north + south) / 2 * Math.PI / 180);
  return physicalWidth > (north - south) * 1.3 ? 'landscape' : 'portrait';
}
