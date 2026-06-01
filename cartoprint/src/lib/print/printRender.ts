import type maplibregl from 'maplibre-gl';
import type { LayerState } from '@/types/map';
import { applyGreyscale, applyStyleOverrides } from '@/lib/map/style';
import { applyLayerVisibility } from '@/lib/map/layers';
import { getPrintInkColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';

// Four-level density used by the "Customize this view" detail controls.
// Neutral is the default; Less/More step down/up from there.
export type Density = 'none' | 'less' | 'neutral' | 'more';

// Outer ink-color border around the print. Default is medium (~1 inch on a
// 12x16, ~2 inches on a 24x36). Removable via the customizer panel.
export type BorderWeight = 'none' | 'thin' | 'medium' | 'thick';

export interface PrintDetailSettings {
  places: Density;   // cities & towns
  roads: Density;    // highways & main roads
  counties: boolean; // county lines
  border: BorderWeight; // outer print frame
}

export const DEFAULT_DETAIL_SETTINGS: PrintDetailSettings = {
  places: 'neutral',
  roads: 'neutral',
  counties: false,
  border: 'medium',
};

// Border thickness as a fraction of the rendered width. Picked so medium
// gives ~1" on a 12x16 and ~2" on a 24x36 at 300 DPI.
const BORDER_RATIO: Record<BorderWeight, number> = {
  none: 0,
  thin: 0.03,
  medium: 0.08,
  thick: 0.12,
};

export function getBorderWidth(weight: BorderWeight, renderWidth: number): number {
  return Math.round(renderWidth * BORDER_RATIO[weight]);
}

// --- per-kind base layer states ---

// State / city prints: cities + towns, highways + main roads, water + rivers.
// No borders — the isolation mask defines the region edge.
const STATE_PRINT_LAYER_STATE: LayerState = {
  countries: false,
  states: false,
  counties: false,
  capitals: true,
  cities: true,
  towns: true,
  statelabels: false,
  countrylabels: false,
  highways: true,
  mainroads: true,
  allroads: false,
  roadlabels: false,
  water: true,
  rivers: true,
  riverlabels: false,
  waterlabels: false,
  terrain: false,
  landcover: false,
};

// Country prints: state outlines + state capitals only. Roads are noise at
// national scale; major rivers provide geographic orientation.
const COUNTRY_PRINT_LAYER_STATE: LayerState = {
  countries: false,
  states: true,
  counties: false,
  capitals: true,
  cities: false,
  towns: false,
  statelabels: false,
  countrylabels: false,
  highways: false,
  mainroads: false,
  allroads: false,
  roadlabels: false,
  water: true,
  rivers: true,
  riverlabels: false,
  waterlabels: false,
  terrain: false,
  landcover: false,
};

// Legacy export (kept for any code that imported the old name).
export const PRINT_LAYER_STATE = STATE_PRINT_LAYER_STATE;

// True when the "more" level should pull every town from the place dataset.
export function wantsEveryTown(detail: PrintDetailSettings): boolean {
  return detail.places === 'more';
}

/** Build the LayerState for a storefront print given kind + user detail prefs. */
export function buildPrintLayerState(
  kind: 'country' | 'state' | 'city',
  detail: PrintDetailSettings = DEFAULT_DETAIL_SETTINGS,
): LayerState {
  const p = detail.places;
  const r = detail.roads;

  // Places: none < less (major cities) < neutral (+towns) < more (every town).
  // The base style ranks city/town labels by importance, so "less" naturally
  // surfaces only the largest cities.
  const cities = p !== 'none';
  const towns = p === 'neutral' || p === 'more';

  // Roads: none < less (highways) < neutral (+main roads) < more (+streets).
  const highways = r !== 'none';
  const mainroads = r === 'neutral' || r === 'more';
  const allroads = r === 'more';

  if (kind === 'country') {
    // National prints always keep state outlines + state capitals; the
    // toggles layer cities/towns/roads on top of that base.
    return {
      ...COUNTRY_PRINT_LAYER_STATE,
      capitals: true,
      cities,
      towns,
      highways,
      mainroads,
      allroads,
      counties: detail.counties,
    };
  }

  return {
    ...STATE_PRINT_LAYER_STATE,
    capitals: cities,
    cities,
    towns,
    highways,
    mainroads,
    allroads,
    counties: detail.counties,
  };
}

// Extends zoom ranges + styles roads/labels so they render at state-level zoom.
// Honors layers.states (country prints) and layers.counties (county lines).
function applyPrintPreviewOverrides(
  map: maplibregl.Map,
  layers: LayerState,
  denseTowns: boolean,
): void {
  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;

    // Country-level borders: always hidden (mask defines the outer edge).
    if (/admin.*(country|2)|boundary.*(country|2)/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }

    // State borders: hidden unless layers.states (country prints). When shown,
    // give them a clear, print-weight line (recolor sets the color to ink).
    if (/admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) {
      if (!layers.states) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      } else if (layer.type === 'line') {
        try {
          map.setLayoutProperty(id, 'visibility', 'visible');
          map.setLayerZoomRange(id, 1, 24);
          map.setPaintProperty(id, 'line-opacity', 0.55);
          map.setPaintProperty(id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            2, 1.0, 4, 1.7, 6, 2.6, 9, 3.4,
          ]);
        } catch {}
      }
      return;
    }

    // County borders from the base style (if present): driven by layers.counties.
    // We also add a dedicated county-line layer in addPrintCountyLines() because
    // many base styles don't render admin_level 6 at all.
    if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) {
      if (!layers.counties) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      } else if (layer.type === 'line') {
        try {
          map.setLayoutProperty(id, 'visibility', 'visible');
          map.setLayerZoomRange(id, 3, 24);
          map.setPaintProperty(id, 'line-opacity', 0.32);
          map.setPaintProperty(id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            4, 0.5, 7, 0.9, 10, 1.4,
          ]);
        } catch {}
      }
      return;
    }

    // Hide road shields / one-way arrows / pedestrian paths.
    if (/road_one_way|road_area_pattern|road_path_pedestrian|road_shield|highway-shield/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }

    // Hide state/province point labels (state name goes in the title band).
    if (/label_state|place.*(state|province)/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }

    // Hide water + river + road name labels.
    if (/water_name_(point|line)_label/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }
    if (/waterway.*label/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }
    if (/highway-name|road.*label|road_name|street_name|transportation_name/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }

    // City + capital labels: show from low zoom, readable sizing.
    if (/label_(city|city_capital)|place.*(city|capital)/.test(id) && layer.type === 'symbol') {
      try {
        map.setLayerZoomRange(id, 3, 24);
        map.setLayoutProperty(id, 'text-size', ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 13, 10, 15]);
        map.setLayoutProperty(id, 'text-padding', 2);
      } catch {}
    }

    // Town/village labels: show major towns from low zoom. When denseTowns
    // (places = More) push the zoom range lower and tighten padding so far
    // more places fit — matching the full builder's "every town" look.
    if (layers.towns && /label_(town|village|other)/.test(id) && layer.type === 'symbol') {
      try {
        const minZoom = denseTowns ? 3 : (id === 'label_other' ? 6 : 4);
        map.setLayerZoomRange(id, minZoom, 24);
        map.setLayoutProperty(id, 'text-size', denseTowns
          ? ['interpolate', ['linear'], ['zoom'], 3, 8, 7, 10, 10, 11]
          : ['interpolate', ['linear'], ['zoom'], 4, 9, 7, 11, 10, 12]);
        map.setLayoutProperty(id, 'text-padding', denseTowns ? 1 : 1);
      } catch {}
    }

    // Highways (motorway/trunk): show from low zoom, always on for highways=true.
    if (layers.highways && /motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, 3, 24);
        map.setPaintProperty(id, 'line-opacity', 0.9);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.9, 9, 1.5, 13, 2.4]);
      } catch {}
    }

    // Main roads (primary/secondary): show from state zoom.
    // Matches OpenFreeMap layer IDs like road_primary, road_secondary, bridge_primary, etc.
    if (layers.mainroads && /(primary|secondary)/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, 4, 24);
        map.setPaintProperty(id, 'line-opacity', 0.85);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.4, 7, 0.75, 10, 1.2, 13, 1.8]);
      } catch {}
    }

    // Minor roads / streets (roads = More): bring in tertiary, service, track at state zoom.
    // Matches OpenFreeMap layer IDs like road_tertiary, road_minor, road_service, road_track.
    if (layers.allroads && /(minor|tertiary|service|track|street|link)/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setLayerZoomRange(id, 4, 24);
        map.setPaintProperty(id, 'line-opacity', 0.7);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.15, 7, 0.35, 10, 0.65, 13, 1.0]);
      } catch {}
    }

    // Rivers/waterways: show from low zoom.
    if (layers.rivers && /^waterway/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, 4, 24);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.7, 12, 1.15]);
      } catch {}
    }

    // Final road-line suppression: hide any road/bridge/tunnel line layer
    // that isn't in the desired density level. Catches types not covered by
    // classifyLayer (road_residential, road_path, road_living_street…) that
    // base styles expose at city zoom. Roads are controlled solely by the
    // roads toggle — the places toggle must never affect them.
    if (layer.type === 'line' && /road|bridge|tunnel/.test(id) && !/casing/.test(id)) {
      const isHighway = /motorway|trunk/.test(id);
      const isMain = /(primary|secondary)/.test(id) && !isHighway;
      const shouldBeVisible =
        (isHighway && layers.highways) ||
        (isMain && layers.mainroads) ||
        (!isHighway && !isMain && layers.allroads);
      if (!shouldBeVisible) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      }
    }
  });
}

// Find the vector source + source-layer used for admin boundaries, by scanning
// the existing boundary/admin layers. Returns null if none can be identified.
function findBoundarySource(map: maplibregl.Map): { source: string; sourceLayer: string } | null {
  const style = map.getStyle();
  if (!style) return null;
  for (const layer of style.layers) {
    if ('source' in layer && (layer as any)['source-layer'] && /admin|boundary/.test(layer.id)) {
      const src = (layer as any).source as string;
      const srcLayer = (layer as any)['source-layer'] as string;
      if (src && srcLayer) return { source: src, sourceLayer: srcLayer };
    }
  }
  return null;
}

// Adds a dedicated county-line layer (admin_level 6) from the boundary vector
// source. Needed because most base styles don't draw county boundaries.
function addPrintCountyLines(map: maplibregl.Map, ink: string): void {
  const boundary = findBoundarySource(map);
  if (!boundary) return;
  if (map.getLayer('print-county-lines')) {
    try { map.removeLayer('print-county-lines'); } catch {}
  }
  try {
    map.addLayer({
      id: 'print-county-lines',
      type: 'line',
      source: boundary.source,
      'source-layer': boundary.sourceLayer,
      filter: ['==', ['get', 'admin_level'], 6],
      minzoom: 3,
      paint: {
        'line-color': ink,
        'line-opacity': 0.3,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 7, 0.85, 10, 1.35],
      },
    });
  } catch {}
}

// Recolors visible layers to the selected scheme.
function recolor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  if (colors.useMapDefault) return;

  const style = map.getStyle();
  if (!style) return;

  const ink = getPrintInkColor(colors);          // labels / title / mask ink (water-derived)
  const water = colors.water || ink;             // water bodies — any color
  const land = colors.land || '#ffffff';         // land background — any color
  const roads = colors.roads || ink;             // road lines & borders — any color

  style.layers.forEach((layer) => {
    const id = layer.id;
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', land);
        return;
      }
      if (layer.type === 'fill' && /water/.test(id)) {
        map.setPaintProperty(id, 'fill-color', water);
        map.setPaintProperty(id, 'fill-outline-color', water);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }
      if (layer.type === 'fill') {
        map.setPaintProperty(id, 'fill-color', land);
        map.setPaintProperty(id, 'fill-outline-color', land);
        return;
      }
      if (layer.type === 'line' && /^waterway|water/.test(id)) {
        map.setPaintProperty(id, 'line-color', water);
        return;
      }
      if (layer.type === 'line' && /road|bridge|tunnel|highway|motorway|trunk|street/.test(id)) {
        map.setPaintProperty(id, 'line-color', roads);
        return;
      }
      if (layer.type === 'line' && /admin|boundary/.test(id)) {
        map.setPaintProperty(id, 'line-color', roads);
        return;
      }
      if (layer.type === 'symbol') {
        map.setPaintProperty(id, 'text-color', ink);
        map.setPaintProperty(id, 'text-halo-color', land);
        map.setPaintProperty(id, 'text-halo-width', 1.4);
        return;
      }
    } catch {}
  });
}

/** Full storefront print rendering pipeline. Run inside map 'load'. */
export function applyPrintMapStyle(
  map: maplibregl.Map,
  colors: PreviewColorSettings,
  kind: 'country' | 'state' | 'city' = 'state',
  detail: PrintDetailSettings = DEFAULT_DETAIL_SETTINGS,
): void {
  const layers = buildPrintLayerState(kind, detail);
  applyGreyscale(map);
  applyStyleOverrides(map);
  applyLayerVisibility(map, layers);
  applyPrintPreviewOverrides(map, layers, detail.places === 'more');
  recolor(map, colors);
  if (layers.counties) addPrintCountyLines(map, getPrintInkColor(colors));
}

/** Sets the isolation mask (area outside the region) to the ink color. */
export function applyPrintMaskColor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  const ink = getPrintInkColor(colors);
  try { map.setPaintProperty('mask-layer', 'fill-color', ink); } catch {}
}
