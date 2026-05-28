import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
import type { MapSelection } from '@/types/map';
const WORLD_RING: [number, number][] = [
  [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90],
];

export function initIsolationLayers(map: MaplibreMap): void {
  map.addSource('selection-mask', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'mask-layer',
    type: 'fill',
    source: 'selection-mask',
    paint: { 'fill-color': '#ffffff', 'fill-opacity': 1 },
    layout: { visibility: 'none' },
  });

  map.addSource('selection-outline', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'selection-outline-layer',
    type: 'line',
    source: 'selection-outline',
    paint: { 'line-color': '#333', 'line-width': 0, 'line-opacity': 0 },
    layout: { visibility: 'none' },
  });

  map.addSource('print-exclusions', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'print-exclusions-fill-layer',
    type: 'fill',
    source: 'print-exclusions',
    paint: { 'fill-color': '#ffffff', 'fill-opacity': 1 },
    layout: { visibility: 'none' },
  });

  map.addLayer({
    id: 'print-exclusions-line-layer',
    type: 'line',
    source: 'print-exclusions',
    paint: { 'line-color': '#ffffff', 'line-width': 2 },
    layout: { visibility: 'none' },
  });
}

export function showSelectionOutline(map: MaplibreMap, selection: MapSelection): void {
  if (!selection.geojson) return;
  const source = map.getSource('selection-outline') as GeoJSONSource;
  if (source) {
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: selection.geojson as any,
    });
  }
  try { map.setLayoutProperty('selection-outline-layer', 'visibility', 'none'); } catch {}
}

function collectHoleRings(geometry: GeoJSON.Geometry): number[][][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ring.slice().reverse() as number[][]);
  }

  if (geometry.type === 'MultiPolygon') {
    const holes: number[][][] = [];
    geometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        holes.push(ring.slice().reverse() as number[][]);
      });
    });
    return holes;
  }

  return [];
}

export function showSelectionSet(
  map: MaplibreMap,
  geometries: GeoJSON.Geometry[],
  opacity = 1
): void {
  const validGeometries = geometries.filter((geometry): geometry is GeoJSON.Geometry => Boolean(geometry));
  if (validGeometries.length === 0) {
    clearSelectionLayers(map);
    return;
  }

  const holes = validGeometries.flatMap((geometry) => collectHoleRings(geometry));
  const maskSource = map.getSource('selection-mask') as GeoJSONSource;
  const outlineSource = map.getSource('selection-outline') as GeoJSONSource;

  if (maskSource) {
    maskSource.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [WORLD_RING, ...holes],
      },
    } as GeoJSON.Feature);
  }

  if (outlineSource) {
    outlineSource.setData({
      type: 'FeatureCollection',
      features: validGeometries.map((geometry) => ({
        type: 'Feature',
        properties: {},
        geometry,
      })),
    });
  }

  map.setLayoutProperty('mask-layer', 'visibility', 'visible');
  map.setPaintProperty('mask-layer', 'fill-opacity', opacity);
  try { map.setLayoutProperty('selection-outline-layer', 'visibility', 'none'); } catch {}
  try { map.moveLayer('mask-layer'); } catch {}
}

export function applyIsolationMask(
  map: MaplibreMap,
  selection: MapSelection,
  opacity = 1
): void {
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

  const source = map.getSource('selection-mask') as GeoJSONSource;
  if (source) {
    source.setData(mask as any);
  }

  map.setLayoutProperty('mask-layer', 'visibility', 'visible');
  map.setPaintProperty('mask-layer', 'fill-opacity', opacity);
  try { map.setLayoutProperty('selection-outline-layer', 'visibility', 'none'); } catch {}
  try { map.moveLayer('mask-layer'); } catch {}
}

export function clearIsolationMask(map: MaplibreMap): void {
  const source = map.getSource('selection-mask') as GeoJSONSource;
  if (source) {
    source.setData({ type: 'FeatureCollection', features: [] });
  }
  try { map.setLayoutProperty('mask-layer', 'visibility', 'none'); } catch {}
}

export function clearSelectionLayers(map: MaplibreMap): void {
  const outlineSource = map.getSource('selection-outline') as GeoJSONSource;
  if (outlineSource) {
    outlineSource.setData({ type: 'FeatureCollection', features: [] });
  }
  try { map.setLayoutProperty('selection-outline-layer', 'visibility', 'none'); } catch {}
  clearIsolationMask(map);
}

export function showPrintExclusions(map: MaplibreMap, geometries: GeoJSON.Geometry[]): void {
  const source = map.getSource('print-exclusions') as GeoJSONSource;
  if (!source) return;

  source.setData({
    type: 'FeatureCollection',
    features: geometries
      .filter((geometry): geometry is GeoJSON.Geometry => Boolean(geometry))
      .map((geometry) => ({
        type: 'Feature',
        properties: {},
        geometry,
      })),
  });

  const visibility = geometries.length > 0 ? 'visible' : 'none';
  try { map.setLayoutProperty('print-exclusions-fill-layer', 'visibility', visibility); } catch {}
  try { map.setLayoutProperty('print-exclusions-line-layer', 'visibility', visibility); } catch {}
  try { map.moveLayer('print-exclusions-fill-layer'); } catch {}
  try { map.moveLayer('print-exclusions-line-layer'); } catch {}
}

export function clearPrintExclusions(map: MaplibreMap): void {
  const source = map.getSource('print-exclusions') as GeoJSONSource;
  if (source) {
    source.setData({ type: 'FeatureCollection', features: [] });
  }
  try { map.setLayoutProperty('print-exclusions-fill-layer', 'visibility', 'none'); } catch {}
  try { map.setLayoutProperty('print-exclusions-line-layer', 'visibility', 'none'); } catch {}
}
