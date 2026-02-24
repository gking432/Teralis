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

export type LayerState = Record<LayerGroup, boolean>;

export interface MapSelection {
  name: string;
  type: string;
  fullName: string;
  geojson: GeoJSON.Geometry | null;
  bbox: [string, string, string, string] | null; // [south, north, west, east] from Nominatim
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

export interface MapConfig {
  view: MapViewState;
  layers: LayerState;
  selection: MapSelection | null;
  isIsolated: boolean;
}
