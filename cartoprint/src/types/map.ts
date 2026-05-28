export type LayerGroup =
  | 'countries'
  | 'states'
  | 'counties'
  | 'capitals'
  | 'cities'
  | 'towns'
  | 'statelabels'
  | 'countrylabels'
  | 'highways'
  | 'mainroads'
  | 'allroads'
  | 'roadlabels'
  | 'water'
  | 'rivers'
  | 'riverlabels'
  | 'waterlabels'
  | 'terrain'
  | 'landcover';

export type LayerState = Record<LayerGroup, boolean>;

export type ScaleBand = 'national' | 'regional' | 'metro' | 'local';
export type MapPreset = 'classic' | 'roads' | 'nature' | 'minimal' | 'detailed-local';
export type LabelDensity = 'none' | 'major' | 'more' | 'dense';
export type RoadDensity = 'none' | 'highways' | 'major' | 'streets';
export type NatureDensity = 'none' | 'water' | 'terrain';
export type BorderDensity = 'none' | 'state' | 'county';
export type FocusMode = 'none' | 'outline' | 'fade' | 'crop';
export type FeatureSetting = 'auto' | 'on' | 'off';
export type DetailMode = 'guided' | 'custom';
export type SelectionTarget = 'country' | 'state' | 'county' | 'city';

export interface MapSelection {
  name: string;
  type: string;
  fullName: string;
  geojson: GeoJSON.Geometry | null;
  bbox: [string, string, string, string] | null; // [south, north, west, east] from Nominatim
  viewport?: {
    width: number;
    height: number;
  };
}

export interface MapViewState {
  center: [number, number]; // [lng, lat]
  zoom: number;
}

export interface MapTemplate {
  id: string;
  name: string;
  icon: string;
  layers: LayerState;
  view?: MapViewState;
}

export interface BuilderState {
  preset: MapPreset;
  scaleBand: ScaleBand;
  detailMode: DetailMode;
  selectionTarget: SelectionTarget;
  labels: LabelDensity;
  roads: RoadDensity;
  nature: NatureDensity;
  borders: BorderDensity;
  focusMode: FocusMode;
  advancedOpen: boolean;
  advancedOverrides: Partial<Record<LayerGroup, FeatureSetting>>;
}

export interface MapConfig {
  view: MapViewState;
  layers: LayerState;
  selection: MapSelection | null;
  focusMode: FocusMode;
  builder: BuilderState;
}
