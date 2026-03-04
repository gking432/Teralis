import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LayerGroup, LayerState } from '@/types/map';

// OpenFreeMap Liberty actual layer IDs (fetched from style JSON):
// Boundaries: boundary_2 (country), boundary_3 (state), boundary_disputed
// Labels: label_city_capital, label_city, label_town, label_village, label_other,
//         label_state, label_country_1/2/3
// Roads: road_motorway, road_trunk_primary, road_secondary_tertiary, road_minor,
//        road_service_track, road_link, road_path_pedestrian, road_one_way_arrow*
//        plus tunnel_ and bridge_ prefixed variants, and casing variants
// Shields/names: highway-shield-*, road_shield_us, highway-name-major/minor/path
// POI: poi_r20, poi_r7, poi_r1, poi_transit, airport

export function classifyLayer(id: string): LayerGroup | null {
  // Boundaries
  if (/^boundary_2$|admin.*country|admin.*2|boundary.*country/.test(id)) return 'countries';
  if (/^(boundary_3|boundary_disputed)$|admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) return 'states';
  if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) return 'counties';

  // Places — Liberty uses label_* IDs; other styles use place_*
  // Check specific label_ IDs before generic place_ patterns
  if (/^label_city_capital$|place.*capital|capital.*dot|capital.*city/.test(id)) return 'capitals';
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
