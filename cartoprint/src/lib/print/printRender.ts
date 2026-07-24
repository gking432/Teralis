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
  border: BorderWeight; // outer print frame
  rivers: boolean;
  counties: boolean;
  states: boolean;
  labels: {
    cities: boolean;
    towns: boolean;
    roads: boolean;
    water: boolean;
    rivers: boolean;
  };
}

export const DEFAULT_DETAIL_SETTINGS: PrintDetailSettings = {
  places: 'neutral',
  roads: 'neutral',
  border: 'medium',
  rivers: true,
  counties: false,
  states: false,
  labels: {
    cities: false,
    towns: false,
    roads: false,
    water: false,
    rivers: false,
  },
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
  statelabels: true,
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
  const cities = detail.labels?.cities ?? (p !== 'none');
  const towns = detail.labels?.towns ?? (p === 'neutral' || p === 'more');

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
      statelabels: false,
      roadlabels: detail.labels?.roads ?? false,
      waterlabels: detail.labels?.water ?? false,
      riverlabels: detail.labels?.rivers ?? false,
      rivers: detail.rivers ?? true,
      counties: detail.counties ?? false,
      states: detail.states ?? true,
      highways,
      mainroads,
      allroads,
    };
  }

  // City prints never show city/town labels — the title block names the place.
  if (kind === 'city') {
    return {
      ...STATE_PRINT_LAYER_STATE,
      capitals: false,
      cities: false,
      towns: false,
      highways,
      mainroads,
      allroads,
      roadlabels: detail.labels?.roads ?? false,
      waterlabels: detail.labels?.water ?? false,
      riverlabels: detail.labels?.rivers ?? false,
      rivers: detail.rivers ?? true,
      counties: false,
      states: false,
    };
  }

  // State prints never show residential streets.
  return {
    ...STATE_PRINT_LAYER_STATE,
    capitals: cities,
    cities,
    towns,
    highways,
    mainroads,
    allroads: false,
    roadlabels: detail.labels?.roads ?? false,
    waterlabels: detail.labels?.water ?? false,
    riverlabels: detail.labels?.rivers ?? false,
    rivers: detail.rivers ?? true,
    counties: detail.counties ?? false,
    states: detail.states ?? false,
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

    // County borders are opt-in and useful mainly for state gazetteers.
    if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', layers.counties ? 'visible' : 'none');
        if (layers.counties && layer.type === 'line') {
          map.setLayerZoomRange(id, 3, 24);
          map.setPaintProperty(id, 'line-opacity', 0.28);
          map.setPaintProperty(id, 'line-width', 0.65);
        }
      } catch {}
      return;
    }

    // Hide road shields / one-way arrows / pedestrian paths.
    if (/road_one_way|road_area_pattern|road_path_pedestrian|road_shield|highway-shield/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
      return;
    }

    // Country maps use state/province names for orientation. They stay hidden
    // on state and city artwork, where the title already identifies the place.
    if (/label_state|place.*(state|province)/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', layers.statelabels ? 'visible' : 'none');
        if (layers.statelabels && layer.type === 'symbol') {
          map.setLayerZoomRange(id, 2, 24);
          map.setLayoutProperty(id, 'text-size', ['interpolate', ['linear'], ['zoom'], 2, 8, 4, 11, 7, 14]);
          map.setLayoutProperty(id, 'text-padding', 2);
        }
      } catch {}
      return;
    }

    // Labels remain off by default and are independently opt-in.
    if (/water_name_(point|line)_label/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', layers.waterlabels ? 'visible' : 'none'); } catch {}
      return;
    }
    if (/waterway.*label/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', layers.riverlabels ? 'visible' : 'none'); } catch {}
      return;
    }
    if (/highway-name|road.*label|road_name|street_name|transportation_name/.test(id)) {
      try { map.setLayoutProperty(id, 'visibility', layers.roadlabels ? 'visible' : 'none'); } catch {}
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

    // Highways (motorway/trunk) and main roads (primary/secondary) — paint
    // overrides only. Visibility + zoom range are forced in the unified block
    // below so they can't be left in the base style's restrictive defaults.
    if (layers.highways && /motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-opacity', 0.9);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.9, 9, 1.5, 13, 2.4]);
      } catch {}
    }

    if (layers.mainroads && /(primary|secondary)/.test(id) && !/motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-opacity', 0.85);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.4, 7, 0.75, 10, 1.2, 13, 1.8]);
      } catch {}
    }

    if (layers.allroads && /(minor|tertiary|service|track|street|link|residential|living|pedestrian|cycleway|footway|path|steps)/.test(id) && !/motorway|trunk|primary|secondary/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
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

    // Unified road visibility + zoom range. Runs for every line layer whose
    // id mentions a road/bridge/tunnel keyword. Classifies into highway /
    // main / other, forces visibility based ONLY on the matching density
    // toggle, and expands the zoom range to 3-24 so the road shows at any
    // print zoom (immune to small zoom shifts from border resizing). Roads
    // are completely decoupled from the cities/towns toggle here.
    if (layer.type === 'line' && /road|bridge|tunnel/.test(id) && !/casing/.test(id)) {
      const isHighway = /motorway|trunk/.test(id);
      const isMain = !isHighway && /(primary|secondary)/.test(id);
      const shouldBeVisible =
        (isHighway && layers.highways) ||
        (isMain && layers.mainroads) ||
        (!isHighway && !isMain && layers.allroads);
      try {
        map.setLayoutProperty(id, 'visibility', shouldBeVisible ? 'visible' : 'none');
        if (shouldBeVisible) map.setLayerZoomRange(id, 3, 24);
      } catch {}
    }
  });
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
}

/** Sets the isolation mask (area outside the region) to the ink color. */
export function applyPrintMaskColor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  const ink = getPrintInkColor(colors);
  try { map.setPaintProperty('mask-layer', 'fill-color', ink); } catch {}
}
