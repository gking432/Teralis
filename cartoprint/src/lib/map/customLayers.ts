import type { Map as MaplibreMap } from 'maplibre-gl';
import { STATE_CAPITALS_GEOJSON } from '@/lib/geo/usStateCapitals';

// IDs for custom layers so the rest of the code can reference them
export const STATE_CAPITALS_DOT_ID = 'us-state-capitals-dot';
export const STATE_CAPITALS_LABEL_ID = 'us-state-capitals-label';
export const COUNTY_LINES_ID = 'us-county-lines';
export const US_PLACES_LABEL_ID = 'us-places-label';

// Natural Earth 1:10m populated places (~7,000 global, ~2,000 US)
// Served from jsDelivr CDN (mirrors GitHub, no rate limits)
const NE_PLACES_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_10m_populated_places.geojson';

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
 * Adds US populated places from Natural Earth 1:10m (~2,000 US cities/towns).
 *
 * The OpenFreeMap tile source only includes town/village point data in tiles at
 * zoom 7+, so they cannot be shown at state-level zoom (5–6) from the tile source
 * alone. This layer bypasses that constraint by loading a static GeoJSON dataset
 * via CDN — the data is available at any zoom level once loaded.
 *
 * Coverage: all US cities and most towns with population > ~1,000. Very small
 * hamlets (<500 pop) are not in Natural Earth 1:10m; those appear automatically
 * from the tile source when the user zooms in past zoom 7–8.
 *
 * Collision detection is left on (text-allow-overlap: false) so that at low zoom
 * (full-US view) only the most important places are shown. At state-level zoom
 * (~5.5–6.5) there is enough space for all places in a typical state to render.
 * symbol-sort-key = SCALERANK gives collision priority to larger cities.
 */
export function initUsPlacesLayer(map: MaplibreMap): void {
  const fonts = getStyleFonts(map);

  map.addSource('us-places', {
    type: 'geojson',
    data: NE_PLACES_URL,
  });

  // Tiny dot marker — distinguishes place point from surrounding text
  map.addLayer({
    id: 'us-places-dot',
    type: 'circle',
    source: 'us-places',
    filter: ['==', ['get', 'ADM0NAME'], 'United States of America'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 2, 12, 3],
      'circle-color': '#555',
    },
    layout: { visibility: 'none' },
  });

  // Text label
  map.addLayer({
    id: US_PLACES_LABEL_ID,
    type: 'symbol',
    source: 'us-places',
    filter: ['==', ['get', 'ADM0NAME'], 'United States of America'],
    layout: {
      'text-field': ['get', 'NAME'],
      'text-font': fonts,
      // Vary size by importance: major cities slightly larger, small towns tiny
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        3,  ['case', ['<', ['get', 'SCALERANK'], 4], 8, 6],
        6,  ['case', ['<', ['get', 'SCALERANK'], 4], 10, 8],
        9,  ['case', ['<', ['get', 'SCALERANK'], 4], 13, 10],
        13, ['case', ['<', ['get', 'SCALERANK'], 4], 16, 13],
      ],
      'text-anchor': 'top',
      'text-offset': [0, 0.3],
      // Let collision detection handle density — lower SCALERANK (more important)
      // wins when labels compete for space at low zoom
      'symbol-sort-key': ['get', 'SCALERANK'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      visibility: 'none',
    },
    paint: {
      'text-color': '#222',
      'text-halo-color': '#fafaf8',
      'text-halo-width': 1.2,
    },
  });
}

