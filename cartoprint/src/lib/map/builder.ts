import type {
  BorderDensity,
  BuilderState,
  FeatureSetting,
  LabelDensity,
  LayerGroup,
  LayerState,
  MapPreset,
  MapSelection,
  NatureDensity,
  RoadDensity,
  ScaleBand,
  SelectionTarget,
} from '@/types/map';

export const DEFAULT_LAYERS: LayerState = {
  countries: true,
  states: true,
  counties: false,
  capitals: true,
  cities: true,
  towns: false,
  statelabels: true,
  countrylabels: true,
  highways: false,
  mainroads: false,
  allroads: false,
  roadlabels: true,
  water: true,
  rivers: true,
  riverlabels: true,
  waterlabels: true,
  terrain: false,
  landcover: false,
};

export const PRESET_OPTIONS: Array<{
  id: MapPreset;
  name: string;
  description: string;
}> = [
  { id: 'classic', name: 'Classic', description: 'Balanced borders, labels, and water.' },
  { id: 'roads', name: 'Roads', description: 'Transportation-forward with stronger road detail.' },
  { id: 'nature', name: 'Nature', description: 'Water, parks, and terrain take priority.' },
  { id: 'minimal', name: 'Minimal', description: 'Decor-first with light labels and whitespace.' },
  {
    id: 'detailed-local',
    name: 'Detailed Local',
    description: 'Best starting point for town and city prints.',
  },
];

export const SCALE_BAND_LABELS: Record<ScaleBand, string> = {
  national: 'National',
  regional: 'State / Regional',
  metro: 'County / Metro',
  local: 'Local',
};

export const DETAIL_LABELS = {
  labels: {
    none: 'None',
    major: 'Major Cities',
    more: 'Cities + Towns',
    dense: 'All Towns',
  } satisfies Record<LabelDensity, string>,
  roads: {
    none: 'No Roads',
    highways: 'Highways',
    major: 'Major Roads',
    streets: 'Streets',
  } satisfies Record<RoadDensity, string>,
  nature: {
    none: 'Lakes Only',
    water: 'Lakes + Rivers',
    terrain: 'Rivers + Terrain',
  } satisfies Record<NatureDensity, string>,
  borders: {
    none: 'None',
    state: 'State Borders',
    county: 'County Borders',
  } satisfies Record<BorderDensity, string>,
};

export function getScaleBand(zoom: number): ScaleBand {
  if (zoom < 5.5) return 'national';
  if (zoom < 7.5) return 'regional';
  if (zoom < 10.5) return 'metro';
  return 'local';
}

export function getPresetDefaults(preset: MapPreset, scaleBand: ScaleBand): Omit<
  BuilderState,
  'scaleBand' | 'detailMode' | 'selectionTarget' | 'focusMode' | 'advancedOpen' | 'advancedOverrides'
> {
  const defaults = {
    preset,
    labels: 'major' as LabelDensity,
    roads: 'highways' as RoadDensity,
    nature: 'water' as NatureDensity,
    borders: 'state' as BorderDensity,
  };

  if (scaleBand === 'regional') {
    defaults.labels = 'more';
    defaults.roads = 'major';
  }

  if (scaleBand === 'metro') {
    defaults.labels = 'more';
    defaults.roads = 'major';
    defaults.nature = 'water';
    defaults.borders = 'county';
  }

  if (scaleBand === 'local') {
    defaults.labels = 'dense';
    defaults.roads = 'streets';
    defaults.nature = 'water';
    defaults.borders = 'none';
  }

  switch (preset) {
    case 'roads':
      defaults.roads = scaleBand === 'national' ? 'highways' : scaleBand === 'local' ? 'streets' : 'major';
      defaults.nature = 'none';
      break;
    case 'nature':
      defaults.nature = scaleBand === 'national' ? 'water' : 'terrain';
      defaults.roads = scaleBand === 'local' ? 'major' : 'none';
      break;
    case 'minimal':
      defaults.labels = scaleBand === 'local' ? 'more' : 'major';
      defaults.roads = scaleBand === 'local' ? 'major' : 'none';
      defaults.nature = 'water';
      defaults.borders = scaleBand === 'local' ? 'none' : 'state';
      break;
    case 'detailed-local':
      defaults.labels = scaleBand === 'national' ? 'major' : 'dense';
      defaults.roads = scaleBand === 'national' ? 'highways' : 'streets';
      defaults.nature = scaleBand === 'national' ? 'water' : 'terrain';
      defaults.borders = scaleBand === 'local' ? 'none' : 'county';
      break;
    default:
      break;
  }

  return defaults;
}

export function createInitialBuilderState(scaleBand: ScaleBand): BuilderState {
  const defaults = getPresetDefaults('classic', scaleBand);
  return {
    ...defaults,
    scaleBand,
    detailMode: 'guided',
    selectionTarget: 'state',
    focusMode: 'none',
    advancedOpen: false,
    advancedOverrides: {},
  };
}

function isSingleStateSelection(selection: MapSelection | null): boolean {
  if (!selection) return false;
  const type = selection.type.toLowerCase();
  return type.includes('state') || type.includes('province');
}

function applyLabelDensity(layers: LayerState, density: LabelDensity, scaleBand: ScaleBand, selection: MapSelection | null): void {
  layers.capitals = density !== 'none';
  layers.cities = density === 'major' || density === 'more' || density === 'dense';
  layers.statelabels = density !== 'none' && scaleBand !== 'local';
  layers.countrylabels = density !== 'none' && scaleBand === 'national';

  const allowDenseTowns = scaleBand === 'local' || scaleBand === 'metro' || isSingleStateSelection(selection);
  layers.towns = density === 'dense' ? allowDenseTowns : density === 'more' && scaleBand !== 'national';

  if (density === 'none') {
    layers.capitals = false;
    layers.cities = false;
    layers.towns = false;
    layers.statelabels = false;
    layers.countrylabels = false;
  }
}

function applyRoadDensity(layers: LayerState, density: RoadDensity, scaleBand: ScaleBand): void {
  layers.highways = density === 'highways' || density === 'major' || density === 'streets';
  layers.mainroads = density === 'major' || density === 'streets';
  layers.allroads = density === 'streets' && scaleBand !== 'national';
  layers.roadlabels = density === 'streets' && scaleBand === 'local';

  if (density === 'none') {
    layers.highways = false;
    layers.mainroads = false;
    layers.allroads = false;
    layers.roadlabels = false;
  }
}

function applyNatureDensity(layers: LayerState, density: NatureDensity, scaleBand: ScaleBand): void {
  layers.water = true;
  layers.rivers = density === 'water' || density === 'terrain';
  layers.riverlabels = layers.rivers;
  layers.waterlabels = true;
  layers.landcover = false;
  layers.terrain = density === 'terrain' && scaleBand !== 'national';

  if (density === 'none') {
    layers.rivers = false;
    layers.riverlabels = false;
    layers.landcover = false;
    layers.terrain = false;
  }
}

function applyBorderDensity(layers: LayerState, density: BorderDensity, scaleBand: ScaleBand): void {
  layers.states = (density === 'state' || density === 'county') && (scaleBand === 'national' || scaleBand === 'regional');
  layers.counties = density === 'county' && scaleBand !== 'national';
  layers.countries = scaleBand === 'national';

  if (density === 'none') {
    layers.states = false;
    layers.counties = false;
    layers.countries = scaleBand === 'national';
  }
}

function applyOverride(layers: LayerState, key: LayerGroup, value: FeatureSetting): void {
  if (value === 'auto') return;
  layers[key] = value === 'on';
}

export function deriveLayers(
  builder: BuilderState,
  selection: MapSelection | null
): LayerState {
  const layers = { ...DEFAULT_LAYERS };
  const { scaleBand } = builder;

  applyLabelDensity(layers, builder.labels, scaleBand, selection);
  applyRoadDensity(layers, builder.roads, scaleBand);
  applyNatureDensity(layers, builder.nature, scaleBand);
  applyBorderDensity(layers, builder.borders, scaleBand);

  for (const [key, value] of Object.entries(builder.advancedOverrides)) {
    if (!value) continue;
    applyOverride(layers, key as LayerGroup, value);
  }

  return layers;
}

export function getScaleHint(scaleBand: ScaleBand): string {
  switch (scaleBand) {
    case 'national':
      return 'Best for a clean whole-country print with capitals, major cities, and highways.';
    case 'regional':
      return 'State-level detail is opening up, including towns, optional rivers, and major roads.';
    case 'metro':
      return 'County and metro maps can show more towns, water, and stronger road detail.';
    case 'local':
      return 'Local maps can show streets, optional rivers, terrain, and dense place labels.';
  }
}

export function getControlHint(
  kind: 'labels' | 'roads' | 'nature' | 'borders',
  value: string,
  scaleBand: ScaleBand,
  selection: MapSelection | null
): string | null {
  if (kind === 'roads' && value === 'streets' && (scaleBand === 'national' || scaleBand === 'regional')) {
    return 'Zoom in to unlock street-level detail.';
  }

  if (kind === 'borders' && value === 'county' && scaleBand === 'national') {
    return 'County borders appear once you focus on a state or regional view.';
  }

  if (kind === 'labels' && value === 'dense' && scaleBand === 'national' && !isSingleStateSelection(selection)) {
    return 'Select a single state or zoom in to show all town labels.';
  }

  if (kind === 'nature' && value === 'none') {
    return 'Lake shapes stay visible; rivers are hidden.';
  }

  if (kind === 'nature' && value === 'terrain' && scaleBand === 'national') {
    return 'Terrain becomes available once the map is more regional or local.';
  }

  return null;
}

export function getReverseZoomForTarget(target: SelectionTarget): number {
  switch (target) {
    case 'country':
      return 4;
    case 'state':
      return 6;
    case 'county':
      return 10;
    case 'city':
      return 14;
  }
}

export function getSelectionPrompt(target: SelectionTarget): string {
  switch (target) {
    case 'country':
      return 'Click the map to select a country.';
    case 'state':
      return 'Click the map to select a state.';
    case 'county':
      return 'Click the map to select a county.';
    case 'city':
      return 'Click the map to select a city or town.';
  }
}
