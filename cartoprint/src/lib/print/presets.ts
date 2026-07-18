import type { CatalogPrintKind } from '@/lib/catalog/prints';
import { COLOR_SCHEMES, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import type { CompositionPresetId, PrintScene } from '@/lib/print/scene';
import type { Density, PrintDetailSettings } from '@/lib/print/printRender';

export interface CompositionPreset {
  id: CompositionPresetId;
  name: string;
  shortName: string;
  description: string;
  bestFor: string;
  palette: string;
  titleEnabled: boolean;
  titleLayout: PrintScene['title']['layout'];
  detail: (kind: CatalogPrintKind) => PrintDetailSettings;
}

const palette = (value: string): PreviewColorSettings =>
  COLOR_SCHEMES.find((scheme) => scheme.value === value)?.colors ?? COLOR_SCHEMES[0].colors;

const density = (
  places: Density,
  roads: Density,
  labels: Partial<PrintDetailSettings['labels']> = {},
  options: Partial<Pick<PrintDetailSettings, 'rivers' | 'counties' | 'states' | 'border'>> = {},
): PrintDetailSettings => ({
  places,
  roads,
  border: options.border ?? 'none',
  rivers: options.rivers ?? true,
  counties: options.counties ?? false,
  states: options.states ?? false,
  labels: {
    cities: labels.cities ?? false,
    towns: labels.towns ?? false,
    roads: labels.roads ?? false,
    water: labels.water ?? false,
    rivers: labels.rivers ?? false,
  },
});

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  {
    id: 'minimal',
    name: 'Minimal Ink',
    shortName: 'Minimal',
    description: 'Quiet geography, restrained roads, generous negative space.',
    bestFor: 'A calm, modern wall piece',
    palette: 'midnight',
    titleEnabled: false,
    titleLayout: 'compact-bottom',
    detail: (kind) => density(kind === 'city' ? 'none' : 'less', 'less', {}, { border: kind === 'city' ? 'thin' : 'none' }),
  },
  {
    id: 'street-grid',
    name: 'Street Grid',
    shortName: 'Street Grid',
    description: 'Dense urban texture with delicate local streets.',
    bestFor: 'Cities and neighborhoods',
    palette: 'charcoal',
    titleEnabled: false,
    titleLayout: 'minimal-corner',
    detail: (kind) => density('none', kind === 'city' ? 'more' : 'neutral', { roads: false }, { border: kind === 'city' ? 'thin' : 'none', rivers: true }),
  },
  {
    id: 'atlas',
    name: 'Modern Atlas',
    shortName: 'Atlas',
    description: 'Balanced roads, important places, and geographic context.',
    bestFor: 'Countries, states, and regions',
    palette: 'slate',
    titleEnabled: true,
    titleLayout: 'compact-bottom',
    detail: (kind) => density(kind === 'city' ? 'none' : 'neutral', kind === 'country' ? 'less' : 'neutral', { cities: kind !== 'city' }, { states: kind === 'country', border: kind === 'city' ? 'thin' : 'none' }),
  },
  {
    id: 'local-detail',
    name: 'Local Detail',
    shortName: 'Local',
    description: 'A richer neighborhood study with streets and waterways.',
    bestFor: 'Hometowns and familiar districts',
    palette: 'forest',
    titleEnabled: false,
    titleLayout: 'minimal-corner',
    detail: (kind) => density(kind === 'city' ? 'none' : 'neutral', kind === 'city' ? 'more' : 'neutral', { cities: kind !== 'city', water: true }, { border: kind === 'city' ? 'thin' : 'none', rivers: true }),
  },
  {
    id: 'gazetteer',
    name: 'State Gazetteer',
    shortName: 'Gazetteer',
    description: 'Maximum printable towns with strict label spacing.',
    bestFor: 'Large state and regional prints',
    palette: 'sepia',
    titleEnabled: true,
    titleLayout: 'classic-bottom',
    detail: (kind) => density(kind === 'city' ? 'none' : 'more', kind === 'country' ? 'less' : 'neutral', { cities: kind !== 'city', towns: kind !== 'city' }, { counties: kind === 'state', states: kind === 'country', border: kind === 'city' ? 'thin' : 'none' }),
  },
  {
    id: 'waterways',
    name: 'Waterways',
    shortName: 'Waterways',
    description: 'Lakes and rivers lead; roads become supporting texture.',
    bestFor: 'Coasts, lake country, and river cities',
    palette: 'midnight',
    titleEnabled: true,
    titleLayout: 'minimal-corner',
    detail: (kind) => density(kind === 'city' ? 'none' : 'less', kind === 'city' ? 'neutral' : 'less', { cities: kind !== 'city', water: true, rivers: true }, { rivers: true, border: kind === 'city' ? 'thin' : 'none' }),
  },
];

export function getCompositionPreset(id: CompositionPresetId | string | null | undefined): CompositionPreset {
  return COMPOSITION_PRESETS.find((preset) => preset.id === id) ?? COMPOSITION_PRESETS[0];
}

export function applyCompositionPreset(scene: PrintScene, presetId: CompositionPresetId): PrintScene {
  const preset = getCompositionPreset(presetId);
  const colors = palette(preset.palette);
  return {
    ...scene,
    composition: preset.id,
    colors: { ...colors },
    detail: preset.detail(scene.place.kind),
    title: {
      ...scene.title,
      enabled: preset.titleEnabled,
      layout: preset.titleLayout,
      style: 'standard',
    },
    updatedAt: Date.now(),
  };
}

export const DETAIL_LEVELS: { value: Density; label: string; description: string }[] = [
  { value: 'none', label: 'Quiet', description: 'Water and land only' },
  { value: 'less', label: 'Essential', description: 'Major geography' },
  { value: 'neutral', label: 'Detailed', description: 'Balanced local context' },
  { value: 'more', label: 'Complete', description: 'Maximum printable detail' },
];
