import type { LayerState, MapTemplate } from '@/types/map';

/** Default layer state (what users see on first load) */
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
  water: true,
  terrain: false,
  landcover: false,
};

/** Pre-built templates */
export const TEMPLATES: MapTemplate[] = [
  {
    id: 'usa-classic',
    name: 'United States — Classic',
    icon: '◻',
    layers: {
      ...DEFAULT_LAYERS,
      highways: true,
    },
  },
  {
    id: 'usa-topo',
    name: 'United States — Topographic',
    icon: '▲',
    layers: {
      ...DEFAULT_LAYERS,
      terrain: true,
      landcover: true,
    },
  },
  {
    id: 'usa-water',
    name: 'United States — Waterways',
    icon: '~',
    layers: {
      ...DEFAULT_LAYERS,
      capitals: false,
      cities: false,
      countrylabels: false,
    },
  },
  {
    id: 'usa-roads',
    name: 'United States — Highway Network',
    icon: '═',
    layers: {
      ...DEFAULT_LAYERS,
      statelabels: false,
      countrylabels: false,
      water: false,
      highways: true,
      mainroads: true,
    },
  },
];

// TODO: Add per-state templates
// Each state template would zoom to the state and enable a curated set of layers.
// Example:
// {
//   id: 'wisconsin',
//   name: 'Wisconsin',
//   icon: '◻',
//   layers: { ...DEFAULT_LAYERS, counties: true, highways: true },
//   view: { center: [-89.5, 44.5], zoom: 7 },
// }
