import type { CatalogPrint } from '@/lib/catalog/prints';
import { createPrintScene, type PrintScene } from '@/lib/print/scene';
import { REGION_THEMES, type RegionTheme } from '@/lib/print/regionDesign';
import { chooseEdition, recommendedOrientation } from '@/lib/print/editions';
import { ILLUSTRATIONS } from '@/lib/print/illustrations';

/** Collection cards use the same editions as the print workspace. */
export interface CollectionDesign {
  id: RegionTheme;
  name: string;
  note: string;
  description: string;
  palette: string;
  font: PrintScene['title']['font'];
}

export const STATE_COLLECTION_DESIGNS: CollectionDesign[] = REGION_THEMES.map((theme) => ({
  id: theme.id,
  name: theme.name,
  note: theme.blurb,
  description: theme.id === 'topographic'
    ? 'The shape of the land: elevation relief, rivers, and open water, drawn as a quiet study in contour.'
    : 'Cities and small towns over restrained terrain, rivers and lakes.',
  palette: theme.palette,
  font: theme.font,
}));

/** Prepared illustrations are offered only where artwork exists. */
export function designsForState(slug?: string, _center?: [number, number] | null): CollectionDesign[] {
  return [...STATE_COLLECTION_DESIGNS, ...(slug && ILLUSTRATIONS[slug] ? [{ id: 'illustrated' as const, name: 'Illustrated', note: 'Hand-drawn places and landscapes', description: 'A finished illustrated state portrait with your own caption.', palette: 'bone', font: 'editorial' as const }] : [])];
}

export function sceneForCollectionDesign(print: CatalogPrint, design: CollectionDesign): PrintScene {
  return chooseEdition(createPrintScene(print, recommendedOrientation(print)), design.id);
}
