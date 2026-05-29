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

export function getPreviewWaterColor(colors: PreviewColorSettings): string {
  return colors.water || '#ffffff';
}
