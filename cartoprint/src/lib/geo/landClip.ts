import land from '@/data/ne_50m_land.json';
import lakes from '@/data/ne_50m_lakes.json';
import { diff, intersection } from 'martinez-polygon-clipping';

type Position = [number, number];
type Ring = Position[];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];
type BBox = [number, number, number, number]; // west, south, east, north

interface LandFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

interface LandCollection {
  type: 'FeatureCollection';
  features: LandFeature[];
}

const LAND = land as LandCollection;
const LAKES = lakes as LandCollection;
const MIN_AREA_RATIO = 0.08;
const MAJOR_LAKE_MIN_AREA = 1;

interface IndexedLandFeature {
  bbox: BBox;
  geometry: MultiPolygonCoords;
}

function geometryToMultiPolygon(geometry: GeoJSON.Geometry): MultiPolygonCoords | null {
  if (geometry.type === 'Polygon') return [geometry.coordinates as PolygonCoords];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as MultiPolygonCoords;
  return null;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const current = ring[i];
    const next = ring[i + 1];
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(sum / 2);
}

function polygonArea(polygon: PolygonCoords): number {
  if (polygon.length === 0) return 0;
  const outer = ringArea(polygon[0]);
  const holes = polygon.slice(1).reduce((total, ring) => total + ringArea(ring), 0);
  return Math.max(0, outer - holes);
}

function multiPolygonArea(multiPolygon: MultiPolygonCoords): number {
  return multiPolygon.reduce((total, polygon) => total + polygonArea(polygon), 0);
}

export function getGeometryBBox(geometry: GeoJSON.Geometry): BBox | null {
  const multiPolygon = geometryToMultiPolygon(geometry);
  if (!multiPolygon) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring as Position[]) {
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return null;
  }

  return [west, south, east, north];
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

const LAND_INDEX: IndexedLandFeature[] = LAND.features
  .map((feature) => {
    if (!feature.geometry) return null;
    const bbox = getGeometryBBox(feature.geometry);
    const geometry = geometryToMultiPolygon(feature.geometry);
    if (!bbox || !geometry) return null;
    return { bbox, geometry };
  })
  .filter((feature): feature is IndexedLandFeature => Boolean(feature));

const LAKE_INDEX: IndexedLandFeature[] = LAKES.features
  .map((feature) => {
    if (!feature.geometry) return null;
    const bbox = getGeometryBBox(feature.geometry);
    const geometry = geometryToMultiPolygon(feature.geometry);
    if (!bbox || !geometry) return null;
    if (multiPolygonArea(geometry) < MAJOR_LAKE_MIN_AREA) return null;
    return { bbox, geometry };
  })
  .filter((feature): feature is IndexedLandFeature => Boolean(feature));

function subtractLakes(geometry: MultiPolygonCoords): MultiPolygonCoords {
  let clipped = geometry;
  let bbox = getGeometryBBox({ type: 'MultiPolygon', coordinates: clipped });
  if (!bbox) return clipped;

  for (const lake of LAKE_INDEX) {
    if (!bboxesOverlap(bbox, lake.bbox)) continue;

    try {
      const next = normalizeIntersectionResult(diff(clipped, lake.geometry));
      if (next.length === 0) continue;
      clipped = next;
      const nextBBox = getGeometryBBox({ type: 'MultiPolygon', coordinates: clipped });
      if (!nextBBox) return clipped;
      bbox = nextBBox;
    } catch {
      // Invalid third-party rings should not block boundary selection.
    }
  }

  return clipped;
}

function normalizeIntersectionResult(result: unknown): MultiPolygonCoords {
  if (!Array.isArray(result)) return [];

  return result
    .filter((polygon): polygon is PolygonCoords => Array.isArray(polygon) && Array.isArray(polygon[0]))
    .filter((polygon) => polygon.length > 0 && polygon[0].length >= 4)
    .filter((polygon) => polygonArea(polygon) > 0.000001);
}

export function clipGeometryToLand(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  const subject = geometryToMultiPolygon(geometry);
  if (!subject) return geometry;

  const subjectBBox = getGeometryBBox(geometry);
  if (!subjectBBox) return geometry;

  const clippedPolygons: MultiPolygonCoords = [];

  for (const feature of LAND_INDEX) {
    if (!bboxesOverlap(subjectBBox, feature.bbox)) continue;
    try {
      const clipped = normalizeIntersectionResult(intersection(subject, feature.geometry));
      clippedPolygons.push(...clipped);
    } catch {
      // Some tiny or invalid rings can fail clipping. Fall back to the original boundary below.
    }
  }

  if (clippedPolygons.length === 0) return geometry;

  const landAndLakeClippedPolygons = subtractLakes(clippedPolygons);
  const originalArea = multiPolygonArea(subject);
  const clippedArea = multiPolygonArea(landAndLakeClippedPolygons);
  if (originalArea > 0 && clippedArea / originalArea < MIN_AREA_RATIO) {
    return geometry;
  }

  return {
    type: 'MultiPolygon',
    coordinates: landAndLakeClippedPolygons as GeoJSON.Position[][][],
  };
}
