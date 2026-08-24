import { NextRequest, NextResponse } from 'next/server';
import type { PrintRegionScope } from '@/types/order';
import { clipGeometryToLand, getGeometryBBox } from '@/lib/geo/landClip';
import bundledStates from '@/data/us_states_50m.json';

const NOMINATIM_BASE = process.env.NEXT_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

const SCOPE_ZOOM: Record<PrintRegionScope, string> = {
  country: '3',
  state: '5',
  county: '10',
  city: '14',
};

let lastRequest = 0;
const MIN_INTERVAL = 1100;

interface NominatimAddress {
  country?: string;
  state?: string;
  province?: string;
  region?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
}

interface NominatimResult {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  name?: string;
  type?: string;
  class?: string;
  boundingbox?: [string, string, string, string];
  geojson?: GeoJSON.Geometry;
  address?: NominatimAddress;
}

interface BoundaryResult {
  id: string;
  level: PrintRegionScope;
  name: string;
  fullName: string;
  bbox: [string, string, string, string] | null;
  geometry: GeoJSON.Geometry;
  source: 'reverse' | 'search' | 'reverse-land' | 'search-land' | 'bundled';
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastRequest));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequest = Date.now();

  return fetch(url, {
    headers: { 'User-Agent': 'Terralis/1.0 (https://terralis.com)' },
  });
}

/**
 * Nominatim serves HTML for blocks and rate limits, so a bare `.json()` throws
 * and surfaces a raw parser error to the customer. Always parse defensively.
 */
async function readJson<T>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isPrintScope(value: string | null): value is PrintRegionScope {
  return value === 'country' || value === 'state' || value === 'county' || value === 'city';
}

function scoreResultForScope(result: NominatimResult, scope: PrintRegionScope): number {
  const haystack = `${result.type || ''} ${result.class || ''} ${result.display_name || ''}`.toLowerCase();
  const hasPolygon = result.geojson?.type === 'Polygon' || result.geojson?.type === 'MultiPolygon';
  const polygonScore = hasPolygon ? 4 : 0;

  switch (scope) {
    case 'country':
      return polygonScore + (/country|nation/.test(haystack) ? 8 : 0);
    case 'state':
      return polygonScore + (/state|province|region/.test(haystack) ? 8 : 0);
    case 'county':
      return polygonScore + (/county|administrative/.test(haystack) ? 8 : 0);
    case 'city':
      return polygonScore + (/city|town|village|hamlet|municipality/.test(haystack) ? 8 : 0);
  }
}

function hasUsablePolygon(result: NominatimResult | null): result is NominatimResult & {
  geojson: GeoJSON.Geometry;
} {
  return result?.geojson?.type === 'Polygon' || result?.geojson?.type === 'MultiPolygon';
}

function getRegionName(result: NominatimResult, scope: PrintRegionScope): string {
  const address = result.address || {};

  if (scope === 'country' && address.country) return address.country;
  if (scope === 'state' && (address.state || address.province || address.region)) {
    return address.state || address.province || address.region || '';
  }
  if (scope === 'county' && address.county) return address.county;
  if (scope === 'city') {
    return (
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.municipality ||
      result.name ||
      ''
    );
  }

  return result.name || result.display_name?.split(',')[0]?.trim() || 'Selected area';
}

function getSearchQuery(reverse: NominatimResult, scope: PrintRegionScope): string | null {
  const address = reverse.address || {};
  const state = address.state || address.province || address.region;
  const city = address.city || address.town || address.village || address.hamlet || address.municipality;

  switch (scope) {
    case 'country':
      return address.country || null;
    case 'state':
      if (!state) return null;
      return [state, address.country].filter(Boolean).join(', ');
    case 'county':
      if (!address.county) return null;
      return [address.county, state, address.country].filter(Boolean).join(', ');
    case 'city':
      if (!city) return null;
      return [city, state, address.country].filter(Boolean).join(', ');
  }
}

function normalizeBoundary(
  result: NominatimResult & { geojson: GeoJSON.Geometry },
  scope: PrintRegionScope,
  source: 'reverse' | 'search'
): BoundaryResult {
  const name = getRegionName(result, scope);
  const identity = result.osm_id || result.place_id || name.toLowerCase();
  const geometry = scope === 'country' ? result.geojson : clipGeometryToLand(result.geojson);
  const landBBox = getGeometryBBox(geometry);

  return {
    id: `${scope}:${result.osm_type || 'place'}:${identity}`,
    level: scope,
    name,
    fullName: result.display_name || name,
    bbox: landBBox
      ? [
          landBBox[1].toString(),
          landBBox[3].toString(),
          landBBox[0].toString(),
          landBBox[2].toString(),
        ]
      : result.boundingbox || null,
    geometry,
    source: geometry === result.geojson ? source : `${source}-land`,
  };
}

async function reverseBoundary(lat: string, lng: string, scope: PrintRegionScope): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    lat,
    lon: lng,
    format: 'json',
    zoom: SCOPE_ZOOM[scope],
    polygon_geojson: '1',
    addressdetails: '1',
  });

  const resp = await rateLimitedFetch(`${NOMINATIM_BASE}/reverse?${params}`);
  if (!resp.ok) return null;
  return readJson<NominatimResult>(resp);
}

async function searchBoundary(query: string, scope: PrintRegionScope): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '10',
    polygon_geojson: '1',
    addressdetails: '1',
  });

  const resp = await rateLimitedFetch(`${NOMINATIM_BASE}/search?${params}`);
  if (!resp.ok) return null;

  const results = await readJson<NominatimResult[]>(resp);
  if (!Array.isArray(results)) return null;
  return [...results]
    .filter(hasUsablePolygon)
    .sort((a, b) => scoreResultForScope(b, scope) - scoreResultForScope(a, scope))[0] || null;
}

interface BundledState {
  name: string;
  postal: string;
  geometry: GeoJSON.Geometry;
}

const BUNDLED_STATES = bundledStates as unknown as Record<string, BundledState>;

function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function bundledGeometryContains(geometry: GeoJSON.Geometry, lng: number, lat: number): boolean {
  if (geometry.type === 'Polygon') return ringContains(geometry.coordinates[0] as number[][], lng, lat);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => ringContains(poly[0] as number[][], lng, lat));
  }
  return false;
}

/**
 * Offline fallback: Nominatim rate-limits, blocks, and sometimes just fails —
 * and a storefront that cannot draw its state is a storefront that cannot
 * sell. US state boundaries ship with the app (Natural Earth 1:50m), so a
 * state-level request always has an answer even when the geocoder has none.
 */
function bundledStateBoundary(lat: string, lng: string): BoundaryResult | null {
  const pointLng = Number(lng);
  const pointLat = Number(lat);
  if (!Number.isFinite(pointLng) || !Number.isFinite(pointLat)) return null;
  for (const [slug, state] of Object.entries(BUNDLED_STATES)) {
    if (!bundledGeometryContains(state.geometry, pointLng, pointLat)) continue;
    const bbox = getGeometryBBox(state.geometry);
    return {
      id: `state:bundled:${slug}`,
      level: 'state',
      name: state.name,
      fullName: `${state.name}, United States`,
      bbox: bbox
        ? [bbox[1].toString(), bbox[3].toString(), bbox[0].toString(), bbox[2].toString()]
        : null,
      geometry: state.geometry,
      source: 'bundled',
    };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const scope = searchParams.get('level');

  if (!lat || !lng || !isPrintScope(scope)) {
    return NextResponse.json({ error: 'Missing lat/lng or invalid level' }, { status: 400 });
  }

  let reverse: NominatimResult | null = null;
  try {
    reverse = await reverseBoundary(lat, lng, scope);
  } catch {
    reverse = null;
  }
  if (hasUsablePolygon(reverse) && scoreResultForScope(reverse, scope) >= 8) {
    return NextResponse.json(normalizeBoundary(reverse, scope, 'reverse'));
  }

  const query = reverse ? getSearchQuery(reverse, scope) : null;
  if (query) {
    try {
      const searched = await searchBoundary(query, scope);
      if (hasUsablePolygon(searched)) {
        return NextResponse.json(normalizeBoundary(searched, scope, 'search'));
      }
    } catch {
      // fall through to the remaining sources
    }
  }

  if (hasUsablePolygon(reverse)) {
    return NextResponse.json(normalizeBoundary(reverse, scope, 'reverse'));
  }

  if (scope === 'state') {
    const bundled = bundledStateBoundary(lat, lng);
    if (bundled) return NextResponse.json(bundled);
  }

  return NextResponse.json(
    { error: `No ${scope} boundary found for that click` },
    { status: 404 }
  );
}
