import type { CatalogPrint, CatalogPrintKind } from '@/lib/catalog/prints';

// Nominatim returns class/type pairs like ("boundary", "administrative") plus
// "addresstype" which is more semantically useful for our purposes.
const STATE_TYPES = new Set(['state', 'province', 'region']);
const CITY_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'municipality', 'borough']);
const COUNTRY_TYPES = new Set(['country']);

export function inferKind(addresstype: string | undefined, type: string | undefined): CatalogPrintKind {
  const candidates = [addresstype, type].filter(Boolean) as string[];
  for (const c of candidates) {
    if (STATE_TYPES.has(c)) return 'state';
    if (COUNTRY_TYPES.has(c)) return 'country';
    if (CITY_TYPES.has(c)) return 'city';
  }
  return 'city';
}

/**
 * The label shown next to a search result.
 *
 * `inferKind` collapses everything to the three RENDERING modes, and it
 * defaults anything unrecognised to 'city' — so using it for the badge meant
 * a county, an island, or a park was confidently labelled "City". This keeps
 * the rendering mode separate from what we actually tell the user we found.
 */
const TYPE_LABELS: Record<string, string> = {
  country: 'Country',
  state: 'State',
  province: 'Province',
  region: 'Region',
  county: 'County',
  city: 'City',
  town: 'Town',
  village: 'Village',
  hamlet: 'Hamlet',
  municipality: 'Municipality',
  borough: 'Borough',
  suburb: 'Neighbourhood',
  neighbourhood: 'Neighbourhood',
  quarter: 'Neighbourhood',
  city_district: 'District',
  district: 'District',
  island: 'Island',
  archipelago: 'Islands',
  peninsula: 'Peninsula',
  national_park: 'National park',
  protected_area: 'Protected area',
  park: 'Park',
  water: 'Water',
  bay: 'Bay',
  lake: 'Lake',
  reservoir: 'Reservoir',
  river: 'River',
  mountain_range: 'Mountains',
  peak: 'Peak',
  postcode: 'Postcode',
  locality: 'Locality',
  isolated_dwelling: 'Locality',
  continent: 'Continent',
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function placeTypeLabel(
  addresstype: string | undefined,
  type: string | undefined,
  category?: string,
): string {
  for (const candidate of [addresstype, type]) {
    if (!candidate) continue;
    const known = TYPE_LABELS[candidate];
    if (known) return known;
  }
  // Prefer saying something true and unfamiliar over something false and tidy.
  const fallback = addresstype || type || category;
  return fallback ? titleCase(fallback) : 'Place';
}

// Build a stable cache-key slug from a display name, e.g.
// "Madison, Dane County, Wisconsin, United States" → "place-madison-dane-county-wisconsin-united-states"
export function placeSlugFromName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `place-${cleaned}`;
}

// Build a synthetic CatalogPrint from URL params carrying the geocode result.
// Used by /customize when the user arrives via search (vs catalog slug).
export function buildPlaceCatalogPrint(input: {
  slug?: string;
  name: string;
  displayName?: string;
  kind: CatalogPrintKind;
  placeType?: string;
  bbox: [number, number, number, number]; // south, north, west, east
  center?: [number, number]; // longitude, latitude from the geocoder
}): CatalogPrint {
  const [south, north, west, east] = input.bbox;
  const center: [number, number] = input.center ?? [(west + east) / 2, (south + north) / 2];
  const slug = input.slug || placeSlugFromName(input.displayName || input.name);

  // Pick a reasonable default zoom by area
  const span = Math.max(Math.abs(north - south), Math.abs(east - west));
  const defaultZoom = span > 8 ? 5 : span > 4 ? 6 : span > 2 ? 7 : span > 1 ? 8 : span > 0.4 ? 9.5 : 11;

  // Default subtitle = the part after the first comma in display_name (e.g.
  // "Madison, Dane County, Wisconsin, United States" → "Wisconsin, United States")
  let defaultSubtitle = '';
  if (input.displayName) {
    const parts = input.displayName.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      defaultSubtitle = parts.slice(-2).join(', ');
    } else if (parts.length === 2) {
      defaultSubtitle = parts[1];
    }
  }

  return {
    slug,
    name: input.name,
    kind: input.kind,
    placeType: input.placeType || input.kind,
    bbox: [south.toString(), north.toString(), west.toString(), east.toString()],
    center,
    defaultZoom,
    defaultTitle: input.name,
    defaultSubtitle,
    searchQuery: input.displayName || input.name,
  };
}

// Parse the customize-page URL params into a place spec, or null if missing/invalid.
export function placeFromSearchParams(params: URLSearchParams): CatalogPrint | null {
  const name = params.get('place');
  const bboxStr = params.get('bbox');
  if (!name || !bboxStr) return null;

  const parts = bboxStr.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [south, north, west, east] = parts;
  if (south >= north || west >= east) return null;

  const kind = (params.get('kind') as CatalogPrintKind) || 'city';
  const placeType = params.get('type') || kind;
  const displayName = params.get('display') || undefined;
  const centerParts = params.get('center')?.split(',').map(Number);
  const center = centerParts?.length === 2 && centerParts.every(Number.isFinite)
    ? centerParts as [number, number]
    : undefined;

  return buildPlaceCatalogPrint({
    name,
    displayName,
    kind,
    placeType,
    bbox: [south, north, west, east],
    center,
  });
}
