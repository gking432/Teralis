import type { CatalogPrint } from '@/lib/catalog/prints';
import { applyPalette, createPrintScene, normalizeScene, type PrintScene } from '@/lib/print/scene';
import { getPalette } from '@/lib/print/palettes';
import { defaultRegionDesign, REGION_THEMES, type RegionTheme } from '@/lib/print/regionDesign';
import { rectForSlot } from '@/lib/print/title';

/**
 * The editions a region print is sold in.
 *
 * Two, deliberately: the land (topographic) and the road network (street atlas). Both
 * are real cartography that holds up at any scale and needs no per-state
 * curation, so every state and country ships the same complete pair.
 */
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
    : 'The road network as a clean hierarchy, without terrain, river linework, or place-name clutter.',
  palette: theme.palette,
  font: theme.font,
}));

/** Every region sells both editions; neither needs curation to look right. */
export function designsForState(_slug?: string, _center?: [number, number] | null): CollectionDesign[] {
  return STATE_COLLECTION_DESIGNS;
}

/**
 * A finished edition is the personalizer's own default scene wearing one of
 * the collection's designs — the same construction the studio uses, so the
 * storefront-to-personalizer handoff cannot drift.
 */
export function sceneForCollectionDesign(print: CatalogPrint, design: CollectionDesign): PrintScene {
  const base = createPrintScene(print, 'portrait', getPalette(design.palette));
  const recolored = applyPalette(base, getPalette(design.palette));
  return normalizeScene({
    ...recolored,
    layoutId: 'footer',
    detailBias: design.id === 'topographic' ? -1 : 0,
    region: defaultRegionDesign(design.id),
    detail: { ...recolored.detail, border: 'none' },
    title: {
      ...recolored.title,
      enabled: true,
      font: design.font,
      slot: 'footer',
      ...rectForSlot('footer'),
    },
  });
}
