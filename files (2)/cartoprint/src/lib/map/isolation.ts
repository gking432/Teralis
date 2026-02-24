/**
 * Isolation Masking
 *
 * Creates an inverted polygon (world bounds with selection cut out as holes)
 * to visually mask everything outside the selected region with white space.
 *
 * Ported from /reference/prototype.html — see applyIsolationMask().
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapSelection } from '@/types/map';
import { BACKGROUND_COLOR } from './style';

/** World bounds ring for the mask exterior */
const WORLD_RING: [number, number][] = [
  [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90],
];

/** Initialize mask and outline layers on the map */
export function initIsolationLayers(map: MaplibreMap): void {
  // Mask source (inverted polygon)
  map.addSource('selection-mask', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Mask fill layer (white over everything outside selection)
  map.addLayer({
    id: 'mask-layer',
    type: 'fill',
    source: 'selection-mask',
    paint: { 'fill-color': BACKGROUND_COLOR, 'fill-opacity': 1 },
    layout: { visibility: 'none' },
  });

  // Selection outline source
  map.addSource('selection-outline', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Dashed outline around selection
  map.addLayer({
    id: 'selection-outline-layer',
    type: 'line',
    source: 'selection-outline',
    paint: { 'line-color': '#333', 'line-width': 2, 'line-dasharray': [4, 3] },
    layout: { visibility: 'visible' },
  });
}

/** Show the selection outline */
export function showSelectionOutline(map: MaplibreMap, selection: MapSelection): void {
  if (!selection.geojson) return;

  const source = map.getSource('selection-outline') as maplibregl.GeoJSONSource;
  if (source) {
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: selection.geojson as any,
    });
  }
}

/** Apply the isolation mask (white out everything outside selection) */
export function applyIsolationMask(map: MaplibreMap, selection: MapSelection): void {
  if (!selection.geojson) return;

  const geo = selection.geojson as any;
  let mask: GeoJSON.Feature;

  if (geo.type === 'Polygon') {
    mask = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [WORLD_RING, ...geo.coordinates.map((ring: any) => ring.slice().reverse())],
      },
    };
  } else if (geo.type === 'MultiPolygon') {
    const holes: any[] = [];
    geo.coordinates.forEach((poly: any) => {
      poly.forEach((ring: any) => holes.push(ring.slice().reverse()));
    });
    mask = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [WORLD_RING, ...holes],
      },
    };
  } else {
    return;
  }

  const source = map.getSource('selection-mask') as maplibregl.GeoJSONSource;
  if (source) {
    source.setData(mask as any);
  }

  map.setLayoutProperty('mask-layer', 'visibility', 'visible');

  // Move mask and outline to top
  try { map.moveLayer('mask-layer'); } catch {}
  try { map.moveLayer('selection-outline-layer'); } catch {}
}

/** Clear the isolation mask */
export function clearIsolationMask(map: MaplibreMap): void {
  const source = map.getSource('selection-mask') as maplibregl.GeoJSONSource;
  if (source) {
    source.setData({ type: 'FeatureCollection', features: [] });
  }
  try { map.setLayoutProperty('mask-layer', 'visibility', 'none'); } catch {}
}

/** Clear both the outline and mask */
export function clearSelection(map: MaplibreMap): void {
  const outlineSource = map.getSource('selection-outline') as maplibregl.GeoJSONSource;
  if (outlineSource) {
    outlineSource.setData({ type: 'FeatureCollection', features: [] });
  }
  clearIsolationMask(map);
}
