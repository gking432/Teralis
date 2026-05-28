import type maplibregl from 'maplibre-gl';

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

export function applyPreviewColorSettings(map: maplibregl.Map, colors: PreviewColorSettings): void {
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

      if (layer.type === 'fill' && /water|lake|ocean|river/.test(id)) {
        map.setPaintProperty(id, 'fill-color', colors.water);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }

      if (layer.type === 'line' && /^waterway|river|stream|canal/.test(id)) {
        map.setPaintProperty(id, 'line-color', colors.water);
        return;
      }

      if (layer.type === 'fill' && /land|park|wood|grass|sand|aeroway|building/.test(id)) {
        map.setPaintProperty(id, 'fill-color', colors.land);
        return;
      }

      if (layer.type === 'line' && /road|bridge|tunnel|highway|street|path|track/.test(id)) {
        map.setPaintProperty(id, 'line-color', colors.roads);
        map.setPaintProperty(id, 'line-opacity', 0.92);
      }
    } catch {
      // ignore individual layer failures
    }
  });
}

export function getPreviewWaterColor(colors: PreviewColorSettings): string {
  return colors.water || '#ffffff';
}
