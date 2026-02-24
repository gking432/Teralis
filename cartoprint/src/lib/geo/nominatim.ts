export interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
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

export async function searchLocation(query: string): Promise<NominatimSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    polygon_geojson: '1',
  });

  const resp = await fetch(`/api/geocode?${params}`);
  if (!resp.ok) throw new Error(`Geocode search failed: ${resp.status}`);
  return resp.json();
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  zoom: number
): Promise<NominatimReverseResult | null> {
  const nominatimZoom = zoom > 10 ? 14 : zoom > 7 ? 10 : zoom > 5 ? 8 : 5;
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    z: nominatimZoom.toString(),
  });

  const resp = await fetch(`/api/geocode?${params}`);
  if (!resp.ok) return null;
  return resp.json();
}
