import type { GeoJSON } from 'geojson';

/** Toggle groups that map to sets of MapLibre layer IDs */
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
  | 'water'
  | 'terrain'
  | 'landcover';

/** Current on/off state for each layer group */
export type LayerState = Record<LayerGroup, boolean>;

/** A selected geographic region */
export interface MapSelection {
  name: string;
  type: string;
  fullName: string;
  geojson: GeoJSON.Geometry | null;
  bbox: [number, number, number, number] | null; // [south, north, west, east]
}

/** Map view state */
export interface MapViewState {
  center: [number, number]; // [lng, lat]
  zoom: number;
}

/** Pre-built template configuration */
export interface MapTemplate {
  id: string;
  name: string;
  icon: string;
  layers: LayerState;
  view?: MapViewState;
}

/** Complete map configuration (for saving/loading/exporting) */
export interface MapConfig {
  view: MapViewState;
  layers: LayerState;
  selection: MapSelection | null;
  isIsolated: boolean;
}
