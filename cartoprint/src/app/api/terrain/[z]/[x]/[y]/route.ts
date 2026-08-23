import { NextRequest, NextResponse } from 'next/server';

const TERRARIUM_ORIGIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

function tileCoordinate(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < max ? parsed : null;
}

/** Same-origin, cacheable access to the global Terrarium elevation dataset. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { z: string; x: string; y: string } },
) {
  const zoom = tileCoordinate(params.z, 16);
  if (zoom === null) return NextResponse.json({ error: 'Invalid terrain zoom.' }, { status: 400 });

  const tilesAtZoom = 2 ** zoom;
  const x = tileCoordinate(params.x, tilesAtZoom);
  const y = tileCoordinate(params.y, tilesAtZoom);
  if (x === null || y === null) {
    return NextResponse.json({ error: 'Invalid terrain tile.' }, { status: 400 });
  }

  const response = await fetch(`${TERRARIUM_ORIGIN}/${zoom}/${x}/${y}.png`, {
    next: { revalidate: 86400 },
  });
  if (!response.ok) return new NextResponse(null, { status: response.status });

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
    },
  });
}
