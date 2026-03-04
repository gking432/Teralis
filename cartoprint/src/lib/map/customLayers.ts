import type { Map as MaplibreMap } from 'maplibre-gl';
import { STATE_CAPITALS_GEOJSON } from '@/lib/geo/usStateCapitals';

// IDs for custom layers so the rest of the code can reference them
export const STATE_CAPITALS_DOT_ID = 'us-state-capitals-dot';
export const STATE_CAPITALS_LABEL_ID = 'us-state-capitals-label';
export const COUNTY_LINES_ID = 'us-county-lines';
export const US_PLACES_LABEL_ID = 'us-places-label';

// Local static file served from /public/data — 29,880 US places with full coverage
// Source: US Cities Database (kelvins/US-Cities-Database), all incorporated places
const US_PLACES_URL = '/data/us-places.geojson';

/** Helper: read the first text-font found in the current style */
function getStyleFonts(map: MaplibreMap): string[] {
  const style = map.getStyle();
  if (style?.layers) {
    for (const l of style.layers) {
      const font = (l as any).layout?.['text-font'];
      if (Array.isArray(font) && font.length > 0) return font as string[];
    }
  }
  return ['Noto Sans Regular', 'Open Sans Regular'];
}

/**
 * Adds a static GeoJSON layer for all 50 US state capitals.
 * This bypasses the tile source zoom-level constraint so capitals appear
 * at any zoom when the toggle is on.
 */
export function initStateCapitalsLayer(map: MaplibreMap): void {
  const fonts = getStyleFonts(map);

  map.addSource('us-state-capitals', {
    type: 'geojson',
    data: STATE_CAPITALS_GEOJSON as any,
  });

  // Filled dot with a white ring — classic capital marker
  map.addLayer({
    id: STATE_CAPITALS_DOT_ID,
    type: 'circle',
    source: 'us-state-capitals',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 5, 12, 7],
      'circle-color': '#222',
      'circle-stroke-color': '#fafaf8',
      'circle-stroke-width': 1.5,
    },
    layout: { visibility: 'none' },
  });

  // Text label below the dot
  map.addLayer({
    id: STATE_CAPITALS_LABEL_ID,
    type: 'symbol',
    source: 'us-state-capitals',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': fonts,
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 7, 11, 12, 14],
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      visibility: 'none',
    },
    paint: {
      'text-color': '#1a1a1a',
      'text-halo-color': '#fafaf8',
      'text-halo-width': 1.5,
    },
  });
}

/**
 * Adds a county/district boundary layer by reading the state boundary layer's
 * tile source and filtering for admin_level=6 features.
 *
 * OpenMapTiles/OpenFreeMap includes county boundaries (admin_level 6) in the
 * same tile source as state boundaries (admin_level 4). The default Liberty
 * style only renders admin_level 4 (boundary_3). This layer surfaces the
 * county data that is already in the tiles.
 *
 * Tile data availability: county features typically enter the tiles at zoom 6,
 * so the layer will begin rendering county detail from zoom 6–7.
 */
export function initCountyLayer(map: MaplibreMap): void {
  const style = map.getStyle();
  if (!style) return;

  // Find boundary_3 (state lines) to get the tile source + source-layer name
  const stateBoundaryLayer = style.layers.find((l) => l.id === 'boundary_3') as any;
  if (!stateBoundaryLayer?.source || !stateBoundaryLayer?.['source-layer']) return;

  try {
    map.addLayer(
      {
        id: COUNTY_LINES_ID,
        type: 'line',
        source: stateBoundaryLayer.source as string,
        'source-layer': stateBoundaryLayer['source-layer'] as string,
        // admin_level 5–7 covers counties, parishes, boroughs, etc. in the US
        filter: ['all',
          ['>=', ['to-number', ['get', 'admin_level']], 5],
          ['<=', ['to-number', ['get', 'admin_level']], 7],
        ],
        paint: {
          'line-color': '#999',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.3,
            9, 0.7,
            12, 1.2,
          ],
        },
        layout: { visibility: 'none' },
      },
      'boundary_3' // render below state lines
    );
  } catch {
    // Source or source-layer not available — silently skip
  }
}

/**
 * Adds all 29,880 US populated places from a locally-bundled GeoJSON file
 * (served from /public/data/us-places.geojson — no external CDN dependency).
 *
 * Source: kelvins/US-Cities-Database — every incorporated US city, town, and
 * village with coordinates. Wisconsin has 756 places; most states have 200–800.
 *
 * Because this is a GeoJSON source (not a vector tile source), all features are
 * available at every zoom level the moment the file loads. This bypasses the
 * OpenFreeMap tile source constraint where town data only enters tiles at zoom 7+.
 *
 * text-allow-overlap and text-ignore-placement are set to true so that ALL
 * places render when the toggle is on — the user explicitly chose to see them.
 */
export function initUsPlacesLayer(map: MaplibreMap): void {
  const fonts = getStyleFonts(map);

  map.addSource('us-places', {
    type: 'geojson',
    data: US_PLACES_URL,
  });

  // Tiny dot at each place location
  map.addLayer({
    id: 'us-places-dot',
    type: 'circle',
    source: 'us-places',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 2, 12, 3],
      'circle-color': '#555',
    },
    layout: { visibility: 'none' },
  });

  // Text label — allow-overlap is true so every place renders when the toggle is on
  map.addLayer({
    id: US_PLACES_LABEL_ID,
    type: 'symbol',
    source: 'us-places',
    layout: {
      'text-field': ['get', 'NAME'],
      'text-font': fonts,
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 7, 5, 8, 8, 10, 12, 13],
      'text-anchor': 'top',
      'text-offset': [0, 0.3],
      // Force ALL labels to render — no collision culling
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      visibility: 'none',
    },
    paint: {
      'text-color': '#222',
      'text-halo-color': '#fafaf8',
      'text-halo-width': 1.2,
    },
  });
}

