import type { CatalogPrint } from '@/lib/catalog/prints';
import { applyPalette, createPrintScene, normalizeScene, type PrintScene } from '@/lib/print/scene';
import { getPalette } from '@/lib/print/palettes';
import { hasDoodleContent, illustrationForTheme, type IllustrationTheme } from '@/lib/print/decorations';

/**
 * The finished designs a regional state collection sells.
 *
 * Each entry is a complete, print-ready piece of art — an art direction, a
 * palette, and typography that always travel together. The storefront shows
 * them as finished products; the personalizer receives whichever one was
 * chosen and never re-asks the question.
 */
export interface CollectionDesign {
  id: IllustrationTheme;
  name: string;
  note: string;
  description: string;
  palette: string;
  font: PrintScene['title']['font'];
}

export const STATE_COLLECTION_DESIGNS: CollectionDesign[] = [
  {
    id: 'doodle-atlas',
    name: 'Doodle Atlas',
    note: 'Illustrated forests, lakes, and landmarks',
    description: 'A map with a point of view: hand-drawn forests, hills, lake lettering, and room for the places that are yours.',
    palette: 'bone',
    font: 'hand',
  },
  {
    id: 'heritage',
    name: 'Heritage',
    note: 'Warm, classic roads, rivers, and lakes',
    description: 'A warm, classic geographic study — clean roads, rivers, and lakes drawn with editorial calm.',
    palette: 'terracotta',
    font: 'editorial',
  },
  {
    id: 'topographic',
    name: 'Topographic',
    note: 'Real terrain relief and modern linework',
    description: 'Modern linework over real terrain relief. The land itself does the talking.',
    palette: 'forest',
    font: 'condensed',
  },
];

/**
 * A finished design is the personalizer's own default scene wearing one of the
 * collection's art directions — the same construction the studio uses, so the
 * storefront-to-personalizer handoff cannot drift: same wording, same
 * geography, same fonts, same composition.
 */
export function sceneForCollectionDesign(print: CatalogPrint, design: CollectionDesign): PrintScene {
  const base = createPrintScene(print, 'portrait', getPalette(design.palette));
  const recolored = applyPalette(base, getPalette(design.palette));
  return normalizeScene({
    ...recolored,
    illustration: illustrationForTheme(design.id, base.illustration, print.slug),
    title: { ...recolored.title, enabled: true, font: design.font },
  });
}

/**
 * The designs actually for sale for one state. The Doodle Atlas appears only
 * where a curated illustration set exists — every state sells the clean
 * Heritage and Topographic editions, and doodle editions launch state by
 * state as their geography is drawn.
 */
export function designsForState(slug: string): CollectionDesign[] {
  return STATE_COLLECTION_DESIGNS.filter((design) =>
    design.id !== 'doodle-atlas' || hasDoodleContent(slug));
}
