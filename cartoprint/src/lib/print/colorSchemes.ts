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
  water: '#ffffff',
  roads: '#8a8a84',
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
    desc: 'Deep navy streets and water',
    colors: { land: WHITE_LAND, water: '#07122a', roads: '#07122a' },
  },
  {
    value: 'charcoal',
    label: 'Charcoal',
    desc: 'Soft black streets and water',
    colors: { land: WHITE_LAND, water: '#252525', roads: '#252525' },
  },
  {
    value: 'slate',
    label: 'Slate',
    desc: 'Cool grey-blue streets and water',
    colors: { land: WHITE_LAND, water: '#54616f', roads: '#54616f' },
  },
  {
    value: 'forest',
    label: 'Forest',
    desc: 'Deep green streets and water',
    colors: { land: WHITE_LAND, water: '#1f3d34', roads: '#1f3d34' },
  },
  {
    value: 'sepia',
    label: 'Brown Paper',
    desc: 'Off-white land, brown water, warm streets',
    colors: { land: '#fbf7ef', water: '#6f4a2b', roads: '#9a6a3a' },
  },
  {
    value: 'map-default',
    label: 'Map Default',
    desc: 'Greyscale base style',
    colors: MAP_DEFAULT_COLORS,
  },
];

export const DEFAULT_COLOR_SCHEME = COLOR_SCHEMES[0];

export function sameColorSettings(a: PreviewColorSettings, b: PreviewColorSettings): boolean {
  return (
    Boolean(a.useMapDefault) === Boolean(b.useMapDefault) &&
    a.land === b.land &&
    a.water === b.water &&
    a.roads === b.roads
  );
}

// Hides every text/icon symbol layer — call before applying colors for clean prints
export function hidePrintLabels(map: maplibregl.Map): void {
  const style = map.getStyle();
  if (!style) return;
  style.layers.forEach((layer) => {
    if (layer.type === 'symbol') {
      try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch {}
    }
  });
}

export function applyPreviewColorSettings(map: maplibregl.Map, colors: PreviewColorSettings): void {
  // Greyscale everything first so no colored bleed-through (parks, forests, etc.)
  applyGreyscale(map);

  if (colors.useMapDefault) return;

  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', colors.land);
        return;
      }
      // Water fills → water ink color
      if (layer.type === 'fill' && /water/.test(id)) {
        map.setPaintProperty(id, 'fill-color', colors.water);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }
      // All other fills (land, parks, buildings, etc.) → land color
      if (layer.type === 'fill') {
        map.setPaintProperty(id, 'fill-color', colors.land);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }
      // Waterways → water ink color
      if (layer.type === 'line' && /water/.test(id)) {
        map.setPaintProperty(id, 'line-color', colors.water);
        return;
      }
      // Admin/boundary borders — leave them to applyStyleOverrides (dark color)
      if (layer.type === 'line' && /admin|boundary/.test(id)) return;
      // All other lines (roads, paths, etc.) → road ink color
      if (layer.type === 'line') {
        map.setPaintProperty(id, 'line-color', colors.roads);
        map.setPaintProperty(id, 'line-opacity', 0.88);
      }
    } catch {
      // ignore individual layer failures
    }
  });
}

export function getPreviewWaterColor(colors: PreviewColorSettings): string {
  return colors.water || '#ffffff';
}
