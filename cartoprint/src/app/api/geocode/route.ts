import { NextRequest, NextResponse } from 'next/server';

const NOMINATIM_BASE = process.env.NEXT_PUBLIC_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

let lastRequest = 0;
const MIN_INTERVAL = 1100;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastRequest));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequest = Date.now();

  return fetch(url, {
    headers: { 'User-Agent': 'Terralis/1.0 (https://terralis.com)' },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

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
