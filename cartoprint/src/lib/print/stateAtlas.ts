import type maplibregl from 'maplibre-gl';

import type { PreviewColorSettings } from './colorSchemes';
import type { StrokeScale } from './strokes';

export const STATE_ATLAS_LABELS = 'print-state-atlas-labels';
/** Bundled Census places and civil towns; independent of vector-tile zoom omissions. */
export function addStateAtlasLabels(map: maplibregl.Map, colors: PreviewColorSettings, scale: StrokeScale) {
  if (!map.getSource(STATE_ATLAS_LABELS)) {
    map.addSource(STATE_ATLAS_LABELS, { type: 'geojson', data: {
      type: 'FeatureCollection', features: [],
    } });
    map.addLayer({ id: STATE_ATLAS_LABELS, source: STATE_ATLAS_LABELS, type: 'symbol', layout: {
      visibility: 'none', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
      'symbol-sort-key': ['get', 'rank'], 'text-allow-overlap': false,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': .25,
    } });
  }
  map.setLayoutProperty(STATE_ATLAS_LABELS, 'text-size', 8 * scale.widthScale);
  map.setLayoutProperty(STATE_ATLAS_LABELS, 'text-padding', .8 * scale.widthScale);
  map.setPaintProperty(STATE_ATLAS_LABELS, 'text-color', colors.roads);
  map.setPaintProperty(STATE_ATLAS_LABELS, 'text-halo-color', colors.land);
  map.setPaintProperty(STATE_ATLAS_LABELS, 'text-halo-width', .9 * scale.widthScale);
}

const loadedStates = new WeakMap<maplibregl.Map, string>();
export function updateStateAtlas(map: maplibregl.Map, slug: string, design: import('./regionDesign').RegionDesign) {
  const source = map.getSource(STATE_ATLAS_LABELS) as maplibregl.GeoJSONSource | undefined;
  if (source && loadedStates.get(map) !== slug) {
    source.setData(`/atlas-places/${slug}.json`);
    loadedStates.set(map, slug);
  }
  const scale = Number(map.getLayoutProperty(STATE_ATLAS_LABELS, 'text-size') || 8) / 8;
  const id = 'print-hometown';
  const hometown = design.theme === 'detailed' ? design.hometown : undefined;
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: hometown ? [{ type: 'Feature', properties: { name: hometown.name }, geometry: { type: 'Point', coordinates: hometown.coordinates } }] : [] };
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'geojson', data });
    map.addLayer({ id, source: id, type: 'circle', paint: { 'circle-radius': 4, 'circle-color': '#a34b32', 'circle-stroke-color': '#fff9eb', 'circle-stroke-width': 2 } });
    map.addLayer({ id: `${id}-label`, source: id, type: 'symbol', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 13, 'text-anchor': 'bottom', 'text-offset': [0, -.7], 'text-allow-overlap': true }, paint: { 'text-color': '#83351f', 'text-halo-color': '#fff9eb', 'text-halo-width': 2 } });
  } else (map.getSource(id) as maplibregl.GeoJSONSource).setData(data);
  map.setPaintProperty(id, 'circle-radius', 4 * scale);
  map.setPaintProperty(id, 'circle-stroke-width', 1.5 * scale);
  map.setLayoutProperty(`${id}-label`, 'text-size', 12 * scale);
  map.setPaintProperty(`${id}-label`, 'text-color', '#83351f');
  map.setPaintProperty(`${id}-label`, 'text-halo-color', '#fff9eb');
  map.setPaintProperty(`${id}-label`, 'text-halo-width', 1.5 * scale);
  map.setFilter(STATE_ATLAS_LABELS, hometown ? ['!=', ['get', 'name'], hometown.name] : null);
}
