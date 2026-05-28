import type { MapSelection, MapViewState } from '@/types/map';

export type CatalogPrintKind = 'country' | 'state' | 'city';

export interface CatalogPrint {
  slug: string;
  name: string;
  kind: CatalogPrintKind;
  bbox: [string, string, string, string];
  center: [number, number];
  defaultZoom: number;
  establishedYear?: string;
  defaultTitle: string;
  defaultSubtitle: string;
  searchQuery: string;
}

interface CatalogPrintInput {
  slug: string;
  name: string;
  kind: CatalogPrintKind;
  bbox: [number, number, number, number];
  defaultZoom: number;
  establishedYear?: string;
  defaultSubtitle?: string;
  searchQuery?: string;
}

function stringifyBbox(bbox: [number, number, number, number]): [string, string, string, string] {
  return bbox.map((value) => value.toString()) as [string, string, string, string];
}

function getBboxCenter(bbox: [number, number, number, number]): [number, number] {
  const [south, north, west, east] = bbox;
  return [(west + east) / 2, (south + north) / 2];
}

function createCatalogPrint(input: CatalogPrintInput): CatalogPrint {
  return {
    ...input,
    bbox: stringifyBbox(input.bbox),
    center: getBboxCenter(input.bbox),
    defaultTitle: input.name,
    defaultSubtitle: input.defaultSubtitle || (input.kind === 'state' ? 'United States' : ''),
    searchQuery: input.searchQuery || `${input.name}, United States`,
  };
}

export function catalogPrintToSelection(print: CatalogPrint, geojson: GeoJSON.Geometry | null = null): MapSelection {
  return {
    name: print.name,
    type: print.kind,
    fullName: print.defaultSubtitle ? `${print.name}, ${print.defaultSubtitle}` : print.name,
    bbox: print.bbox,
    geojson,
  };
}

export function catalogPrintToView(print: CatalogPrint): MapViewState {
  return {
    center: print.center,
    zoom: print.defaultZoom,
  };
}

const UNITED_STATES = createCatalogPrint({
  slug: 'united-states',
  name: 'United States',
  kind: 'country',
  bbox: [24.396, 49.384, -124.849, -66.885],
  defaultZoom: 4,
  establishedYear: '1776',
  searchQuery: 'United States of America',
});

const STATE_PRINTS = [
  createCatalogPrint({ slug: 'alabama', name: 'Alabama', kind: 'state', bbox: [30.144, 35.008, -88.473, -84.889], defaultZoom: 6, establishedYear: '1819' }),
  createCatalogPrint({ slug: 'alaska', name: 'Alaska', kind: 'state', bbox: [51.214, 71.365, -179.148, -129.979], defaultZoom: 4, establishedYear: '1959' }),
  createCatalogPrint({ slug: 'arizona', name: 'Arizona', kind: 'state', bbox: [31.332, 37.004, -114.816, -109.045], defaultZoom: 6, establishedYear: '1912' }),
  createCatalogPrint({ slug: 'arkansas', name: 'Arkansas', kind: 'state', bbox: [33.004, 36.499, -94.618, -89.644], defaultZoom: 6, establishedYear: '1836' }),
  createCatalogPrint({ slug: 'california', name: 'California', kind: 'state', bbox: [32.534, 42.009, -124.409, -114.131], defaultZoom: 5.2, establishedYear: '1850' }),
  createCatalogPrint({ slug: 'colorado', name: 'Colorado', kind: 'state', bbox: [36.993, 41.003, -109.06, -102.042], defaultZoom: 6, establishedYear: '1876' }),
  createCatalogPrint({ slug: 'connecticut', name: 'Connecticut', kind: 'state', bbox: [40.986, 42.05, -73.727, -71.786], defaultZoom: 7.2, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'delaware', name: 'Delaware', kind: 'state', bbox: [38.451, 39.839, -75.789, -75.049], defaultZoom: 7.3, establishedYear: '1787' }),
  createCatalogPrint({ slug: 'florida', name: 'Florida', kind: 'state', bbox: [24.396, 31.001, -87.634, -80.031], defaultZoom: 5.5, establishedYear: '1845' }),
  createCatalogPrint({ slug: 'georgia', name: 'Georgia', kind: 'state', bbox: [30.356, 35, -85.605, -80.84], defaultZoom: 6, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'hawaii', name: 'Hawaii', kind: 'state', bbox: [18.91, 22.24, -160.25, -154.81], defaultZoom: 6.2, establishedYear: '1959' }),
  createCatalogPrint({ slug: 'idaho', name: 'Idaho', kind: 'state', bbox: [42, 49.001, -117.243, -111.044], defaultZoom: 5.6, establishedYear: '1890' }),
  createCatalogPrint({ slug: 'illinois', name: 'Illinois', kind: 'state', bbox: [36.97, 42.508, -91.513, -87.495], defaultZoom: 5.8, establishedYear: '1818' }),
  createCatalogPrint({ slug: 'indiana', name: 'Indiana', kind: 'state', bbox: [37.771, 41.761, -88.098, -84.784], defaultZoom: 6.2, establishedYear: '1816' }),
  createCatalogPrint({ slug: 'iowa', name: 'Iowa', kind: 'state', bbox: [40.375, 43.501, -96.64, -90.14], defaultZoom: 6.2, establishedYear: '1846' }),
  createCatalogPrint({ slug: 'kansas', name: 'Kansas', kind: 'state', bbox: [36.993, 40.004, -102.052, -94.589], defaultZoom: 6, establishedYear: '1861' }),
  createCatalogPrint({ slug: 'kentucky', name: 'Kentucky', kind: 'state', bbox: [36.497, 39.147, -89.571, -81.965], defaultZoom: 6, establishedYear: '1792' }),
  createCatalogPrint({ slug: 'louisiana', name: 'Louisiana', kind: 'state', bbox: [28.928, 33.019, -94.043, -88.817], defaultZoom: 6.1, establishedYear: '1812' }),
  createCatalogPrint({ slug: 'maine', name: 'Maine', kind: 'state', bbox: [42.977, 47.459, -71.083, -66.949], defaultZoom: 5.9, establishedYear: '1820' }),
  createCatalogPrint({ slug: 'maryland', name: 'Maryland', kind: 'state', bbox: [37.886, 39.723, -79.487, -75.039], defaultZoom: 6.6, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'massachusetts', name: 'Massachusetts', kind: 'state', bbox: [41.237, 42.886, -73.508, -69.928], defaultZoom: 6.8, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'michigan', name: 'Michigan', kind: 'state', bbox: [41.696, 48.306, -90.418, -82.413], defaultZoom: 5.4, establishedYear: '1837' }),
  createCatalogPrint({ slug: 'minnesota', name: 'Minnesota', kind: 'state', bbox: [43.5, 49.384, -97.239, -89.491], defaultZoom: 5.5, establishedYear: '1858' }),
  createCatalogPrint({ slug: 'mississippi', name: 'Mississippi', kind: 'state', bbox: [30.174, 35, -91.655, -88.098], defaultZoom: 6, establishedYear: '1817' }),
  createCatalogPrint({ slug: 'missouri', name: 'Missouri', kind: 'state', bbox: [35.996, 40.613, -95.774, -89.099], defaultZoom: 5.9, establishedYear: '1821' }),
  createCatalogPrint({ slug: 'montana', name: 'Montana', kind: 'state', bbox: [44.358, 49.001, -116.05, -104.039], defaultZoom: 5.5, establishedYear: '1889' }),
  createCatalogPrint({ slug: 'nebraska', name: 'Nebraska', kind: 'state', bbox: [39.999, 43.001, -104.053, -95.308], defaultZoom: 5.9, establishedYear: '1867' }),
  createCatalogPrint({ slug: 'nevada', name: 'Nevada', kind: 'state', bbox: [35.001, 42.002, -120.006, -114.039], defaultZoom: 5.7, establishedYear: '1864' }),
  createCatalogPrint({ slug: 'new-hampshire', name: 'New Hampshire', kind: 'state', bbox: [42.697, 45.305, -72.558, -70.61], defaultZoom: 6.5, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'new-jersey', name: 'New Jersey', kind: 'state', bbox: [38.928, 41.357, -75.56, -73.894], defaultZoom: 6.7, establishedYear: '1787' }),
  createCatalogPrint({ slug: 'new-mexico', name: 'New Mexico', kind: 'state', bbox: [31.332, 37, -109.05, -103.002], defaultZoom: 6, establishedYear: '1912' }),
  createCatalogPrint({ slug: 'new-york', name: 'New York', kind: 'state', bbox: [40.477, 45.016, -79.762, -71.856], defaultZoom: 5.8, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'north-carolina', name: 'North Carolina', kind: 'state', bbox: [33.752, 36.588, -84.322, -75.461], defaultZoom: 6, establishedYear: '1789' }),
  createCatalogPrint({ slug: 'north-dakota', name: 'North Dakota', kind: 'state', bbox: [45.936, 49, -104.049, -96.554], defaultZoom: 5.9, establishedYear: '1889' }),
  createCatalogPrint({ slug: 'ohio', name: 'Ohio', kind: 'state', bbox: [38.403, 41.978, -84.82, -80.519], defaultZoom: 6.2, establishedYear: '1803' }),
  createCatalogPrint({ slug: 'oklahoma', name: 'Oklahoma', kind: 'state', bbox: [33.616, 37.002, -103.002, -94.431], defaultZoom: 5.9, establishedYear: '1907' }),
  createCatalogPrint({ slug: 'oregon', name: 'Oregon', kind: 'state', bbox: [41.992, 46.299, -124.566, -116.463], defaultZoom: 5.7, establishedYear: '1859' }),
  createCatalogPrint({ slug: 'pennsylvania', name: 'Pennsylvania', kind: 'state', bbox: [39.719, 42.269, -80.519, -74.69], defaultZoom: 6.1, establishedYear: '1787' }),
  createCatalogPrint({ slug: 'rhode-island', name: 'Rhode Island', kind: 'state', bbox: [41.146, 42.019, -71.862, -71.12], defaultZoom: 8, establishedYear: '1790' }),
  createCatalogPrint({ slug: 'south-carolina', name: 'South Carolina', kind: 'state', bbox: [32.034, 35.216, -83.354, -78.542], defaultZoom: 6.2, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'south-dakota', name: 'South Dakota', kind: 'state', bbox: [42.479, 45.945, -104.057, -96.436], defaultZoom: 5.9, establishedYear: '1889' }),
  createCatalogPrint({ slug: 'tennessee', name: 'Tennessee', kind: 'state', bbox: [34.982, 36.678, -90.31, -81.646], defaultZoom: 6, establishedYear: '1796' }),
  createCatalogPrint({ slug: 'texas', name: 'Texas', kind: 'state', bbox: [25.837, 36.5, -106.646, -93.508], defaultZoom: 5.1, establishedYear: '1845' }),
  createCatalogPrint({ slug: 'utah', name: 'Utah', kind: 'state', bbox: [36.998, 42.002, -114.052, -109.041], defaultZoom: 6, establishedYear: '1896' }),
  createCatalogPrint({ slug: 'vermont', name: 'Vermont', kind: 'state', bbox: [42.727, 45.016, -73.437, -71.465], defaultZoom: 6.6, establishedYear: '1791' }),
  createCatalogPrint({ slug: 'virginia', name: 'Virginia', kind: 'state', bbox: [36.541, 39.466, -83.675, -75.242], defaultZoom: 6, establishedYear: '1788' }),
  createCatalogPrint({ slug: 'washington', name: 'Washington', kind: 'state', bbox: [45.543, 49.002, -124.848, -116.916], defaultZoom: 5.7, establishedYear: '1889' }),
  createCatalogPrint({ slug: 'west-virginia', name: 'West Virginia', kind: 'state', bbox: [37.201, 40.638, -82.644, -77.719], defaultZoom: 6.2, establishedYear: '1863' }),
  createCatalogPrint({ slug: 'wisconsin', name: 'Wisconsin', kind: 'state', bbox: [42.491, 47.08, -92.889, -86.805], defaultZoom: 5.9, establishedYear: '1848' }),
  createCatalogPrint({ slug: 'wyoming', name: 'Wyoming', kind: 'state', bbox: [40.994, 45.006, -111.056, -104.052], defaultZoom: 5.9, establishedYear: '1890' }),
  createCatalogPrint({
    slug: 'district-of-columbia',
    name: 'District of Columbia',
    kind: 'state',
    bbox: [38.791, 38.996, -77.119, -76.91],
    defaultZoom: 10.5,
    establishedYear: '1790',
    defaultSubtitle: 'United States',
    searchQuery: 'District of Columbia, United States',
  }),
];

export const CATALOG_PRINTS: CatalogPrint[] = [UNITED_STATES, ...STATE_PRINTS];

export function getAllCatalogPrints(): CatalogPrint[] {
  return CATALOG_PRINTS;
}

export function getFeaturedCatalogPrint(): CatalogPrint {
  return UNITED_STATES;
}

export function getStateCatalogPrints(): CatalogPrint[] {
  return STATE_PRINTS;
}

export function getCatalogPrint(slug: string | null | undefined): CatalogPrint | null {
  if (!slug) return null;
  return CATALOG_PRINTS.find((print) => print.slug === slug) || null;
}
