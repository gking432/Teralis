import bundledStates from '@/data/us_states_50m.json';

/**
 * Which US state a coordinate actually falls in.
 *
 * A place can arrive from the catalog (`colorado`), from a search result
 * (`place-colorado-united-states`), or from an ad deep link carrying only a
 * bbox. Anything keyed on the slug string alone therefore works for one entry
 * path and silently does nothing for the others — which is exactly how a state
 * print used to lose its state-specific configuration when reached by search.
 *
 * Geography is the one identity every path shares, so resolve by point.
 */
interface BundledState {
  name: string;
  postal: string;
  geometry: GeoJSON.Geometry;
}

const BUNDLED_STATES = bundledStates as unknown as Record<string, BundledState>;

function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function geometryContains(geometry: GeoJSON.Geometry, lng: number, lat: number): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates as unknown as number[][][];
    return ringContains(outer, lng, lat) && !holes.some((hole) => ringContains(hole, lng, lat));
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as unknown as number[][][][]).some(([outer, ...holes]) =>
      ringContains(outer, lng, lat) && !holes.some((hole) => ringContains(hole, lng, lat)));
  }
  return false;
}

/** The canonical state slug containing this point, or null outside the US. */
export function stateSlugAt(center: [number, number] | undefined | null): string | null {
  if (!center) return null;
  const [lng, lat] = center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  for (const [slug, state] of Object.entries(BUNDLED_STATES)) {
    if (geometryContains(state.geometry, lng, lat)) return slug;
  }
  return null;
}

export function bundledStateName(slug: string): string | null {
  return BUNDLED_STATES[slug]?.name ?? null;
}

function slugifyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The state a searched place refers to.
 *
 * A bbox centre is not enough on its own: Michigan's centre is in Lake
 * Michigan, Florida's is in the Gulf, Maryland's is in Chesapeake Bay, and
 * Hawaii's is open ocean — so a point test alone silently failed for exactly
 * the states people search most. Try the name the customer typed, then the
 * centre, then sample the box.
 */
export function stateSlugForPlace(input: {
  name?: string | null;
  center?: [number, number] | null;
  bbox?: [number, number, number, number] | null;
}): string | null {
  const named = input.name ? slugifyName(input.name) : '';
  if (named && BUNDLED_STATES[named]) return named;

  const byPoint = stateSlugAt(input.center);
  if (byPoint) return byPoint;

  if (!input.bbox) return null;
  const [south, north, west, east] = input.bbox;
  const tally = new Map<string, number>();
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const lng = west + ((east - west) * i) / steps;
      const lat = south + ((north - south) * j) / steps;
      const hit = stateSlugAt([lng, lat]);
      if (hit) tally.set(hit, (tally.get(hit) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [slug, count] of tally) {
    if (count > bestCount) { best = slug; bestCount = count; }
  }
  return best;
}
