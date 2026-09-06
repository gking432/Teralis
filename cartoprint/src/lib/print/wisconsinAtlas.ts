import type maplibregl from 'maplibre-gl';
import places from '@/data/wisconsin_atlas_places.json';
import type { PreviewColorSettings } from './colorSchemes';
import type { StrokeScale } from './strokes';

export const WISCONSIN_LABELS = 'print-wisconsin-atlas-labels';
/** Bundled Census places and civil towns; independent of vector-tile zoom omissions. */
export function addWisconsinAtlasLabels(map: maplibregl.Map, colors: PreviewColorSettings, scale: StrokeScale) {
  if (!map.getSource(WISCONSIN_LABELS)) {
    map.addSource(WISCONSIN_LABELS, { type: 'geojson', data: {
      type: 'FeatureCollection', features: places.map((p) => ({ type: 'Feature' as const,
        properties: { name: p.n, rank: p.k === 'city' ? 0 : p.k === 'township' ? 2 : 1 },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
    } });
    map.addLayer({ id: WISCONSIN_LABELS, source: WISCONSIN_LABELS, type: 'symbol', layout: {
      visibility: 'none', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
      'symbol-sort-key': ['get', 'rank'], 'text-allow-overlap': false,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': .25,
    } });
  }
  map.setLayoutProperty(WISCONSIN_LABELS, 'text-size', 8 * scale.widthScale);
  map.setLayoutProperty(WISCONSIN_LABELS, 'text-padding', .8 * scale.widthScale);
  map.setPaintProperty(WISCONSIN_LABELS, 'text-color', colors.roads);
  map.setPaintProperty(WISCONSIN_LABELS, 'text-halo-color', colors.land);
  map.setPaintProperty(WISCONSIN_LABELS, 'text-halo-width', .9 * scale.widthScale);
}
