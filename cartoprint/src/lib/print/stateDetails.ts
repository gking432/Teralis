type StateDetailBbox = readonly [string, string, string, string];

export const MAX_STATE_DETAIL_TILES = 180;

function longitudeToTileX(longitude: number, zoom: number): number {
  const tiles = 2 ** zoom;
  return Math.min(Math.max(Math.floor(((longitude + 180) / 360) * tiles), 0), tiles - 1);
}

function latitudeToTileY(latitude: number, zoom: number): number {
  const tiles = 2 ** zoom;
  const clamped = Math.min(Math.max(latitude, -85.05112878), 85.05112878);
  const radians = (clamped * Math.PI) / 180;
  const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
  return Math.min(Math.max(Math.floor(y * tiles), 0), tiles - 1);
}

export function stateDetailTileCount(bbox: StateDetailBbox, zoom: number): number {
  const [south, north, west, east] = bbox.map(Number);
  const columns = longitudeToTileX(east, zoom) - longitudeToTileX(west, zoom) + 1;
  const rows = latitudeToTileY(south, zoom) - latitudeToTileY(north, zoom) + 1;
  return Math.max(columns, 0) * Math.max(rows, 0);
}

/**
 * Pick the highest useful source zoom that stays within the same bounded tile
 * budget for every state. Small states get z9 detail; large states step down
 * automatically instead of silently returning no geography.
 */
export function stateDetailZoomForBbox(bbox: StateDetailBbox): number {
  for (let zoom = 9; zoom >= 4; zoom -= 1) {
    if (stateDetailTileCount(bbox, zoom) <= MAX_STATE_DETAIL_TILES) return zoom;
  }
  return 4;
}

/** Fetch state-scale geography omitted from low-zoom base map tiles. */
export async function fetchDetailedStateFeatures(
  bbox: StateDetailBbox,
  geometry?: GeoJSON.Geometry | null,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('/api/print/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bbox, geometry, stateDetails: true }),
    signal,
  });
  if (!response.ok) throw new Error('Detailed state geography is unavailable.');
  return await response.json() as GeoJSON.FeatureCollection;
}
