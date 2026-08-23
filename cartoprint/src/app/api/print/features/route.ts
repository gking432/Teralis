import { NextRequest, NextResponse } from 'next/server';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import usPlaces from '@/data/us_places_2025.json';
import usTownships from '@/data/us_townships_2025.json';

type BBox = [string, string, string, string]; // south, north, west, east

interface FeatureRequest {
  bbox?: BBox | null;
  geometry?: GeoJSON.Geometry | null;
  towns?: boolean;
  roads?: boolean;
  stateDetails?: boolean;
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
const ROAD_TILE_ZOOM = 12;
const STATE_DETAIL_TILE_ZOOM = 9;
const MAX_ROAD_TILES = 180;
const ROAD_TILEJSON_URL = process.env.PRINT_ROAD_TILEJSON_URL || 'https://tiles.openfreemap.org/planet';
const ROAD_CLASSES = new Set([
  'tertiary', 'minor', 'service', 'track', 'street', 'street_limited',
]);
const STATE_DETAIL_ROAD_CLASSES = new Set(['secondary', 'tertiary']);

let roadTileTemplatePromise: Promise<string | null> | null = null;

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

function longitudeToTileX(longitude: number, zoom: number): number {
  const tiles = Math.pow(2, zoom);
  return Math.min(Math.max(Math.floor(((longitude + 180) / 360) * tiles), 0), tiles - 1);
}

function latitudeToTileY(latitude: number, zoom: number): number {
  const tiles = Math.pow(2, zoom);
  const clamped = Math.min(Math.max(latitude, -85.05112878), 85.05112878);
  const radians = (clamped * Math.PI) / 180;
  const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
  return Math.min(Math.max(Math.floor(y * tiles), 0), tiles - 1);
}

async function getRoadTileTemplate(): Promise<string | null> {
  if (!roadTileTemplatePromise) {
    roadTileTemplatePromise = fetch(ROAD_TILEJSON_URL, { next: { revalidate: 3600 } })
      .then((response) => response.ok ? response.json() : null)
      .then((tileJson: { tiles?: string[] } | null) => tileJson?.tiles?.[0] ?? null)
      .catch(() => null);
  }
  return roadTileTemplatePromise;
}

async function getRoadFeatures(bbox: BBox): Promise<GeoJSON.FeatureCollection> {
  const [south, north, west, east] = bbox.map(Number);
  const minX = longitudeToTileX(west, ROAD_TILE_ZOOM);
  const maxX = longitudeToTileX(east, ROAD_TILE_ZOOM);
  const minY = latitudeToTileY(north, ROAD_TILE_ZOOM);
  const maxY = latitudeToTileY(south, ROAD_TILE_ZOOM);
  const coordinates: Array<[number, number]> = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) coordinates.push([x, y]);
  }

  if (coordinates.length > MAX_ROAD_TILES) {
    return { type: 'FeatureCollection', features: [] };
  }

  const template = await getRoadTileTemplate();
  if (!template) return { type: 'FeatureCollection', features: [] };

  const features: GeoJSON.Feature[] = [];
  for (let index = 0; index < coordinates.length; index += 16) {
    const batch = coordinates.slice(index, index + 16);
    const tiles = await Promise.all(batch.map(async ([x, y]) => {
      const url = template
        .replace('{z}', String(ROAD_TILE_ZOOM))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      const response = await fetch(url, { next: { revalidate: 86400 } });
      if (!response.ok) return [] as GeoJSON.Feature[];

      const tile = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer())));
      const layer = tile.layers.transportation;
      if (!layer) return [] as GeoJSON.Feature[];

      const tileFeatures: GeoJSON.Feature[] = [];
      for (let featureIndex = 0; featureIndex < layer.length; featureIndex += 1) {
        const feature = layer.feature(featureIndex);
        const roadClass = String(feature.properties.class || '');
        if (!ROAD_CLASSES.has(roadClass)) continue;
        const geojson = feature.toGeoJSON(x, y, ROAD_TILE_ZOOM) as GeoJSON.Feature;
        if (geojson.geometry.type !== 'LineString' && geojson.geometry.type !== 'MultiLineString') continue;
        const rounded = JSON.parse(JSON.stringify(geojson.geometry.coordinates), (_key, value) =>
          typeof value === 'number' ? Number(value.toFixed(5)) : value,
        ) as GeoJSON.LineString['coordinates'] | GeoJSON.MultiLineString['coordinates'];
        const flat = rounded.flat(2) as number[];
        let intersectsFrame = false;
        for (let coordinateIndex = 0; coordinateIndex < flat.length; coordinateIndex += 2) {
          const longitude = flat[coordinateIndex];
          const latitude = flat[coordinateIndex + 1];
          if (longitude >= west && longitude <= east && latitude >= south && latitude <= north) {
            intersectsFrame = true;
            break;
          }
        }
        if (!intersectsFrame) continue;
        geojson.geometry.coordinates = rounded as never;
        geojson.properties = { class: roadClass };
        tileFeatures.push(geojson);
      }
      return tileFeatures;
    }));
    tiles.forEach((tileFeatures) => features.push(...tileFeatures));
  }

  const linesByClass = new Map<string, GeoJSON.Position[][]>();
  features.forEach((feature) => {
    const roadClass = String(feature.properties?.class || 'minor');
    const lines = linesByClass.get(roadClass) ?? [];
    if (feature.geometry.type === 'LineString') lines.push(feature.geometry.coordinates);
    if (feature.geometry.type === 'MultiLineString') lines.push(...feature.geometry.coordinates);
    linesByClass.set(roadClass, lines);
  });

  return {
    type: 'FeatureCollection',
    features: Array.from(linesByClass, ([roadClass, coordinates]) => ({
      type: 'Feature' as const,
      properties: { class: roadClass },
      geometry: { type: 'MultiLineString' as const, coordinates },
    })),
  };
}

function coordinatesIntersectBBox(
  coordinates: unknown,
  south: number,
  north: number,
  west: number,
  east: number,
): boolean {
  if (!Array.isArray(coordinates)) return false;
  if (
    coordinates.length >= 2
    && typeof coordinates[0] === 'number'
    && typeof coordinates[1] === 'number'
  ) {
    const longitude = coordinates[0];
    const latitude = coordinates[1];
    return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
  }
  return coordinates.some((child) => coordinatesIntersectBBox(child, south, north, west, east));
}

function distanceToSegmentSquared(point: GeoJSON.Position, start: GeoJSON.Position, end: GeoJSON.Position): number {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyLine(points: GeoJSON.Position[], tolerance = 0.002): GeoJSON.Position[] {
  if (points.length <= 2) return points;
  const squaredTolerance = tolerance * tolerance;
  let maxDistance = squaredTolerance;
  let splitIndex = -1;
  const first = points[0];
  const last = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegmentSquared(points[index], first, last);
    if (distance > maxDistance) {
      splitIndex = index;
      maxDistance = distance;
    }
  }
  if (splitIndex < 0) return [first, last];
  return [
    ...simplifyLine(points.slice(0, splitIndex + 1), tolerance).slice(0, -1),
    ...simplifyLine(points.slice(splitIndex), tolerance),
  ];
}

function simplifyRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (ring.length <= 4) return ring;
  const open = ring.slice(0, -1);
  const simplified = simplifyLine(open, 0.002);
  if (simplified.length < 3) return ring;
  return [...simplified, simplified[0]];
}

function prepareStateGeometry(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  let prepared = geometry;
  if (geometry.type === 'LineString') {
    prepared = { ...geometry, coordinates: simplifyLine(geometry.coordinates) };
  } else if (geometry.type === 'MultiLineString') {
    prepared = { ...geometry, coordinates: geometry.coordinates.map((line) => simplifyLine(line)) };
  } else if (geometry.type === 'Polygon') {
    prepared = { ...geometry, coordinates: geometry.coordinates.map(simplifyRing) };
  } else if (geometry.type === 'MultiPolygon') {
    prepared = {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)),
    };
  }
  return JSON.parse(JSON.stringify(prepared), (_key, value) =>
    typeof value === 'number' ? Number(value.toFixed(4)) : value,
  ) as GeoJSON.Geometry;
}

function geometrySpan(geometry: GeoJSON.Geometry): number {
  if (!('coordinates' in geometry)) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const visit = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      minX = Math.min(minX, coordinates[0]);
      maxX = Math.max(maxX, coordinates[0]);
      minY = Math.min(minY, coordinates[1]);
      maxY = Math.max(maxY, coordinates[1]);
      return;
    }
    coordinates.forEach(visit);
  };
  visit(geometry.coordinates);
  return Math.max(maxX - minX, maxY - minY);
}

function mergeStateDetailFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  const lines = new Map<string, GeoJSON.Position[][]>();
  const polygons: GeoJSON.Position[][][] = [];

  features.forEach((feature) => {
    const kind = String(feature.properties?.kind || '');
    const roadClass = String(feature.properties?.class || '');
    if (kind === 'lake') {
      if (feature.geometry.type === 'Polygon') polygons.push(feature.geometry.coordinates);
      if (feature.geometry.type === 'MultiPolygon') polygons.push(...feature.geometry.coordinates);
      return;
    }
    const key = kind === 'road' ? `${kind}:${roadClass}` : kind;
    const collection = lines.get(key) ?? [];
    if (feature.geometry.type === 'LineString') collection.push(feature.geometry.coordinates);
    if (feature.geometry.type === 'MultiLineString') collection.push(...feature.geometry.coordinates);
    lines.set(key, collection);
  });

  const merged: GeoJSON.Feature[] = Array.from(lines, ([key, coordinates]) => {
    const [kind, roadClass = ''] = key.split(':');
    return {
      type: 'Feature' as const,
      properties: { kind, class: roadClass },
      geometry: { type: 'MultiLineString' as const, coordinates },
    };
  });
  if (polygons.length) {
    merged.push({
      type: 'Feature',
      properties: { kind: 'lake', class: '' },
      geometry: { type: 'MultiPolygon', coordinates: polygons },
    });
  }
  return merged;
}

/**
 * State maps render at a low camera zoom, where base tiles omit secondary
 * roads, smaller lakes, county boundaries, and much of the river geometry.
 * Pull those features from z9 so "More detailed" changes the actual artwork.
 */
async function getStateDetailFeatures(bbox: BBox): Promise<GeoJSON.FeatureCollection> {
  const [south, north, west, east] = bbox.map(Number);
  const zoom = STATE_DETAIL_TILE_ZOOM;
  const minX = longitudeToTileX(west, zoom);
  const maxX = longitudeToTileX(east, zoom);
  const minY = latitudeToTileY(north, zoom);
  const maxY = latitudeToTileY(south, zoom);
  const coordinates: Array<[number, number]> = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) coordinates.push([x, y]);
  }
  if (coordinates.length > MAX_ROAD_TILES) {
    return { type: 'FeatureCollection', features: [] };
  }

  const template = await getRoadTileTemplate();
  if (!template) return { type: 'FeatureCollection', features: [] };

  const features: GeoJSON.Feature[] = [];
  for (let index = 0; index < coordinates.length; index += 16) {
    const batch = coordinates.slice(index, index + 16);
    const tiles = await Promise.all(batch.map(async ([x, y]) => {
      const url = template
        .replace('{z}', String(zoom))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      const response = await fetch(url, { next: { revalidate: 86400 } });
      if (!response.ok) return [] as GeoJSON.Feature[];

      const tile = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer())));
      const tileFeatures: GeoJSON.Feature[] = [];
      const collect = (
        layerName: 'transportation' | 'waterway' | 'water' | 'boundary',
        kind: 'road' | 'river' | 'lake' | 'county',
        include: (properties: Record<string, unknown>) => boolean,
      ) => {
        const layer = tile.layers[layerName];
        if (!layer) return;
        for (let featureIndex = 0; featureIndex < layer.length; featureIndex += 1) {
          const feature = layer.feature(featureIndex);
          if (!include(feature.properties)) continue;
          const geojson = feature.toGeoJSON(x, y, zoom) as GeoJSON.Feature;
          if (!('coordinates' in geojson.geometry)) continue;
          if (!coordinatesIntersectBBox(geojson.geometry.coordinates, south, north, west, east)) continue;
          geojson.geometry = prepareStateGeometry(geojson.geometry);
          if (kind === 'lake' && geometrySpan(geojson.geometry) < 0.012) continue;
          geojson.properties = { kind, class: String(feature.properties.class || '') };
          tileFeatures.push(geojson);
        }
      };

      collect('transportation', 'road', (properties) =>
        STATE_DETAIL_ROAD_CLASSES.has(String(properties.class || '')),
      );
      collect('waterway', 'river', () => true);
      collect('water', 'lake', () => true);
      collect('boundary', 'county', (properties) => Number(properties.admin_level) === 6);
      return tileFeatures;
    }));
    tiles.forEach((tileFeatures) => features.push(...tileFeatures));
  }

  return { type: 'FeatureCollection', features: mergeStateDetailFeatures(features) };
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
    if (!body.bbox || (!body.towns && !body.roads && !body.stateDetails)) {
      return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }

    if (body.stateDetails) {
      const details = await getStateDetailFeatures(body.bbox);
      return NextResponse.json(details, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
      });
    }

    if (body.roads) {
      const roads = await getRoadFeatures(body.bbox);
      return NextResponse.json(roads, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
      });
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
