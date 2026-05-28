import { NextRequest, NextResponse } from 'next/server';
import usPlaces from '@/data/us_places_2025.json';
import usTownships from '@/data/us_townships_2025.json';

type BBox = [string, string, string, string]; // south, north, west, east

interface FeatureRequest {
  bbox?: BBox | null;
  geometry?: GeoJSON.Geometry | null;
  towns?: boolean;
}

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  tags?: {
    name?: string;
    place?: string;
    population?: string;
  };
}

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const MAX_PLACE_LABELS = 4000;
const MAX_BBOX_AREA = 90;
const MAX_OVERPASS_BBOX_AREA = 6;

interface UsPlace {
  s: string;
  n: string;
  k: string;
  lat: number;
  lng: number;
}

const US_PLACES = usPlaces as UsPlace[];
const US_TOWNSHIPS = usTownships as UsPlace[];

function isPointInRing(point: [number, number], ring: GeoJSON.Position[]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function isPointInPolygon(point: [number, number], polygon: GeoJSON.Position[][]): boolean {
  if (!isPointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => isPointInRing(point, hole));
}

function isPointInGeometry(point: [number, number], geometry: GeoJSON.Geometry | null | undefined): boolean {
  if (!geometry) return true;
  if (geometry.type === 'Polygon') return isPointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => isPointInPolygon(point, polygon));
  }
  return true;
}

function getBBoxArea(bbox: BBox): number {
  const south = Number(bbox[0]);
  const north = Number(bbox[1]);
  const west = Number(bbox[2]);
  const east = Number(bbox[3]);
  return Math.abs((north - south) * (east - west));
}

function getPlaceRank(place: string | undefined): number {
  switch (place) {
    case 'city':
      return 0;
    case 'town':
      return 1;
    case 'village':
      return 2;
    case 'hamlet':
      return 3;
    case 'township':
      return 4;
    default:
      return 5;
  }
}

function getLocalPlaceRank(place: string): number {
  switch (place) {
    case 'city':
      return 0;
    case 'town':
      return 1;
    case 'village':
      return 2;
    case 'township':
      return 3;
    default:
      return 4;
  }
}

function buildTownQuery(bbox: BBox): string {
  const [south, north, west, east] = bbox;
  return `
    [out:json][timeout:25];
    (
      node["place"~"^(city|town|village|hamlet)$"]["name"](${south},${west},${north},${east});
    );
    out body qt;
  `;
}

function placesToFeatureCollection(places: UsPlace[], geometry: GeoJSON.Geometry | null | undefined) {
  const features = places
    .filter((place) => isPointInGeometry([place.lng, place.lat], geometry))
    .slice(0, MAX_PLACE_LABELS)
    .map((place, index) => ({
      type: 'Feature' as const,
      properties: {
        id: `${place.s}-${index}-${place.n}`,
        name: place.n,
        place: place.k,
        rank: getLocalPlaceRank(place.k),
        state: place.s,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [place.lng, place.lat],
      },
    }));

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FeatureRequest;
    if (!body.towns || !body.bbox) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }

    if (getBBoxArea(body.bbox) > MAX_BBOX_AREA) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }

    const [south, north, west, east] = body.bbox.map(Number);
    const localPlaces = [...US_PLACES, ...US_TOWNSHIPS].filter(
      (place) => place.lat >= south && place.lat <= north && place.lng >= west && place.lng <= east
    ).sort((a, b) => getLocalPlaceRank(a.k) - getLocalPlaceRank(b.k));

    if (localPlaces.length > 0) {
      return NextResponse.json(placesToFeatureCollection(localPlaces, body.geometry));
    }

    if (getBBoxArea(body.bbox) > MAX_OVERPASS_BBOX_AREA) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);

    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Terralis/1.0 print-preview',
      },
      body: new URLSearchParams({ data: buildTownQuery(body.bbox) }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] }, { status: 200 });
    }

    const data = (await response.json()) as { elements?: OverpassElement[] };
    const features = (data.elements || [])
      .filter((element) => element.lat !== undefined && element.lon !== undefined && element.tags?.name)
      .filter((element) => isPointInGeometry([element.lon!, element.lat!], body.geometry))
      .sort((a, b) => {
        const rankDelta = getPlaceRank(a.tags?.place) - getPlaceRank(b.tags?.place);
        if (rankDelta !== 0) return rankDelta;
        return Number(b.tags?.population || 0) - Number(a.tags?.population || 0);
      })
      .slice(0, MAX_PLACE_LABELS)
      .map((element) => ({
        type: 'Feature' as const,
        properties: {
          id: element.id,
          name: element.tags!.name,
          place: element.tags?.place || 'place',
          rank: getPlaceRank(element.tags?.place),
          population: element.tags?.population ? Number(element.tags.population) || null : null,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [element.lon!, element.lat!],
        },
      }));

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (error) {
    console.error('Print feature lookup failed:', error);
    return NextResponse.json({ type: 'FeatureCollection', features: [] });
  }
}
