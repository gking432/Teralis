#!/usr/bin/env node
/**
 * Pre-generate static thumbnail PNGs for every catalog print.
 *
 * Usage:
 *   1. Start the dev server:  npm run dev
 *   2. In another terminal:   node scripts/gen-thumbnails.mjs
 *   3. Commit the results:    git add public/thumbnails && git commit -m "regen thumbnails"
 *
 * Options:
 *   --base=http://localhost:3000   Next.js base URL (default: http://localhost:3000)
 *   --only=texas,california        Comma-separated list of slugs to regenerate
 *   --concurrency=2                How many renders to run in parallel (default: 2)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/thumbnails');
mkdirSync(OUT_DIR, { recursive: true });

// Parse CLI flags
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const BASE = (args.base || 'http://localhost:3000').replace(/\/$/, '');
const CONCURRENCY = Math.max(1, parseInt(args.concurrency || '2', 10));

const ALL_SLUGS = [
  'united-states',
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new-hampshire','new-jersey','new-mexico','new-york','north-carolina',
  'north-dakota','ohio','oklahoma','oregon','pennsylvania','rhode-island',
  'south-carolina','south-dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west-virginia','wisconsin','wyoming',
  'district-of-columbia',
];

const slugs = args.only
  ? args.only.split(',').map(s => s.trim()).filter(Boolean)
  : ALL_SLUGS;

console.log(`Generating ${slugs.length} thumbnails (concurrency ${CONCURRENCY}) from ${BASE}\n`);

// Render a single slug in a Playwright page. Returns the PNG buffer.
async function renderSlug(browser, slug) {
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 820, height: 1100 });
    await page.goto(`${BASE}/thumbnail-render?slug=${slug}`, { waitUntil: 'networkidle', timeout: 10000 });

    // Wait for either the result img or an error marker (max 45s for tile loading)
    await page.waitForSelector('#render-result, #render-error', { timeout: 45000 });

    const errEl = await page.$('#render-error');
    if (errEl) {
      const msg = await errEl.getAttribute('data-error');
      throw new Error(`render-error: ${msg}`);
    }

    const src = await page.$eval('#render-result', el => el.src);
    if (!src?.startsWith('data:image/png;base64,')) {
      throw new Error('unexpected src format');
    }

    const base64 = src.replace('data:image/png;base64,', '');
    return Buffer.from(base64, 'base64');
  } finally {
    await page.close();
  }
}

// Simple concurrency pool
async function pool(items, concurrency, fn) {
  const results = [];
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

const browser = await chromium.launch({ headless: true });
let ok = 0;
let fail = 0;

try {
  await pool(slugs, CONCURRENCY, async (slug) => {
    const start = Date.now();
    try {
      const buf = await renderSlug(browser, slug);
      const outPath = resolve(OUT_DIR, `${slug}.png`);
      writeFileSync(outPath, buf);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ✓  ${slug.padEnd(24)} ${buf.length.toLocaleString()} bytes  ${elapsed}s`);
      ok++;
    } catch (err) {
      console.error(`  ✗  ${slug.padEnd(24)} ${err.message}`);
      fail++;
    }
  });
} finally {
  await browser.close();
}

console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
if (fail > 0) {
  console.log('Re-run with --only=slug1,slug2 to retry failures.');
  process.exit(1);
}
