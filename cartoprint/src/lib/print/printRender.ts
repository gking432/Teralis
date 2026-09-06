import { addStateAtlasLabels, STATE_ATLAS_LABELS, updateStateAtlas } from './stateAtlas';
import type maplibregl from 'maplibre-gl';
import type { LayerState } from '@/types/map';
import { addTerrain, applyGreyscale, applyStyleOverrides } from '@/lib/map/style';
import { applyLayerVisibility, classifyLayer } from '@/lib/map/layers';
import { getPrintInkColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { hillshadeExaggeration, type RegionDesign } from '@/lib/print/regionDesign';
import type { DetailBias } from '@/lib/print/density';
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

// Shared state/city base. The edition normalizer decides whether roads, place
// names, or rivers are enabled; city streets and ranked state labels can also
// be supplied by their dedicated high-resolution sources.
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

const CITY_ROAD_SOURCE_ID = 'print-city-road-network';
const CITY_ROAD_LAYERS = [
  'print-city-road-local',
] as const;

const STATE_DETAIL_SOURCE_ID = 'print-state-details';
const STATE_DETAIL_LAYERS = [
  'print-state-detail-lakes',
  'print-state-detail-county-boundaries',
  'print-state-detail-rivers',
  'print-state-detail-roads',
] as const;

export function removeDetailedStateFeatures(map: maplibregl.Map): void {
  try {
    STATE_DETAIL_LAYERS.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(STATE_DETAIL_SOURCE_ID)) map.removeSource(STATE_DETAIL_SOURCE_ID);
  } catch {}
}

/** Re-project state-detail strokes after the live canvas resizes. */
export function styleDetailedStateFeatures(
  map: maplibregl.Map,
  scale: StrokeScale = UNSCALED,
  weight = 1,
): void {
  try {
    if (map.getLayer('print-state-detail-county-boundaries')) {
      map.setPaintProperty(
        'print-state-detail-county-boundaries',
        'line-width',
        scaledWidth(STROKE_CURVES.countyBorder, scale, weight),
      );
    }
    if (map.getLayer('print-state-detail-rivers')) {
      map.setPaintProperty(
        'print-state-detail-rivers',
        'line-width',
        scaledWidth(STROKE_CURVES.waterway, scale, weight),
      );
    }
    if (map.getLayer('print-state-detail-roads')) {
      map.setPaintProperty(
        'print-state-detail-roads',
        'line-width',
        scaledWidth(STROKE_CURVES.street, scale, weight * 0.9),
      );
    }
  } catch {}
}

/** Add geography that low-zoom state tiles do not contain. */
export function addDetailedStateFeatures(
  map: maplibregl.Map,
  collection: GeoJSON.FeatureCollection,
  colors: PreviewColorSettings,
  scale: StrokeScale = UNSCALED,
  weight = 1,
): boolean {
  removeDetailedStateFeatures(map);
  if (!collection.features.length) return false;

  try {
    map.addSource(STATE_DETAIL_SOURCE_ID, { type: 'geojson', data: collection });
    const beforeMask = map.getLayer('mask-layer') ? 'mask-layer' : undefined;
    const beforeRoads = map.getStyle()?.layers.find((layer) => {
      const group = classifyLayer(layer.id);
      return group === 'highways' || group === 'mainroads' || group === 'allroads';
    })?.id ?? beforeMask;
    map.addLayer({
      id: 'print-state-detail-lakes',
      type: 'fill',
      source: STATE_DETAIL_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'lake'],
      paint: {
        'fill-color': colors.water || getPrintInkColor(colors),
        'fill-opacity': 1,
      },
    }, beforeRoads);
    map.addLayer({
      id: 'print-state-detail-county-boundaries',
      type: 'line',
      source: STATE_DETAIL_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'county'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.roads || getPrintInkColor(colors),
        'line-opacity': 0.25,
        'line-width': scaledWidth(STROKE_CURVES.countyBorder, scale, weight),
      },
    }, beforeMask);
    map.addLayer({
      id: 'print-state-detail-rivers',
      type: 'line',
      source: STATE_DETAIL_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'river'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.water || getPrintInkColor(colors),
        'line-opacity': 0.58,
        'line-width': scaledWidth(STROKE_CURVES.waterway, scale, weight),
      },
    }, beforeMask);
    map.addLayer({
      id: 'print-state-detail-roads',
      type: 'line',
      source: STATE_DETAIL_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'road'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.roads || getPrintInkColor(colors),
        'line-opacity': 0.38,
        'line-width': scaledWidth(STROKE_CURVES.street, scale, weight * 0.9),
      },
    }, beforeMask);
    styleDetailedStateFeatures(map, scale, weight);
    return true;
  } catch {
    removeDetailedStateFeatures(map);
    return false;
  }
}

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

  // Places: none < less (major cities) < neutral (+towns) < more (additional towns).
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

  // Region editions respect the chosen place-label level.
  return {
    ...STATE_PRINT_LAYER_STATE,
    capitals: false,
    cities,
    towns,
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
    // more places fit — matching the full builder's denser-label look.
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
      if (layer.type === 'hillshade') {
        map.setPaintProperty(id, 'hillshade-shadow-color', water);
        map.setPaintProperty(id, 'hillshade-highlight-color', land);
        map.setPaintProperty(id, 'hillshade-accent-color', roads);
        return;
      }
      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', land);
        return;
      }
      if (layer.type === 'fill' && (/water/.test(id) || id === 'print-state-detail-lakes')) {
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
      if (layer.type === 'line' && (/^waterway|water/.test(id) || id === 'print-state-detail-rivers')) {
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

/** Apply the selected regional edition and detail level to real map layers. */
export function applyRegionMapLayers(
  map: maplibregl.Map,
  design: RegionDesign,
  detail: PrintDetailSettings,
  detailBias: DetailBias,
  kind: 'country' | 'state' | 'city',
  slug?: string,
): void {
  if (kind === 'state' && slug) updateStateAtlas(map, slug, design);
  const style = map.getStyle();
  if (!style) return;
  const showTerrain = design.theme === 'topographic' || design.theme === 'detailed';
  const showDetailedRoads = (design.theme === 'atlas' || design.theme === 'detailed') && detailBias === 1;
  const showDetailedRivers = showTerrain;

  style.layers.forEach((layer) => {
    const group = classifyLayer(layer.id);
    const isDetailedLake = layer.id === 'print-state-detail-lakes';
    const isDetailedRiver = layer.id === 'print-state-detail-rivers';
    const isDetailedRoad = layer.id === 'print-state-detail-roads';
    const isDetailedCounty = layer.id === 'print-state-detail-county-boundaries';
    try {
      if (layer.id === STATE_ATLAS_LABELS) {
        map.setLayoutProperty(layer.id, 'visibility', design.theme === 'detailed' && detail.labels.cities ? 'visible' : 'none');

      } else if (kind === 'state' && (group === 'cities' || group === 'towns')) {
        const visible = design.theme === 'atlas' && (group === 'cities' ? detail.labels.cities : detail.labels.towns);
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
      } else if (kind === 'state' && group === 'allroads') {
        // The boundary-filtered detail source is the single controlled local
        // road pass for states. Keeping Liberty's local-road layers as well
        // doubled the network into an unreadable gray mesh at More detail.
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (isDetailedRoad) {
        // The base style supplies highways and main roads. The shared
        // high-resolution pass adds secondary routes only at More detail.
        map.setLayoutProperty(layer.id, 'visibility', showDetailedRoads ? 'visible' : 'none');
      } else if (isDetailedCounty) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (isDetailedLake) {
        map.setLayoutProperty(layer.id, 'visibility', 'visible');
        if (detailBias === -1) {
          map.setFilter(layer.id, ['all',
            ['==', ['get', 'kind'], 'lake'],
            ['==', ['get', 'class'], 'major'],
          ]);
          map.setPaintProperty(layer.id, 'fill-opacity', 0.82);
        } else {
          map.setFilter(layer.id, ['==', ['get', 'kind'], 'lake']);
          map.setPaintProperty(layer.id, 'fill-opacity', detailBias === 1
            ? 0.95
            : ['match', ['get', 'class'], 'major', 0.88, 'medium', 0.64, 0.34]);
        }
      } else if (group === 'water') {
        map.setLayoutProperty(layer.id, 'visibility', 'visible');
      } else if (isDetailedRiver) {
        map.setLayoutProperty(layer.id, 'visibility', showDetailedRivers ? 'visible' : 'none');
        if (showDetailedRivers) {
          const riverClasses = detailBias === -1 ? ['river'] : ['river', 'canal'];
          map.setFilter(layer.id, detailBias === 1
            ? ['==', ['get', 'kind'], 'river']
            : ['all',
              ['==', ['get', 'kind'], 'river'],
              ['match', ['get', 'class'], riverClasses, true, false],
            ]);
          map.setPaintProperty(layer.id, 'line-opacity', detailBias === 1 ? 0.42 : 0.62);
        }
      } else if (group === 'rivers') {
        // State river density comes from the ranked, boundary-filtered source
        // above. Hiding the uncontrolled base waterways makes Clean/Detailed/
        // More distinct and prevents two copies of the same river network.
        map.setLayoutProperty(layer.id, 'visibility', kind === 'state' ? 'none' : detail.rivers ? 'visible' : 'none');
      } else if (layer.id === 'hillshade-layer') {
        map.setLayoutProperty(layer.id, 'visibility', showTerrain ? 'visible' : 'none');
        if (showTerrain) {
          map.setPaintProperty(layer.id, 'hillshade-exaggeration', design.theme === 'detailed' ? 0.35 : hillshadeExaggeration(detailBias) * (['florida', 'illinois', 'indiana', 'iowa', 'kansas', 'louisiana', 'minnesota', 'mississippi', 'nebraska', 'north-dakota', 'ohio', 'south-dakota', 'wisconsin'].includes(slug || '') ? 0.6 : 1));
        }
      }
    } catch {}
  });
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
  try {
    addTerrain(map);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.warn('Terrain layer could not be initialized.', error);
  }
  applyGreyscale(map);
  applyStyleOverrides(map);
  applyPrintDetail(map, kind, detail, scale, weight);
  applyPrintColors(map, colors, scale);
  if (kind === 'state') addStateAtlasLabels(map, colors, scale);
}

/** Sets the isolation mask to paper, clipping neighboring geography quietly. */
export function applyPrintMaskColor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  try { map.setPaintProperty('mask-layer', 'fill-color', colors.land || '#ffffff'); } catch {}
}

/** Draw a deliberate state/country edge without turning the sheet into a slab. */
export function applyPrintRegionOutline(
  map: maplibregl.Map,
  geometry: GeoJSON.Geometry,
  colors: PreviewColorSettings,
  scale: StrokeScale = UNSCALED,
): void {
  try {
    const source = map.getSource('selection-outline') as maplibregl.GeoJSONSource;
    source?.setData({ type: 'Feature', properties: {}, geometry });
    map.setLayoutProperty('selection-outline-layer', 'visibility', 'visible');
    map.setPaintProperty('selection-outline-layer', 'line-color', colors.roads || getPrintInkColor(colors));
    map.setPaintProperty('selection-outline-layer', 'line-opacity', 0.82);
    map.setPaintProperty('selection-outline-layer', 'line-width', scaledValue(1.5, scale));
    map.moveLayer('selection-outline-layer');
  } catch {}
}
