import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LayerGroup, LayerState } from '@/types/map';

export function classifyLayer(id: string): LayerGroup | null {
  // Boundaries
  if (/admin.*country|admin.*2|boundary.*country/.test(id)) return 'countries';
  if (/admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) return 'states';
  if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) return 'counties';

  // Places — capitals and state/country labels before generic city/town to avoid overlap
  if (/place.*capital|capital.*dot|capital.*city/.test(id)) return 'capitals';
  if (/place.*(state|province)/.test(id)) return 'statelabels';
  if (/place.*(country|continent)/.test(id)) return 'countrylabels';
  if (/place.*(city|metropolis|large_city)/.test(id)) return 'cities';
  if (/place.*(town|village|hamlet|suburb|neighbourhood|neighborhood|isolated|locality|quarter)/.test(id)) return 'towns';
  if (/poi/.test(id)) return 'towns';

  // Roads — exclude casing/label/shield layers; don't require a second keyword so
  // layer names like "road_motorway" or "motorway_line" both match.
  if (/motorway|trunk/.test(id) && !/casing|label|shield|ref/.test(id)) return 'highways';
  if (/(primary|secondary)/.test(id) && !/motorway|trunk|casing|label|shield|ref/.test(id)) return 'mainroads';
  if (/(minor|tertiary|service|track|path|pedestrian|street|link|rail|transit|one_way|aeroway|building)/.test(id) && !/label|shield|ref/.test(id)) return 'allroads';

  // Water
  if (/^water|waterway/.test(id)) return 'water';

  // Nature
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
      const visible = layers[group];
      try {
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
        // When toggled on, override any built-in minzoom so the layer shows at the
        // current zoom regardless of what the base style specifies.
        if (visible) {
          map.setLayerZoomRange(layer.id, 0, 24);
        }
      } catch {}
    }
  });

  try {
    map.setLayoutProperty('hillshade-layer', 'visibility', layers.terrain ? 'visible' : 'none');
  } catch {}
}
