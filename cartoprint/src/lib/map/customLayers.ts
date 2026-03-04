import type { Map as MaplibreMap } from 'maplibre-gl';
import { STATE_CAPITALS_GEOJSON } from '@/lib/geo/usStateCapitals';

// IDs for custom layers so the rest of the code can reference them
export const STATE_CAPITALS_DOT_ID = 'us-state-capitals-dot';
export const STATE_CAPITALS_LABEL_ID = 'us-state-capitals-label';
export const COUNTY_LINES_ID = 'us-county-lines';

/**
 * Adds a static GeoJSON layer for all 50 US state capitals.
 * This bypasses the tile source zoom-level constraint so capitals appear
 * at any zoom when the toggle is on.
 */
export function initStateCapitalsLayer(map: MaplibreMap): void {
  // Grab a font name that already exists in this style
  const style = map.getStyle();
  let fonts: string[] = ['Noto Sans Regular', 'Open Sans Regular'];
  if (style?.layers) {
    for (const l of style.layers) {
      const font = (l as any).layout?.['text-font'];
      if (Array.isArray(font) && font.length > 0) {
        fonts = font;
        break;
      }
    }
  }

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
