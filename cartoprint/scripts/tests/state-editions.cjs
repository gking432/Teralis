const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch();
 const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 const base = process.env.TERRALIS_TEST_URL || 'http://localhost:3000';
 const scene = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('teralis:print-scene')));
 const ready = () => page.getByRole('button', { name: 'Choose size & frame', exact: true }).waitFor().then(() => page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Choose size & frame' && !b.disabled), {}, { timeout: 90000 }));
 await page.goto(`${base}/maps/wisconsin?edition=detailed`); await ready();
 assert.equal((await scene()).region.theme, 'detailed');
 assert.equal(await page.getByRole('region', { name: 'State editions' }).locator('> div > button').count(), 3);
 await page.getByRole('searchbox', { name: 'Highlight your hometown' }).fill('Madison');
 await page.getByRole('button', { name: 'Madison city', exact: true }).click();
 await page.waitForFunction(() => window.__teralisMap?.getSource('print-hometown')?._data?.features?.[0]?.properties.name === 'Madison');
 await page.getByRole('button', { name: 'Bone', exact: true }).click();
 await page.waitForTimeout(1200);
 assert.equal((await scene()).region.hometown.name, 'Madison');
 await page.screenshot({ path: '/tmp/state-towns-wisconsin.png' });
 await page.getByRole('button', { name: 'Inspect print ↗' }).click();
 const proof = page.getByRole('dialog').getByRole('img'); await proof.waitFor({ timeout: 90000 });
 const url = await proof.getAttribute('src'); fs.writeFileSync('/tmp/state-towns-proof.png', Buffer.from(url.split(',')[1], 'base64'));
 await page.getByRole('button', { name: 'Close', exact: true }).click();
 await page.reload(); await ready(); assert.equal((await scene()).region.hometown.name, 'Madison');
 await page.getByRole('button', { name: /^Terrain Elevation/ }).click(); await ready();
 await page.waitForFunction(() => window.__teralisMap?.getSource('print-hometown')?._data?.features?.length === 0);
 await page.getByRole('button', { name: /^Towns & Terrain Cities/ }).click(); await ready();
 assert.equal((await scene()).region.hometown.name, 'Madison');
 await page.getByRole('button', { name: 'Choose size & frame', exact: true }).click(); await page.waitForURL('**/size?**', { timeout: 90000 });
 assert.equal(await page.getByRole('button', { name: /^Small / }).count(), 0);
 console.log('PASS Wisconsin hometown, palette, proof, reload, edition switching, size handoff');
 for (const [slug, edition] of [['tennessee', 'illustrated'], ['colorado', 'topographic'], ['illinois', 'detailed']]) {
   await page.goto(`${base}/maps/${slug}`); await ready(); assert.equal((await scene()).region.theme, edition);
   if (edition === 'detailed') {
     await page.waitForFunction(() => window.__teralisMap?.queryRenderedFeatures({ layers: ['print-state-atlas-labels'] }).length > 10, {}, { timeout: 60000 });
     await page.screenshot({ path: `/tmp/state-${slug}.png` });
   }
 }
 await page.goto(`${base}/maps/illinois?edition=atlas`); await ready(); assert.equal((await scene()).region.theme, 'detailed');
 await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: '/tmp/state-mobile.png', fullPage: true });
 assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
 assert.deepEqual(errors, []); console.log('PASS state defaults, real Illinois labels, legacy atlas URL, mobile, no runtime errors');
 await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
