/**
 * Nominatim Geocoding Client
 *
 * Wraps the OpenStreetMap Nominatim API for search and reverse geocoding.
 * In production, these calls should go through /api/geocode to enforce rate limiting.
 *
 * Rate limit: 1 request per second (Nominatim usage policy)
 */

const NOMINATIM_BASE = process.env.NEXT_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

export interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  type: string;
  class: string;
  geojson?: GeoJSON.Geometry;
}

export interface NominatimReverseResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  type: string;
  class: string;
  geojson?: GeoJSON.Geometry;
}

/** Search for a location by name */
export async function searchLocation(query: string): Promise<NominatimSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    polygon_geojson: '1',
  });

  const resp = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { 'User-Agent': 'CartoPrint/1.0' },
  });

  if (!resp.ok) throw new Error(`Nominatim search failed: ${resp.status}`);
  return resp.json();
}

/** Reverse geocode a lat/lng to get the region at that point */
export async function reverseGeocode(
  lat: number,
  lng: number,
  zoom: number
): Promise<NominatimReverseResult | null> {
  // Map zoom level to Nominatim's zoom parameter (admin level granularity)
  // Higher zoom = more specific (county, city, neighborhood)
  const nominatimZoom = zoom > 10 ? 14 : zoom > 7 ? 10 : zoom > 5 ? 8 : 5;

  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'json',
    zoom: nominatimZoom.toString(),
    polygon_geojson: '1',
  });

  const resp = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
    headers: { 'User-Agent': 'CartoPrint/1.0' },
  });

  if (!resp.ok) return null;
  return resp.json();
}
