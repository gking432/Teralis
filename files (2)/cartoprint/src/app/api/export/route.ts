/**
 * Export API Route
 *
 * Generates a high-resolution map image for print fulfillment.
 * Uses Puppeteer to render the map at 300 DPI in a headless browser.
 *
 * POST /api/export
 * Body: { mapConfig, size, dpi }
 * Returns: { imageUrl }
 *
 * Implementation plan:
 * 1. Receive map configuration (center, zoom, layers, selection, isolation)
 * 2. Spin up headless Chromium via Puppeteer
 * 3. Navigate to /export page with config as query params
 * 4. /export page renders MapLibre at target resolution (e.g., 7200x10800 for 24x36" at 300 DPI)
 * 5. Wait for all tiles to load
 * 6. Take screenshot as PNG
 * 7. Upload to cloud storage (S3 or Supabase Storage)
 * 8. Return the image URL
 *
 * Size calculations at 300 DPI:
 * - 12×16" = 3600 × 4800 px
 * - 18×24" = 5400 × 7200 px
 * - 24×36" = 7200 × 10800 px
 * - 30×40" = 9000 × 12000 px
 */

import { NextRequest, NextResponse } from 'next/server';

// TODO: Install puppeteer (or puppeteer-core + @sparticuz/chromium for serverless)
// import puppeteer from 'puppeteer';

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

    // TODO: Implement server-side rendering
    /*
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', `--window-size=${dimensions.width},${dimensions.height}`],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: dimensions.width, height: dimensions.height, deviceScaleFactor: 1 });

    // Navigate to export page with config
    const configParam = encodeURIComponent(JSON.stringify(mapConfig));
    await page.goto(`${process.env.NEXTAUTH_URL}/export?config=${configParam}`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    // Wait extra time for tiles to load
    await page.waitForTimeout(5000);

    // Screenshot
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();

    // Upload to storage
    // const imageUrl = await uploadToStorage(screenshot, `export-${Date.now()}.png`);
    // return NextResponse.json({ imageUrl });
    */

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
