import type { CatalogPrintKind } from '@/lib/catalog/prints';
import { getLayout } from '@/lib/print/layouts';
import { applyLayout, normalizeScene, type PrintScene } from '@/lib/print/scene';
import type { DetailBias } from '@/lib/print/density';

export interface StyleRecipe {
  id: string;
  name: string;
  blurb: string;
  layoutId: string;
  paletteId: string;
  kinds: CatalogPrintKind[];
  /** Only offer this composition when the current frame has usable open water. */
  waterOnly?: boolean;
  detailBias?: DetailBias;
  labels?: Partial<PrintScene['detail']['labels']>;
  counties?: boolean;
}

/**
 * A small, gated collection of complete compositions for each geographic
 * scale. The names describe the print a customer is choosing, not an internal
 * layout primitive. Shared layout and palette machinery still guarantees the
 * result remains printable.
 */
export const STYLE_RECIPES: StyleRecipe[] = [
  {
    id: 'street-study',
    name: 'Street Study',
    blurb: 'Dense local linework with a restrained footer.',
    layoutId: 'footer',
    paletteId: 'blueprint',
    kinds: ['city'],
  },
  {
    id: 'city-signal',
    name: 'City Signal',
    blurb: 'Red streets, navy water, and a compact corner title.',
    layoutId: 'plaque',
    paletteId: 'signal',
    kinds: ['city'],
  },
  {
    id: 'city-poster',
    name: 'City Poster',
    blurb: 'A generous editorial title below the street map.',
    layoutId: 'poster',
    paletteId: 'ochre',
    kinds: ['city'],
  },
  {
    id: 'water-label',
    name: 'Water Label',
    blurb: 'Places the title directly into a lake, bay, or coastline.',
    layoutId: 'on-water',
    paletteId: 'harbor',
    kinds: ['city'],
    waterOnly: true,
  },
  {
    id: 'city-night',
    name: 'Night Grid',
    blurb: 'Pale local streets on a deep architectural ground.',
    layoutId: 'footer',
    paletteId: 'midnight',
    kinds: ['city'],
  },
  {
    id: 'city-map-only',
    name: 'Map Only',
    blurb: 'The framed street network without a title treatment.',
    layoutId: 'bare',
    paletteId: 'bone',
    kinds: ['city'],
  },

  {
    id: 'state-atlas',
    name: 'State Routes',
    blurb: 'Main roads and waterways with a classic footer.',
    layoutId: 'footer',
    paletteId: 'blueprint',
    kinds: ['state'],
    labels: { cities: false, towns: false },
  },
  {
    id: 'state-gazetteer',
    name: 'River Study',
    blurb: 'A warm editorial sheet focused on roads and waterways.',
    layoutId: 'poster',
    paletteId: 'bone',
    kinds: ['state'],
    detailBias: 1,
    labels: { cities: false, towns: false },
  },
  {
    id: 'state-heritage',
    name: 'Heritage Map',
    blurb: 'Earthy linework with a compact identifying plaque.',
    layoutId: 'plaque',
    paletteId: 'terracotta',
    kinds: ['state'],
    detailBias: -1,
    labels: { cities: false, towns: false },
  },
  {
    id: 'state-night',
    name: 'Night Atlas',
    blurb: 'A high-contrast state silhouette for a dramatic wall piece.',
    layoutId: 'footer',
    paletteId: 'midnight',
    kinds: ['state'],
    labels: { cities: false, towns: false },
  },
  {
    id: 'state-map-only',
    name: 'Clean State',
    blurb: 'Roads and waterways without a separate title band.',
    layoutId: 'bare',
    paletteId: 'slate',
    kinds: ['state'],
    detailBias: -1,
    labels: { cities: false, towns: false },
  },

  {
    id: 'country-atlas',
    name: 'National Atlas',
    blurb: 'Internal regions and capitals with a restrained footer.',
    layoutId: 'footer',
    paletteId: 'blueprint',
    kinds: ['country'],
    labels: { cities: true, towns: false },
  },
  {
    id: 'country-editorial',
    name: 'Editorial Country',
    blurb: 'A bold title band paired with a warm geographic treatment.',
    layoutId: 'poster',
    paletteId: 'ochre',
    kinds: ['country'],
    detailBias: -1,
    labels: { cities: false, towns: false },
  },
  {
    id: 'country-forest',
    name: 'Boundary Study',
    blurb: 'Quiet green boundaries and water on clean white paper.',
    layoutId: 'plaque',
    paletteId: 'forest',
    kinds: ['country'],
    detailBias: -1,
    labels: { cities: false, towns: false },
  },
  {
    id: 'country-night',
    name: 'Night Country',
    blurb: 'A pale national outline on a deep black ground.',
    layoutId: 'footer',
    paletteId: 'noir',
    kinds: ['country'],
    labels: { cities: true, towns: false },
  },
  {
    id: 'country-map-only',
    name: 'Pure Geography',
    blurb: 'Only the country, its internal structure, and major water.',
    layoutId: 'bare',
    paletteId: 'bone',
    kinds: ['country'],
    detailBias: -1,
    labels: { cities: false, towns: false },
  },
];

export function styleRecipesFor(
  kind: CatalogPrintKind,
  waterAvailable?: boolean,
): StyleRecipe[] {
  return STYLE_RECIPES.filter((recipe) =>
    recipe.kinds.includes(kind) && (!recipe.waterOnly || waterAvailable === true),
  );
}

export function recipeMatches(
  recipe: StyleRecipe,
  scene: { layoutId: string },
): boolean {
  return recipe.layoutId === scene.layoutId;
}

/** Apply a print-tested composition without ever changing its colorway. */
export function applyStyleRecipe(scene: PrintScene, recipe: StyleRecipe): PrintScene {
  const withLayout = applyLayout(scene, getLayout(recipe.layoutId));
  return normalizeScene({
    ...withLayout,
    detailBias: recipe.detailBias ?? 0,
    labelsAuto: recipe.labels ? false : withLayout.labelsAuto,
    detail: {
      ...withLayout.detail,
      counties: recipe.counties ?? withLayout.detail.counties,
      labels: recipe.labels
        ? { ...withLayout.detail.labels, ...recipe.labels }
        : withLayout.detail.labels,
    },
  });
}
