type RoadBbox = readonly [string, string, string, string];

const MAX_CHUNK_LATITUDE_SPAN = 0.55;
const MAX_CHUNK_LONGITUDE_SPAN = 0.75;
const CHUNK_OVERLAP_DEGREES = 0.008;

/**
 * Keep each request comfortably below the vector-tile cap while covering the
 * complete print extent. A small overlap prevents visible joins at chunk edges.
 */
export function splitCityRoadBbox(bbox: RoadBbox): RoadBbox[] {
  const [south, north, west, east] = bbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite) || north <= south || east <= west) return [];

  const rows = Math.max(1, Math.ceil((north - south) / MAX_CHUNK_LATITUDE_SPAN));
  const columns = Math.max(1, Math.ceil((east - west) / MAX_CHUNK_LONGITUDE_SPAN));
  const latitudeStep = (north - south) / rows;
  const longitudeStep = (east - west) / columns;
  const chunks: RoadBbox[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      chunks.push([
        String(Math.max(south, south + row * latitudeStep - CHUNK_OVERLAP_DEGREES)),
        String(Math.min(north, south + (row + 1) * latitudeStep + CHUNK_OVERLAP_DEGREES)),
        String(Math.max(west, west + column * longitudeStep - CHUNK_OVERLAP_DEGREES)),
        String(Math.min(east, west + (column + 1) * longitudeStep + CHUNK_OVERLAP_DEGREES)),
      ]);
    }
  }

  return chunks;
}

/** Fetch every local street required for a city print, regardless of framing. */
export async function fetchDetailedCityRoads(
  bbox: RoadBbox,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const chunks = splitCityRoadBbox(bbox);
  const collections = await Promise.all(chunks.map(async (chunk) => {
    try {
      const response = await fetch('/api/print/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox: chunk, roads: true }),
        signal,
      });
      if (!response.ok) return null;
      return await response.json() as GeoJSON.FeatureCollection;
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  }));

  return {
    type: 'FeatureCollection',
    features: collections.flatMap((collection) => collection?.features ?? []),
  };
}
