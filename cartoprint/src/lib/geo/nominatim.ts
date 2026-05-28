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

function scoreResultForTarget(
  result: Pick<NominatimSearchResult, 'type' | 'class' | 'display_name'>,
  target: 'country' | 'state' | 'county' | 'city'
): number {
  const type = `${result.type} ${result.class} ${result.display_name}`.toLowerCase();

  switch (target) {
    case 'country':
      return /country|nation/.test(type) ? 3 : /state|province/.test(type) ? 1 : 0;
    case 'state':
      return /state|province|region/.test(type) ? 3 : /county/.test(type) ? 1 : 0;
    case 'county':
      return /county|administrative/.test(type) ? 3 : /state|province/.test(type) ? 1 : 0;
    case 'city':
      return /city|town|village|hamlet|municipality/.test(type) ? 3 : /county/.test(type) ? 1 : 0;
  }
}

export function pickSearchResult(
  results: NominatimSearchResult[],
  target: 'country' | 'state' | 'county' | 'city'
): NominatimSearchResult | null {
  if (results.length === 0) return null;

  return [...results].sort((a, b) => scoreResultForTarget(b, target) - scoreResultForTarget(a, target))[0];
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
