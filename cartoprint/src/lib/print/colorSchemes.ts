import type maplibregl from 'maplibre-gl';
import { applyGreyscale } from '@/lib/map/style';

export interface PreviewColorSettings {
  land: string;
  water: string;
  roads: string;
  useMapDefault?: boolean;
}

const WHITE_LAND = '#ffffff';

export const MAP_DEFAULT_COLORS: PreviewColorSettings = {
  land: '#fafaf8',
  water: '#4a4a48',
  roads: '#4a4a48',
  useMapDefault: true,
};

export interface ColorScheme {
  value: string;
  label: string;
  desc: string;
  colors: PreviewColorSettings;
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    value: 'midnight',
    label: 'Midnight',
    desc: 'Deep navy on white',
    colors: { land: WHITE_LAND, water: '#07122a', roads: '#07122a' },
  },
  {
    value: 'charcoal',
    label: 'Charcoal',
    desc: 'Soft black on white',
    colors: { land: WHITE_LAND, water: '#252525', roads: '#252525' },
  },
  {
    value: 'slate',
    label: 'Slate',
    desc: 'Cool grey-blue on white',
    colors: { land: WHITE_LAND, water: '#54616f', roads: '#54616f' },
  },
  {
    value: 'forest',
    label: 'Forest',
    desc: 'Deep green on white',
    colors: { land: WHITE_LAND, water: '#1f3d34', roads: '#1f3d34' },
  },
  {
    value: 'sepia',
    label: 'Brown Paper',
    desc: 'Warm paper with brown water',
    colors: { land: '#fbf7ef', water: '#6f4a2b', roads: '#9a6a3a' },
  },
  {
    value: 'map-default',
    label: 'Map Default',
    desc: 'Greyscale',
    colors: MAP_DEFAULT_COLORS,
  },
];

export const DEFAULT_COLOR_SCHEME = COLOR_SCHEMES[0];

export function getPrintInkColor(colors: PreviewColorSettings): string {
  if (colors.useMapDefault) return '#4a4a48';
  return colors.water || colors.roads || '#07122a';
}

export function sameColorSettings(a: PreviewColorSettings, b: PreviewColorSettings): boolean {
  return (
    Boolean(a.useMapDefault) === Boolean(b.useMapDefault) &&
    a.land === b.land &&
    a.water === b.water &&
    a.roads === b.roads
  );
}

// Hides every text/icon symbol layer for clean prints
export function hidePrintLabels(map: maplibregl.Map): void {
  const style = map.getStyle();
  if (!style) return;
  style.layers.forEach((layer) => {
    if (layer.type === 'symbol') {
      try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch {}
    }
  });
}

// Sets the isolation mask fill (the area outside the selected region)
export function applyMaskColor(map: maplibregl.Map, colors: PreviewColorSettings): void {
  const ink = getPrintInkColor(colors);
  try { map.setPaintProperty('mask-layer', 'fill-color', ink); } catch {}
}

// Applies a clean print color scheme:
// - background + exterior = ink color
// - land fills = land color (white)
// - water fills + waterway lines = ink color
// - ALL roads, admin borders, and other lines = HIDDEN
export function applyPreviewColorSettings(map: maplibregl.Map, colors: PreviewColorSettings): void {
  // Greyscale first — neutralizes any colored parks/forests/landuse
  applyGreyscale(map);

  const ink = getPrintInkColor(colors);
  const land = colors.land || '#ffffff';

  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;
    try {
      // Background = ink (so the exterior of the state blends with the mask)
      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', ink);
        return;
      }
      // Water areas (lakes, ocean) = ink
      if (layer.type === 'fill' && /water/.test(id)) {
        map.setPaintProperty(id, 'fill-color', ink);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }
      // All other fills (land, parks, buildings) = land/white
      if (layer.type === 'fill') {
        map.setPaintProperty(id, 'fill-color', land);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }
      // Waterway lines (rivers, streams) = ink, keep visible
      if (layer.type === 'line' && /water/.test(id)) {
        map.setPaintProperty(id, 'line-color', ink);
        map.setLayoutProperty(id, 'visibility', 'visible');
        return;
      }
      // HIDE everything else — roads, highways, admin borders, etc.
      if (layer.type === 'line') {
        map.setLayoutProperty(id, 'visibility', 'none');
        return;
      }
    } catch {}
  });
}

export function getPreviewWaterColor(colors: PreviewColorSettings): string {
  return colors.water || '#ffffff';
}
