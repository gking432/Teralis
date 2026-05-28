import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LayerGroup, LayerState } from '@/types/map';

function isSuppressedBaseLayer(id: string): boolean {
  return /building|rail|transit|aeroway|aerialway|airport|aerodrome|airfield|runway|iata|icao|poi|road_one_way|road_area_pattern|road_path_pedestrian|road_shield|highway-shield/.test(id);
}

export function classifyLayer(id: string): LayerGroup | null {
  if (/admin.*country|admin.*2|boundary.*country/.test(id)) return 'countries';
  if (/admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) return 'states';
  if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) return 'counties';

  if (/label_.*capital|label_city_capital/.test(id)) return 'capitals';
  if (/label_city/.test(id) && !/capital/.test(id)) return 'cities';
  if (/label_(town|village|other)/.test(id)) return 'towns';
  if (/label_state/.test(id)) return 'statelabels';
  if (/label_country/.test(id)) return 'countrylabels';

  if (/place.*capital/.test(id)) return 'capitals';
  if (/place.*(city|city_large)/.test(id) && !id.includes('capital')) return 'cities';
  if (/place.*(town|village|hamlet|suburb|neighbourhood|isolated)/.test(id)) return 'towns';
  if (/place.*(state|province)/.test(id) && !id.includes('capital')) return 'statelabels';
  if (/place.*(country|continent)/.test(id)) return 'countrylabels';

  if (/highway-name|road.*label|road_name|street_name|transportation_name/.test(id)) return 'roadlabels';
  if (/motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id)) return 'highways';
  if (/(primary|secondary)/.test(id) && /road|bridge|tunnel/.test(id)) return 'mainroads';
  if (/(minor|tertiary|service|track|street|link)/.test(id) && /road|bridge|tunnel/.test(id)) return 'allroads';

  if (/water_name_(point|line)_label/.test(id)) return 'waterlabels';
  if (/waterway.*label/.test(id)) return 'riverlabels';
  if (/^water$/.test(id)) return 'water';
  if (/^waterway/.test(id)) return 'rivers';

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

    if (isSuppressedBaseLayer(layer.id)) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {}
      return;
    }

    const group = classifyLayer(layer.id);
    if (group && layers[group] !== undefined) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', layers[group] ? 'visible' : 'none');
      } catch {}

      if (group === 'allroads' && layers.allroads) {
        try {
          map.setLayerZoomRange(layer.id, 5, 24);
          if (layer.type === 'line') {
            map.setPaintProperty(layer.id, 'line-color', '#8a8a84');
            map.setPaintProperty(layer.id, 'line-opacity', 0.82);
            map.setPaintProperty(layer.id, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.12, 7, 0.22, 10, 0.48, 13, 0.85]);
          }
        } catch {}
      }

      if (group === 'mainroads' && layers.mainroads) {
        try {
          map.setLayerZoomRange(layer.id, 5, 24);
        } catch {}
      }
    }
  });

  try {
    map.setLayoutProperty('hillshade-layer', 'visibility', layers.terrain ? 'visible' : 'none');
  } catch {}
}
