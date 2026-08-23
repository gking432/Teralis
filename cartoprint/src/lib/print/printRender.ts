import type maplibregl from 'maplibre-gl';
import type { LayerState } from '@/types/map';
import { applyGreyscale, applyStyleOverrides } from '@/lib/map/style';
import { applyLayerVisibility } from '@/lib/map/layers';
import { getPrintInkColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import {
  scaledValue,
  scaledWidth,
  scaledZoomRange,
  STROKE_CURVES,
  TEXT_CURVES,
  UNSCALED,
  type StrokeScale,
} from '@/lib/print/strokes';

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

/**
 * Border thickness as a raw FRACTION of the print width.
 *
 * Layout code needs the unrounded value: asking `getBorderWidth` for a
 * fraction (renderWidth = 1) rounds every weight to zero, which silently
 * removes the border from both the preview and the export.
 */
export function getBorderFraction(weight: BorderWeight): number {
  return BORDER_RATIO[weight];
}

// --- per-kind base layer states ---

// State / city prints: highways + main roads, water + rivers. City streets are
// supplied separately; state place names are intentionally omitted.
// No borders — the isolation mask defines the region edge.
const STATE_PRINT_LAYER_STATE: LayerState = {
  countries: false,
  states: false,
  counties: false,
  capitals: false,
  cities: false,
  towns: false,
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

const CITY_ROAD_SOURCE_ID = 'print-city-road-network';
const CITY_ROAD_LAYERS = [
  'print-city-road-local',
] as const;

/** Hide stale street coverage while a newly framed city extent is loading. */
export function setDetailedCityRoadsVisible(map: maplibregl.Map, visible: boolean): void {
  CITY_ROAD_LAYERS.forEach((id) => {
    if (!map.getLayer(id)) return;
    try { map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); } catch {}
  });
}

/** Remove incomplete coverage rather than leaving a rectangular remnant. */
export function removeDetailedCityRoads(map: maplibregl.Map): void {
  try {
    CITY_ROAD_LAYERS.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(CITY_ROAD_SOURCE_ID)) map.removeSource(CITY_ROAD_SOURCE_ID);
  } catch {}
}

function hideBaseCityLocalRoadLayers(map: maplibregl.Map): void {
  map.getStyle()?.layers.forEach((layer) => {
    if (CITY_ROAD_LAYERS.includes(layer.id as typeof CITY_ROAD_LAYERS[number])) return;
    if (
      layer.type !== 'line' ||
      !/(minor|tertiary|service|track|street)/.test(layer.id) ||
      !/road|bridge|tunnel/.test(layer.id)
    ) return;
    try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch {}
  });
}

function styleDetailedCityRoads(map: maplibregl.Map, scale: StrokeScale, weight: number): void {
  const widths: Record<typeof CITY_ROAD_LAYERS[number], ReturnType<typeof scaledWidth>> = {
    'print-city-road-local': scaledWidth(STROKE_CURVES.street, scale, weight),
  };
  CITY_ROAD_LAYERS.forEach((id) => {
    if (!map.getLayer(id)) return;
    try {
      map.setLayoutProperty(id, 'visibility', 'visible');
      map.setPaintProperty(id, 'line-width', widths[id]);
    } catch {}
  });
}

/** Add the complete z12 city street network shared by editor and export. */
export function addDetailedCityRoads(
  map: maplibregl.Map,
  collection: GeoJSON.FeatureCollection,
  colors: PreviewColorSettings,
  scale: StrokeScale = UNSCALED,
  weight = 1,
): void {
  if (!collection.features.length) {
    removeDetailedCityRoads(map);
    return;
  }
  try {
    removeDetailedCityRoads(map);
    map.addSource(CITY_ROAD_SOURCE_ID, { type: 'geojson', data: collection });

    const before = map.getStyle()?.layers.find((layer) => layer.type === 'symbol')?.id;
    const add = (id: typeof CITY_ROAD_LAYERS[number], classes: string[], opacity: number) => {
      map.addLayer({
        id,
        type: 'line',
        source: CITY_ROAD_SOURCE_ID,
        filter: ['match', ['get', 'class'], classes, true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': colors.roads || getPrintInkColor(colors),
          'line-opacity': opacity,
          'line-width': 1,
        },
      }, before);
    };

    add('print-city-road-local', ['tertiary', 'minor', 'service', 'track', 'street', 'street_limited'], 0.7);
    hideBaseCityLocalRoadLayers(map);
    styleDetailedCityRoads(map, scale, weight);
  } catch {}
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
  const cities = kind === 'state' ? false : detail.labels?.cities ?? (p !== 'none');
  const towns = kind === 'state' ? false : detail.labels?.towns ?? (p === 'neutral' || p === 'more');

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
      highways: true,
      mainroads: true,
      allroads: true,
      roadlabels: detail.labels?.roads ?? false,
      waterlabels: detail.labels?.water ?? false,
      riverlabels: detail.labels?.rivers ?? false,
      rivers: detail.rivers ?? true,
      counties: false,
      states: false,
    };
  }

  // State prints use road and water structure without place-name clutter.
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
    counties: detail.counties ?? false,
    // Liberty's boundary_3 line contains admin levels 3-6. For an isolated US
    // state, this shared layer is also where the county boundaries live.
    states: (detail.states ?? false) || (detail.counties ?? false),
  };
}

// Extends zoom ranges + styles roads/labels so they render at state-level zoom.
// Honors layers.states (country prints) and layers.counties (county lines).
function applyPrintPreviewOverrides(
  map: maplibregl.Map,
  layers: LayerState,
  denseTowns: boolean,
  scale: StrokeScale = UNSCALED,
  weight = 1,
): void {
  const style = map.getStyle();
  if (!style) return;

  const zoomRange = (min: number, max: number) => scaledZoomRange(min, max, scale);

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
          map.setLayerZoomRange(id, ...zoomRange(1, 24));
          map.setPaintProperty(id, 'line-opacity', 0.55);
          map.setPaintProperty(id, 'line-width', scaledWidth(STROKE_CURVES.stateBorder, scale, weight));
        } catch {}
      }
      return;
    }

    // County borders are opt-in and useful mainly for state gazetteers.
    if (/admin.*(5|6|7|8)|boundary.*(county|5|6|7|8)/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', layers.counties ? 'visible' : 'none');
        if (layers.counties && layer.type === 'line') {
          map.setLayerZoomRange(id, ...zoomRange(3, 24));
          map.setPaintProperty(id, 'line-opacity', 0.28);
          map.setPaintProperty(id, 'line-width', scaledWidth(STROKE_CURVES.countyBorder, scale, weight));
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
          map.setLayerZoomRange(id, ...zoomRange(2, 24));
          map.setLayoutProperty(id, 'text-size', scaledWidth(TEXT_CURVES.state, scale));
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
        map.setLayerZoomRange(id, ...zoomRange(3, 24));
        map.setLayoutProperty(id, 'text-size', scaledWidth(TEXT_CURVES.city, scale));
        map.setLayoutProperty(id, 'text-padding', 2);
      } catch {}
    }

    // Town/village labels: show major towns from low zoom. When denseTowns
    // (places = More) push the zoom range lower and tighten padding so far
    // more places fit — matching the full builder's "every town" look.
    if (layers.towns && /label_(town|village|other)/.test(id) && layer.type === 'symbol') {
      try {
        const minZoom = denseTowns ? 3 : (id === 'label_other' ? 6 : 4);
        map.setLayerZoomRange(id, ...zoomRange(minZoom, 24));
        map.setLayoutProperty(id, 'text-size', scaledWidth(
          denseTowns ? TEXT_CURVES.denseTown : TEXT_CURVES.town,
          scale,
        ));
        map.setLayoutProperty(id, 'text-padding', 1);
      } catch {}
    }

    // Highways (motorway/trunk) and main roads (primary/secondary) — paint
    // overrides only. Visibility + zoom range are forced in the unified block
    // below so they can't be left in the base style's restrictive defaults.
    if (layers.highways && /motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-opacity', 0.9);
        map.setPaintProperty(id, 'line-width', scaledWidth(STROKE_CURVES.highway, scale, weight));
      } catch {}
    }

    if (layers.mainroads && /(primary|secondary)/.test(id) && !/motorway|trunk/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-opacity', 0.85);
        map.setPaintProperty(id, 'line-width', scaledWidth(STROKE_CURVES.mainRoad, scale, weight));
      } catch {}
    }

    if (layers.allroads && /(minor|tertiary|service|track|street|link|residential|living|pedestrian|cycleway|footway|path|steps)/.test(id) && !/motorway|trunk|primary|secondary/.test(id) && /road|bridge|tunnel/.test(id) && !/casing/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-opacity', 0.7);
        map.setPaintProperty(id, 'line-width', scaledWidth(STROKE_CURVES.street, scale, weight));
      } catch {}
    }

    // Rivers/waterways: show from low zoom.
    if (layers.rivers && /^waterway/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, ...zoomRange(4, 24));
        map.setPaintProperty(id, 'line-width', scaledWidth(STROKE_CURVES.waterway, scale, weight));
      } catch {}
    }

    // Unified road visibility + zoom range. Runs for every line layer whose
    // id mentions a road/bridge/tunnel keyword. Classifies into highway /
    // main / other, forces visibility based ONLY on the matching density
    // toggle, and expands the zoom range to 3-24 so the road shows at any
    // print zoom (immune to small zoom shifts from border resizing). Roads
    // are completely decoupled from the cities/towns toggle here.
    if (
      layer.type === 'line' &&
      /road|bridge|tunnel/.test(id) &&
      !/casing|rail|transit/.test(id)
    ) {
      const isHighway = /motorway|trunk/.test(id);
      const isMain = !isHighway && /(primary|secondary)/.test(id);
      const shouldBeVisible =
        (isHighway && layers.highways) ||
        (isMain && layers.mainroads) ||
        (!isHighway && !isMain && layers.allroads);
      try {
        map.setLayoutProperty(id, 'visibility', shouldBeVisible ? 'visible' : 'none');
        if (shouldBeVisible) map.setLayerZoomRange(id, ...zoomRange(3, 24));
      } catch {}
    }
  });
}

/**
 * Recolors visible layers to the selected palette.
 *
 * Exported because color is a paint-only change: the live canvas calls this
 * directly on every palette tweak instead of re-rendering the map, which is
 * what makes color selection instant rather than a multi-second round trip.
 */
export function applyPrintColors(
  map: maplibregl.Map,
  colors: PreviewColorSettings,
  scale: StrokeScale = UNSCALED,
): void {
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
      // Isolation and exclusion layers are compositing surfaces, not map
      // geography. Recoloring every generic fill to land made the outside mask
      // white again after a resize, revealing roads from neighboring states.
      if (
        id === 'mask-layer' ||
        id === 'selection-outline-layer' ||
        id.startsWith('print-exclusions-')
      ) return;
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
        // The halo has to grow with the canvas or it vanishes at export size.
        map.setPaintProperty(id, 'text-halo-width', scaledValue(1.4, scale));
        return;
      }
    } catch {}
  });
}

/**
 * Applies everything that depends on the detail settings: which layers are on,
 * their zoom ranges, and their print stroke weights.
 *
 * Exported separately from the colors so the live canvas can respond to a
 * density change with layer toggles alone.
 */
export function applyPrintDetail(
  map: maplibregl.Map,
  kind: 'country' | 'state' | 'city',
  detail: PrintDetailSettings,
  scale: StrokeScale = UNSCALED,
  weight = 1,
): void {
  const layers = buildPrintLayerState(kind, detail);
  applyLayerVisibility(map, layers, scale, weight);
  applyPrintPreviewOverrides(map, layers, detail.places === 'more', scale, weight);
  if (kind === 'city' && map.getSource(CITY_ROAD_SOURCE_ID)) {
    hideBaseCityLocalRoadLayers(map);
    styleDetailedCityRoads(map, scale, weight);
  }
}

/**
 * Full storefront print rendering pipeline. Run inside map 'load'.
 *
 * `scale` re-projects the authored stroke curves onto the canvas we are
 * drawing into, so a 900px live preview and a 3600px export produce the same
 * artwork rather than merely similar ones.
 */
export function applyPrintMapStyle(
  map: maplibregl.Map,
  colors: PreviewColorSettings,
  kind: 'country' | 'state' | 'city' = 'state',
  detail: PrintDetailSettings = DEFAULT_DETAIL_SETTINGS,
  scale: StrokeScale = UNSCALED,
  weight = 1,
): void {
  applyGreyscale(map);
  applyStyleOverrides(map);
  applyPrintDetail(map, kind, detail, scale, weight);
  applyPrintColors(map, colors, scale);
}

/** Sets the isolation mask (area outside the region) to the ink color. */
export function applyPrintMaskColor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  const ink = getPrintInkColor(colors);
  try { map.setPaintProperty('mask-layer', 'fill-color', ink); } catch {}
}
