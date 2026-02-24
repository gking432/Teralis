import { NextRequest, NextResponse } from 'next/server';

const SIZE_TO_PIXELS: Record<string, { width: number; height: number }> = {
  '12x16': { width: 3600, height: 4800 },
  '18x24': { width: 5400, height: 7200 },
  '24x36': { width: 7200, height: 10800 },
  '30x40': { width: 9000, height: 12000 },
};

export async function POST(request: NextRequest) {
  try {
    const { mapConfig, size = '18x24', dpi = 300 } = await request.json();
    const dimensions = SIZE_TO_PIXELS[size] || SIZE_TO_PIXELS['18x24'];

    // Puppeteer-based high-res export — implementation pending
    return NextResponse.json({
      message: 'Export API stub — Puppeteer integration pending',
      dimensions,
      dpi,
    });
  } catch (error) {
    console.error('Export failed:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
