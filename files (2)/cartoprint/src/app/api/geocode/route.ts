/**
 * Geocode API Route
 *
 * Proxies Nominatim requests to enforce rate limiting (1 req/sec).
 * This prevents our users from accidentally violating Nominatim's usage policy.
 *
 * GET /api/geocode?q=Wisconsin              → search
 * GET /api/geocode?lat=43.07&lng=-89.4&z=8  → reverse geocode
 */

import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_BASE = process.env.NEXT_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

// Simple in-memory rate limiter (1 req/sec global)
let lastRequest = 0;
const MIN_INTERVAL = 1100; // 1.1 seconds between requests

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastRequest));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequest = Date.now();

  return fetch(url, {
    headers: { 'User-Agent': 'CartoPrint/1.0 (https://cartoprint.com)' },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Search mode
  const query = searchParams.get('q');
  if (query) {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '5',
      polygon_geojson: '1',
    });

    const resp = await rateLimitedFetch(`${NOMINATIM_BASE}/search?${params}`);
    const data = await resp.json();
    return NextResponse.json(data);
  }

  // Reverse geocode mode
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const zoom = searchParams.get('z') || '8';

  if (lat && lng) {
    const params = new URLSearchParams({
      lat,
      lon: lng,
      format: 'json',
      zoom,
      polygon_geojson: '1',
    });

    const resp = await rateLimitedFetch(`${NOMINATIM_BASE}/reverse?${params}`);
    const data = await resp.json();
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Missing q or lat/lng parameters' }, { status: 400 });
}
