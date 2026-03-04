import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LayerGroup, LayerState } from '@/types/map';
import {
  STATE_CAPITALS_DOT_ID,
  STATE_CAPITALS_LABEL_ID,
  COUNTY_LINES_ID,
} from '@/lib/map/customLayers';

// OpenFreeMap Liberty actual layer IDs (fetched from style JSON):
// Boundaries: boundary_2 (country), boundary_3 (state), boundary_disputed
// Labels: label_city_capital, label_city, label_town, label_village, label_other,
//         label_state, label_country_1/2/3
// Custom layers added at runtime: us-state-capitals-dot/label, us-county-lines

export function classifyLayer(id: string): LayerGroup | null {
  // Custom layers added by initStateCapitalsLayer / initCountyLayer
  if (id === STATE_CAPITALS_DOT_ID || id === STATE_CAPITALS_LABEL_ID) return 'capitals';
  if (id === COUNTY_LINES_ID) return 'counties';

  // Boundaries
  if (/^boundary_2$|admin.*country|admin.*2|boundary.*country/.test(id)) return 'countries';
  if (/^(boundary_3|boundary_disputed)$|admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) return 'states';
  if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) return 'counties';

  // Places — Liberty uses label_* IDs; other styles use place_*
  // label_city_capital = international/national capitals; mapped to countrylabels
  // so the "Capital Cities" toggle controls only our custom US state capitals layer
  if (/^label_city_capital$|place.*capital|capital.*dot|capital.*city/.test(id)) return 'countrylabels';
  if (/^label_state$|place.*(state|province)/.test(id)) return 'statelabels';
  if (/^label_country|place.*(country|continent)/.test(id)) return 'countrylabels';
  if (/^label_city$|place.*(city|metropolis|large_city)/.test(id)) return 'cities';
  if (/^label_(town|village|other)$|place.*(town|village|hamlet|suburb|neighbourhood|neighborhood|isolated|locality|quarter)/.test(id)) return 'towns';
  if (/^poi|^airport$/.test(id)) return 'towns';

  // Road shields and name labels — before road pattern matching
  if (/highway-shield|road_shield/.test(id)) return 'highways';
  if (id === 'highway-name-major') return 'mainroads';
  if (/highway-name-(minor|path)/.test(id)) return 'allroads';

  // Roads — include casing variants so they hide/show with their parent road
  // road_, tunnel_, bridge_ prefixes all handled by the keyword match
  if (/motorway|trunk/.test(id)) return 'highways';
  if (/(primary|secondary)/.test(id) && !/motorway|trunk/.test(id)) return 'mainroads';
  if (/(minor|tertiary|service|track|path|pedestrian|street|link|rail|transit|one_way|aeroway)/.test(id)) return 'allroads';

  // Water (including water name labels)
  if (/^water$|^waterway|water_name/.test(id)) return 'water';

  // Nature
  if (/landcover|landuse|^park/.test(id)) return 'landcover';

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
        if (visible) {
          // Per-group zoom rules:
          // State labels should yield to city labels when zoomed in
          if (group === 'statelabels') {
            map.setLayerZoomRange(layer.id, 0, 6.3);
          // County lines only make sense when you can see individual counties
          } else if (group === 'counties') {
            map.setLayerZoomRange(layer.id, 6.5, 24);
          } else {
            map.setLayerZoomRange(layer.id, 0, 24);
          }
          // For towns/villages: disable collision detection so ALL labels render
          // at every zoom — user explicitly opted in to see them, even if tiny
          if (group === 'towns' && layer.type === 'symbol') {
            map.setLayoutProperty(layer.id, 'text-allow-overlap', true);
            map.setLayoutProperty(layer.id, 'text-ignore-placement', true);
          }
        }
      } catch {}
    }
  });

  try {
    map.setLayoutProperty('hillshade-layer', 'visibility', layers.terrain ? 'visible' : 'none');
  } catch {}
}
