import type { CatalogPrint } from '@/lib/catalog/prints';
import { getLayout } from '@/lib/print/layouts';
import { getPalette } from '@/lib/print/palettes';
import {
  createPrintScene,
  normalizeScene,
  type PrintScene,
} from '@/lib/print/scene';

export const CITY_PRODUCT_PALETTES = ['slate', 'blueprint', 'signal', 'forest', 'bone'] as const;

/** A finished starting point for a product page, not a blank editor state. */
export function createCityProductScene(
  print: CatalogPrint,
  paletteId = 'slate',
): PrintScene {
  const layout = getLayout('poster');
  const scene = createPrintScene(print, 'portrait', getPalette(paletteId), layout);
  return normalizeScene({
    ...scene,
    layoutId: layout.id,
    title: {
      ...scene.title,
      enabled: true,
    },
  });
}
