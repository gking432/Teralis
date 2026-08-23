type StateDetailBbox = readonly [string, string, string, string];

/** Fetch state-scale geography omitted from low-zoom base map tiles. */
export async function fetchDetailedStateFeatures(
  bbox: StateDetailBbox,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('/api/print/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bbox, stateDetails: true }),
    signal,
  });
  if (!response.ok) throw new Error('Detailed state geography is unavailable.');
  return await response.json() as GeoJSON.FeatureCollection;
}
