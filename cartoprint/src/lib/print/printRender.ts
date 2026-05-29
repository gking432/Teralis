import type maplibregl from 'maplibre-gl';
import type { LayerState } from '@/types/map';
import { applyGreyscale, applyStyleOverrides } from '@/lib/map/style';
import { applyLayerVisibility } from '@/lib/map/layers';
import { getPrintInkColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';

// Quick-settings values surfaced in PrintQuickShop (state / city prints only).
export type PlaceDensity = 'none' | 'cities' | 'towns';
export type RoadDetail   = 'none' | 'highways' | 'roads';

export interface PrintDetailSettings {
  places:   PlaceDensity;
  roads:    RoadDetail;
  counties: boolean;
}

export const DEFAULT_DETAIL_SETTINGS: PrintDetailSettings = {
  places:   'towns',
  roads:    'roads',
  counties: false,
};

// --- per-kind base layer states ---

// State / city prints: cities + towns, highways + main roads, water + rivers.
// No borders (the isolation mask defines the region edge).
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

// Country prints: state outlines + state capitals only. Roads are noise
// at national scale; major rivers provide geographic orientation.
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

/** Build the LayerState for a storefront print given kind + user detail prefs. */
export function buildPrintLayerState(
  kind: 'country' | 'state' | 'city',
  detail: PrintDetailSettings = DEFAULT_DETAIL_SETTINGS,
): LayerState {
  if (kind === 'country') return COUNTRY_PRINT_LAYER_STATE;

  return {
    ...STATE_PRINT_LAYER_STATE,
    capitals: true,
    cities:   detail.places !== 'none',
    towns:    detail.places === 'towns',
    counties: detail.counties,
    highways: detail.roads !== 'none',
    mainroads: detail.roads === 'roads',
    allroads: false,
  };
}

// Extends zoom ranges + styles roads/labels so they render at state-level zoom.
// Respects layers.states and layers.counties so borders can be shown for print.
function applyPrintPreviewOverrides(map: maplibregl.Map, layers: LayerState): void {
  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;

    // Admin/boundary borders — always hide country-level borders (the mask
    // defines the outer edge). State borders are kept when layers.states is true.
    if (/admin.*(country|2)|boundary.*(country|2)/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }

    if (/admin.*(state|3|4)|boundary.*(state|3|4)/.test(id)) {
      if (!layers.states) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      } else if (layer.type === 'line') {
        // Style state borders for print: thin, subtle lines.
        try {
          map.setLayerZoomRange(id, 1, 24);
          map.setPaintProperty(id, 'line-opacity', 0.4);
          map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 2, 0.3, 5, 0.65, 9, 1.1]);
          map.setPaintProperty(id, 'line-dasharray', []);
        } catch {}
      }
      return;
    }

    // County borders — driven entirely by layers.counties. Override zoom ranges
    // so they appear at state-level zoom (base style shows them only at z8+).
    if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) {
      if (!layers.counties) {
        try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      } else if (layer.type === 'line') {
        try {
          map.setLayerZoomRange(id, 3, 24);
          map.setPaintProperty(id, 'line-opacity', 0.22);
          map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.18, 7, 0.45, 10, 0.8]);
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

    // Town/village labels: show major towns from low zoom.
    if (layers.towns && /label_(town|village|other)/.test(id) && layer.type === 'symbol') {
      try {
        map.setLayerZoomRange(id, id === 'label_other' ? 6 : 4, 24);
        map.setLayoutProperty(id, 'text-size', ['interpolate', ['linear'], ['zoom'], 4, 9, 7, 11, 10, 12]);
        map.setLayoutProperty(id, 'text-padding', 1);
      } catch {}
    }

    // Main roads (secondary/tertiary/trunk/primary): show from low zoom.
    if (layers.mainroads && /road_(secondary_tertiary|trunk_primary)/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, 4, 24);
        map.setPaintProperty(id, 'line-opacity', 0.95);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.65, 9, 1.05, 13, 1.55]);
      } catch {}
    }

    // Rivers/waterways: show from low zoom.
    if (layers.rivers && /^waterway/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, 4, 24);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.7, 12, 1.15]);
      } catch {}
    }
  });
}

// Recolors visible layers to the selected scheme.
function recolor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  if (colors.useMapDefault) return;

  const style = map.getStyle();
  if (!style) return;

  const ink = getPrintInkColor(colors);
  const land = colors.land || '#ffffff';

  style.layers.forEach((layer) => {
    const id = layer.id;
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', land);
        return;
      }
      if (layer.type === 'fill' && /water/.test(id)) {
        map.setPaintProperty(id, 'fill-color', ink);
        map.setPaintProperty(id, 'fill-outline-color', ink);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }
      if (layer.type === 'fill') {
        map.setPaintProperty(id, 'fill-color', land);
        map.setPaintProperty(id, 'fill-outline-color', land);
        return;
      }
      if (layer.type === 'line' && /^waterway|water/.test(id)) {
        map.setPaintProperty(id, 'line-color', ink);
        return;
      }
      if (layer.type === 'line' && /road|bridge|tunnel|highway|motorway|trunk|street/.test(id)) {
        map.setPaintProperty(id, 'line-color', ink);
        return;
      }
      if (layer.type === 'line' && /admin|boundary/.test(id)) {
        map.setPaintProperty(id, 'line-color', ink);
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
  applyPrintPreviewOverrides(map, layers);
  recolor(map, colors);
}

/** Sets the isolation mask (area outside the region) to the ink color. */
export function applyPrintMaskColor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  const ink = getPrintInkColor(colors);
  try { map.setPaintProperty('mask-layer', 'fill-color', ink); } catch {}
}
