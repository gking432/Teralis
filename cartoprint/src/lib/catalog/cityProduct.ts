import type { CatalogPrint } from '@/lib/catalog/prints';
import { getLayout } from '@/lib/print/layouts';
import { getPalette } from '@/lib/print/palettes';
import {
  createPrintScene,
  normalizeScene,
  type PrintScene,
} from '@/lib/print/scene';

import { CITY_COLORWAYS } from '@/lib/print/palettes';

export const CITY_PRODUCT_PALETTES = CITY_COLORWAYS;

/** A finished starting point for a product page, not a blank editor state. */
export function createCityProductScene(
  print: CatalogPrint,
  paletteId: string = CITY_COLORWAYS[0],
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
