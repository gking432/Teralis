import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_BASE = process.env.NEXT_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'Terralis/1.0 (https://terralis.com)';

/**
 * Nominatim proxy.
 *
 * Three problems with the previous version:
 *
 * 1. It requested `polygon_geojson=1` for autocomplete. Every keystroke pulled
 *    full boundary polygons — often megabytes — for a dropdown that only shows
 *    a name. Polygons are now fetched lazily, and only for the place that was
 *    actually chosen (`?detail=1`).
 * 2. A single module-global timestamp serialised EVERY request from EVERY
 *    user behind a 1.1 s sleep, so one person typing blocked everyone. Search
 *    results are now cached, so repeat prefixes never reach upstream at all.
 * 3. `resp.json()` was called unconditionally. Nominatim answers rate-limit
 *    and block responses with HTML, so the parse threw and the customer was
 *    shown a raw "SyntaxError: Unexpected end of JSON input".
 */

const MIN_UPSTREAM_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 500;

interface CacheEntry { at: number; body: unknown; }

const cache = new Map<string, CacheEntry>();
let upstreamChain: Promise<unknown> = Promise.resolve();
let lastUpstreamAt = 0;

function readCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency so the map behaves like an LRU.
  cache.delete(key);
  cache.set(key, entry);
  return entry.body;
}

function writeCache(key: string, body: unknown): void {
  cache.set(key, { at: Date.now(), body });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

type UpstreamResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number; reason: string };

/**
 * Serialise upstream calls to respect Nominatim's 1 req/sec policy. Cache hits
 * never enter this queue, so ordinary typing is not gated on it.
 */
async function fetchUpstream(url: string): Promise<UpstreamResult> {
  const run = async (): Promise<UpstreamResult> => {
    const wait = Math.max(0, MIN_UPSTREAM_INTERVAL_MS - (Date.now() - lastUpstreamAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastUpstreamAt = Date.now();

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, reason: `Place search is unavailable (${response.status}).` };
    }

    // Nominatim returns HTML for blocks and rate limits — never assume JSON.
    const text = await response.text();
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, status: 502, reason: 'Place search returned an unexpected response.' };
    }
  };

  const chained: Promise<UpstreamResult> = upstreamChain.then(run, run);
  upstreamChain = chained.catch(() => undefined);
  try {
    return await chained;
  } catch {
    return { ok: false, status: 502, reason: 'Place search could not be reached.' };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const wantsDetail = searchParams.get('detail') === '1';

  if (query) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return NextResponse.json([]);

    const params = new URLSearchParams({
      q: trimmed,
      format: 'jsonv2',
      limit: wantsDetail ? '1' : '8',
      addressdetails: '1',
      'accept-language': 'en',
    });
    // Boundary polygons are large. Only fetch them once a place is chosen.
    if (wantsDetail) params.set('polygon_geojson', '1');

    const key = `s:${wantsDetail ? 'd' : 'l'}:${trimmed.toLowerCase()}`;
    const cached = readCache(key);
    if (cached) return NextResponse.json(cached);

    const result = await fetchUpstream(`${NOMINATIM_BASE}/search?${params}`);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }
    writeCache(key, result.body);
    return NextResponse.json(result.body);
  }

  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const zoom = searchParams.get('z') || '8';

  if (lat && lng) {
    const params = new URLSearchParams({
      lat,
      lon: lng,
      format: 'jsonv2',
      zoom,
      'accept-language': 'en',
    });
    if (wantsDetail) params.set('polygon_geojson', '1');

    const key = `r:${wantsDetail ? 'd' : 'l'}:${lat},${lng},${zoom}`;
    const cached = readCache(key);
    if (cached) return NextResponse.json(cached);

    const result = await fetchUpstream(`${NOMINATIM_BASE}/reverse?${params}`);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }
    writeCache(key, result.body);
    return NextResponse.json(result.body);
  }

  return NextResponse.json({ error: 'Missing q or lat/lng parameters' }, { status: 400 });
}
