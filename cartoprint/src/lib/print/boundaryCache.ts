'use client';

type Geometry = GeoJSON.Geometry;

interface BoundaryRecord {
  geometry: Geometry;
  bbox: [string, string, string, string] | null;
}

interface CacheEntry {
  promise: Promise<BoundaryRecord | null>;
  result?: BoundaryRecord | null;
}

const STORAGE_PREFIX = 'terralis:boundary:v1:';
const memCache = new Map<string, CacheEntry>();

function readStored(slug: string): BoundaryRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoundaryRecord;
    if (!parsed?.geometry) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(slug: string, record: BoundaryRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify(record));
  } catch {
    // quota exceeded — ignore
  }
}

export function getCachedBoundary(slug: string): BoundaryRecord | null {
  const mem = memCache.get(slug);
  if (mem?.result !== undefined) return mem.result;
  const stored = readStored(slug);
  if (stored) {
    memCache.set(slug, { promise: Promise.resolve(stored), result: stored });
  }
  return stored;
}

export function fetchBoundary(
  slug: string,
  center: [number, number],
  level: 'country' | 'state' | 'city'
): Promise<BoundaryRecord | null> {
  const existing = memCache.get(slug);
  if (existing) return existing.promise;

  const stored = readStored(slug);
  if (stored) {
    const promise = Promise.resolve(stored);
    memCache.set(slug, { promise, result: stored });
    return promise;
  }

  const params = new URLSearchParams({
    lat: center[1].toString(),
    lng: center[0].toString(),
    level,
  });

  const promise = fetch(`/api/boundary/resolve?${params}`)
    .then(async (resp): Promise<BoundaryRecord | null> => {
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data?.geometry) return null;
      const record: BoundaryRecord = { geometry: data.geometry, bbox: data.bbox ?? null };
      writeStored(slug, record);
      return record;
    })
    .catch(() => null)
    .then((result) => {
      const entry = memCache.get(slug);
      if (entry) entry.result = result;
      return result;
    });

  memCache.set(slug, { promise });
  return promise;
}
