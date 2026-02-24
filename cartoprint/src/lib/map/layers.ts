import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LayerGroup, LayerState } from '@/types/map';

export function classifyLayer(id: string): LayerGroup | null {
  if (/admin.*country|admin.*2|boundary.*country/.test(id)) return 'countries';
  if (/admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) return 'states';
  if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) return 'counties';

  if (/place.*capital/.test(id)) return 'capitals';
  if (/place.*(city|city_large)/.test(id) && !id.includes('capital')) return 'cities';
  if (/place.*(town|village|hamlet|suburb|neighbourhood|isolated)/.test(id)) return 'towns';
  if (/place.*(state|province)/.test(id) && !id.includes('capital')) return 'statelabels';
  if (/place.*(country|continent)/.test(id)) return 'countrylabels';
  if (/poi/.test(id)) return 'towns';

  if (/motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id)) return 'highways';
  if (/(primary|secondary)/.test(id) && /road|bridge|tunnel/.test(id)) return 'mainroads';
  if (/(minor|tertiary|service|track|path|pedestrian|street|link|rail|transit|one_way)/.test(id) && /road|bridge|tunnel/.test(id)) return 'allroads';
  if (/aeroway/.test(id)) return 'allroads';
  if (/building/.test(id)) return 'allroads';

  if (/^water|waterway/.test(id)) return 'water';

  if (/landcover|landuse|park/.test(id)) return 'landcover';

  return null;
}

export function applyLayerVisibility(map: MaplibreMap, layers: LayerState): void {
  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    if (['background', 'hillshade-layer', 'mask-layer', 'selection-outline-layer', 'natural_earth'].includes(layer.id)) {
      return;
    }

    const group = classifyLayer(layer.id);
    if (group && layers[group] !== undefined) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', layers[group] ? 'visible' : 'none');
      } catch {}
    }
  });

  try {
    map.setLayoutProperty('hillshade-layer', 'visibility', layers.terrain ? 'visible' : 'none');
  } catch {}
}
