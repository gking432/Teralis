'use client';

/**
 * Development-only checks for the print maths.
 *
 * The project has no test runner configured, and the pieces most likely to
 * break silently — framing round trips, print geometry, stroke scaling,
 * contrast guards, title snapping, and design serialisation — are all pure
 * functions. Running them through the app's own bundler keeps them honest
 * without adding a toolchain. Visit /selftest in `npm run dev`.
 */

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import {
  viewportForRadius,
  radiusForViewport,
  radiusForPlaceBbox,
  framingPresets,
  radiusFromSlider,
  sliderFromRadius,
} from '@/lib/print/framing';
import { printGeometry } from '@/lib/print/geometry';
import { strokeScaleFor, scaledWidth, STROKE_CURVES, STROKE_REFERENCE_WIDTH } from '@/lib/print/strokes';
import { checkPalette, contrastRatio, makePrintable } from '@/lib/print/contrast';
import { encodeDesign, decodeDesign } from '@/lib/print/designUrl';
import { createPrintScene, setFreeViewport, resetFraming, reframe, syncViewport, sceneDensity } from '@/lib/print/scene';
import {
  resolveDensity,
  smallestSizeForEveryTown,
  everyStreetIsRenderable,
  maxRadiusForEveryStreet,
  type DetailBias,
} from '@/lib/print/density';
import {
  zoomForLonSpan,
  supersampleFactor,
  DENSE_ROAD_TILE_ZOOM,
} from '@/lib/print/tileZoom';
import { exportWidthForSize, type SizeLabel } from '@/lib/print/sizeCatalog';
import { snapToSlot, titleTypography, defaultTitleDesign, resolveTitleColors } from '@/lib/print/title';
import { buildPlaceCatalogPrint } from '@/lib/catalog/placeFromQuery';
import { applyLayout, applyPalette } from '@/lib/print/scene';
import { getLayout } from '@/lib/print/layouts';
import { getPalette } from '@/lib/print/palettes';
import { findWaterPlacement } from '@/lib/print/waterPlacement';

function approx(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= Math.abs(b) * tolerance + 1e-9;
}

export default function SelfTest() {
  const [lines, setLines] = useState<string[]>([]);

  if (process.env.NODE_ENV === 'production') notFound();

  useEffect(() => {
    const out: string[] = [];
    const check = (name: string, pass: boolean, detail = '') => {
      out.push(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    };

    // --- framing round trip ---
    const center: [number, number] = [-89.4012, 43.0731];
    for (const ratio of [4 / 3, 3 / 4, 1]) {
      for (const miles of [1, 8, 50, 400]) {
        const vp = viewportForRadius(center, miles, ratio);
        const back = radiusForViewport(vp, ratio);
        check(`radius round-trip r=${miles} ratio=${ratio.toFixed(2)}`, approx(back, miles), `got ${back.toFixed(3)}`);
      }
    }

    // The radius always describes the SHORT side. Degrees are not comparable
    // across axes at this latitude, so compare in miles.
    const MI_PER_LAT = 69;
    const miPerLon = 69 * Math.cos((center[1] * Math.PI) / 180);
    const spanMiles = (vp: ReturnType<typeof viewportForRadius>) => ({
      w: (Number(vp.bbox[3]) - Number(vp.bbox[2])) * miPerLon,
      h: (Number(vp.bbox[1]) - Number(vp.bbox[0])) * MI_PER_LAT,
    });
    const p = spanMiles(viewportForRadius(center, 10, 4 / 3));
    const l = spanMiles(viewportForRadius(center, 10, 3 / 4));
    check('portrait short side is width', p.w < p.h, `${p.w.toFixed(1)} x ${p.h.toFixed(1)} mi`);
    check('landscape short side is height', l.h < l.w, `${l.w.toFixed(1)} x ${l.h.toFixed(1)} mi`);
    check('radius = half the short side', approx(p.w / 2, 10) && approx(l.h / 2, 10));

    // --- presets are round ladder values bracketing the place ---
    const madisonRadius = radiusForPlaceBbox(['43.0', '43.15', '-89.55', '-89.25']);
    const presets = framingPresets(madisonRadius);
    check('4 presets', presets.length === 4, presets.map((p) => p.label).join(' / '));
    check('presets ascend', presets.every((p, i) => i === 0 || p.miles > presets[i - 1].miles));
    const mid = radiusFromSlider(sliderFromRadius(7, presets), presets);
    check('slider round-trip', approx(mid, 7, 0.05), `got ${mid.toFixed(2)}`);

    // --- geometry: border + title band change the map ratio ---
    const title = defaultTitleDesign('Madison', 'Wisconsin', '');
    const plain = printGeometry('portrait', 'none', { enabled: false, slot: 'footer' });
    const withBand = printGeometry('portrait', 'none', title);
    const withBorder = printGeometry('portrait', 'thick', title);
    check('no band => full sheet', approx(plain.mapRect.h, 1) && approx(plain.mapRect.w, 1));
    check('footer band reserves height', withBand.mapRect.h < plain.mapRect.h, `${withBand.mapRect.h.toFixed(3)}`);
    check('border insets map', withBorder.mapRect.w < withBand.mapRect.w);
    check('map ratio differs from sheet ratio when bordered',
      !approx(withBorder.mapRatio, withBorder.ratio, 0.001),
      `map ${withBorder.mapRatio.toFixed(3)} vs sheet ${withBorder.ratio.toFixed(3)}`);

    // --- stroke scaling: preview and export must agree ---
    const preview = strokeScaleFor(900);
    const exportScale = strokeScaleFor(3600);
    const refScale = strokeScaleFor(STROKE_REFERENCE_WIDTH);
    check('reference scale is identity', refScale.widthScale === 1 && refScale.zoomOffset === 0);
    // A canvas W fitting the same bbox sits at z_ref + log2(W/ref); the curve is
    // shifted by the same amount, so relative stroke weight is preserved.
    const relPreview = (preview.widthScale) / 900;
    const relExport = (exportScale.widthScale) / 3600;
    check('relative stroke weight constant across sizes', approx(relPreview, relExport, 0.001),
      `${relPreview.toExponential(3)} vs ${relExport.toExponential(3)}`);
    const expr = scaledWidth(STROKE_CURVES.highway, exportScale) as unknown[];
    check('scaled stops shift by zoomOffset',
      approx(expr[3] as number, STROKE_CURVES.highway[0][0] + exportScale.zoomOffset, 0.001),
      String(expr[3]));

    // --- contrast guard ---
    check('white on white is unprintable',
      checkPalette({ land: '#ffffff', water: '#fafafa', roads: '#fdfdfd' }).verdict === 'unprintable');
    check('navy on white is good',
      checkPalette({ land: '#ffffff', water: '#0a2342', roads: '#0a2342' }).verdict === 'good');
    const fixed = makePrintable('#fdfdfd', '#ffffff');
    check('makePrintable raises contrast', contrastRatio(fixed, '#ffffff') >= 4, `${fixed}`);

    // --- title snapping ---
    const nearFooter = snapToSlot({ x: 0.01, y: 0.86, w: 1, h: 0.125 });
    const middle = snapToSlot({ x: 0.4, y: 0.4, w: 0.3, h: 0.1 });
    check('drag near footer snaps', nearFooter.slot === 'footer', nearFooter.slot);
    check('drag in open space stays free', middle.slot === 'free', middle.slot);

    // --- title colors are derived safely on dark paper ---
    const onDark = resolveTitleColors(
      { ...title, panel: 'none' },
      { land: '#0b0f14', water: '#161c22', roads: '#f2f2ee' },
    );
    check('auto title text readable on dark paper', contrastRatio(onDark.text, '#0b0f14') >= 4.5,
      `${onDark.text} ratio ${contrastRatio(onDark.text, '#0b0f14').toFixed(2)}`);

    // --- typography fits long titles ---
    const shortFit = titleTypography(title, 800, 100);
    const longFit = titleTypography({ ...title, text: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch' }, 800, 100);
    check('long title is scaled down', longFit.fitScale < shortFit.fitScale && longFit.fitScale > 0,
      `${longFit.fitScale.toFixed(3)} vs ${shortFit.fitScale.toFixed(3)}`);

    // --- scene: pan marks custom, recenter restores ---
    const print = buildPlaceCatalogPrint({
      name: 'Madison',
      displayName: 'Madison, Dane County, Wisconsin',
      kind: 'city',
      bbox: [43.0, 43.15, -89.55, -89.25],
      center,
    });
    const scene = createPrintScene(print, 'portrait');
    check('new scene is not custom', scene.freeViewport === false);
    check('new scene radius = place radius', approx(scene.radiusMiles, scene.place.placeRadiusMiles));

    const panned = setFreeViewport(scene, viewportForRadius([-89.2, 43.2], 4, 4 / 3), 4);
    check('pan marks custom', panned.freeViewport === true);
    check('syncViewport leaves a custom view alone',
      syncViewport(panned).viewport.bbox.join() === panned.viewport.bbox.join());

    const recentered = resetFraming(panned);
    check('recenter clears custom', recentered.freeViewport === false);
    check('recenter returns to the place', approx(recentered.focus[0], center[0], 0.0001));
    check('recenter restores place radius', approx(recentered.radiusMiles, scene.place.placeRadiusMiles));

    // reframe after a pan keeps the user's position
    const rf = reframe(panned, 20);
    check('reframe keeps panned centre', approx(rf.focus[0], -89.2, 0.0001), String(rf.focus[0]));

    // orientation change keeps the radius meaning
    const land = syncViewport({ ...scene, orientation: 'landscape' });
    const landRadius = radiusForViewport(land.viewport, printGeometry('landscape', land.detail.border, land.title).mapRatio);
    check('orientation change preserves radius', approx(landRadius, scene.radiusMiles, 0.03),
      `${landRadius.toFixed(2)} vs ${scene.radiusMiles.toFixed(2)}`);

    // --- density: what a sheet can actually carry ---
    const den = (kind: 'city' | 'state' | 'country', radius: number, size: SizeLabel, bias: DetailBias = 0) =>
      resolveDensity({ kind, radiusMiles: radius, size, orientation: 'portrait', bias });

    // A city framed at its own extent must show every street on ANY paper size.
    for (const size of ['small', 'medium', 'large', 'xlarge'] as SizeLabel[]) {
      const d = den('city', 8, size);
      check(`city 8mi on ${size} = every street`, d.everyStreet, `${d.milesPerInch.toFixed(2)} mi/in`);
    }
    // Even a sprawling city bbox still qualifies.
    check('city 25mi on small = every street', den('city', 25, 'small').everyStreet,
      `${den('city', 25, 'small').milesPerInch.toFixed(2)} mi/in`);
    // But a whole metro at 80mi genuinely cannot, at any size.
    check('city 80mi on xlarge is NOT every street', !den('city', 80, 'xlarge').everyStreet);
    check('city 80mi still shows main roads', den('city', 80, 'xlarge').roads === 'neutral');

    // A state shows every town only once the paper is big enough.
    check('state 150mi on small is not every town', !den('state', 150, 'small').everyTown,
      `${den('state', 150, 'small').milesPerInch.toFixed(1)} mi/in`);
    check('state 150mi on large IS every town', den('state', 150, 'large').everyTown,
      `${den('state', 150, 'large').milesPerInch.toFixed(1)} mi/in`);
    check('state 150mi on xlarge IS every town', den('state', 150, 'xlarge').everyTown);
    check('state never shows residential streets', den('state', 150, 'xlarge').roads !== 'more');
    check('a huge state on xlarge is not every town', !den('state', 400, 'xlarge').everyTown);

    // Cities carry no place labels — the title block names them.
    check('city print has no place labels', den('city', 8, 'medium').places === 'none');
    // Country prints drop roads.
    check('country drops roads', den('country', 1400, 'xlarge').roads === 'none');

    // Bias nudges one rung, and cannot make a dense frame unreadable.
    check('cleaner bias steps down', den('city', 8, 'medium', -1).roads === 'neutral');
    check('maximum bias cannot exceed every street', den('city', 8, 'medium', 1).roads === 'more');
    check('maximum bias on a wide frame stays legible',
      den('city', 200, 'small', 1).roads !== 'more');

    // The upsell hint only fires when a bigger sheet really would cross over.
    check('smallestSizeForEveryTown finds a size for 150mi',
      smallestSizeForEveryTown(150, 'portrait') === 'large',
      String(smallestSizeForEveryTown(150, 'portrait')));
    check('smallestSizeForEveryTown gives up on 400mi',
      smallestSizeForEveryTown(400, 'portrait') === null);

    // Density is derived, so reframing changes it without any user action.
    const wide = reframe(scene, 120);
    const tight = reframe(scene, 5);
    check('reframing wide drops every street', !sceneDensity(wide).everyStreet);
    check('reframing tight restores every street', sceneDensity(tight).everyStreet);
    // ...and so does changing the paper.
    const stateScene = { ...scene, place: { ...scene.place, kind: 'state' as const }, radiusMiles: 150 };
    check('bigger paper alone unlocks every town',
      !sceneDensity({ ...stateScene, size: 'small' }).everyTown &&
      sceneDensity({ ...stateScene, size: 'large' }).everyTown);

    // --- tile zoom: the detail has to EXIST in the tiles, not just be enabled ---
    // Ground truth measured from a live map: a canvas 1076 CSS px wide showing
    // a 0.30002 degree span reports getZoom() === 11.30, and a camera at 12.2
    // requests /12/ tiles while 11.81 requests /11/.
    check('zoom formula matches a real map', approx(zoomForLonSpan(0.30002, 1076), 11.30, 0.001),
      zoomForLonSpan(0.30002, 1076).toFixed(3));
    check('doubling canvas adds one zoom level',
      approx(zoomForLonSpan(0.3, 2152) - zoomForLonSpan(0.3, 1076), 1, 0.001));

    // Supersampling must actually clear the tile boundary, not merely approach it.
    const MADISON_SPAN = 0.3;
    const CHICAGO_SPAN = 0.5104;
    for (const [label, span, display] of [
      ['Madison desktop', MADISON_SPAN, 630],
      ['Madison phone', MADISON_SPAN, 344],
      ['Chicago desktop', CHICAGO_SPAN, 630],
    ] as Array<[string, number, number]>) {
      const bbox: [string, string, string, string] = ['0', '0.25', '0', String(span)];
      const factor = supersampleFactor(bbox, display, 'more', display * 1.19);
      const reached = zoomForLonSpan(span, display * factor);
      check(`${label} reaches the dense-road tile`, Math.floor(reached) >= DENSE_ROAD_TILE_ZOOM,
        `z=${reached.toFixed(2)} canvas=${Math.round(display * factor)}px`);
    }

    // Without supersampling those same frames fall short — which is exactly the
    // regression this guards against.
    check('a plain display-sized canvas would MISS the tile',
      Math.floor(zoomForLonSpan(MADISON_SPAN, 630)) < DENSE_ROAD_TILE_ZOOM,
      `z=${zoomForLonSpan(MADISON_SPAN, 630).toFixed(2)}`);

    // The promise must match the pixels: never claim every street for a frame
    // too wide for the tiles.
    check('Madison can render every street', everyStreetIsRenderable(MADISON_SPAN, 'medium', 'portrait'));
    check('Houston at full extent cannot', !everyStreetIsRenderable(0.78, 'medium', 'portrait'));
    check('Houston framed in can', everyStreetIsRenderable(0.40, 'medium', 'portrait'));
    check('resolver drops the claim when tiles cannot supply it',
      resolveDensity({ kind: 'city', radiusMiles: 23.4, size: 'medium', orientation: 'portrait', bias: 0, lonSpanDegrees: 0.78 }).everyStreet === false);
    check('resolver keeps the claim when they can',
      resolveDensity({ kind: 'city', radiusMiles: 8, size: 'medium', orientation: 'portrait', bias: 0, lonSpanDegrees: 0.3 }).everyStreet === true);

    // The advice given for a too-wide frame must actually work.
    const advised = maxRadiusForEveryStreet(29.76, 'medium', 'portrait');
    const advisedSpan = (advised * 2) / (69 * Math.cos((29.76 * Math.PI) / 180));
    check('advised radius does render every street', everyStreetIsRenderable(advisedSpan, 'medium', 'portrait'),
      `${advised.toFixed(1)} mi -> ${advisedSpan.toFixed(3)} deg`);

    // Export resolution follows the finished size at 300 dpi.
    check('export is 300 dpi on the small print', exportWidthForSize('small', 'portrait') === 3600);
    check('export is 300 dpi on the largest print', exportWidthForSize('xlarge', 'portrait') === 9000,
      String(exportWidthForSize('xlarge', 'portrait')));

    // --- layout and colour are independent axes ---
    const withLayout = applyLayout(scene, getLayout('poster'));
    check('layout change leaves colours alone',
      withLayout.colors.land === scene.colors.land && withLayout.colors.roads === scene.colors.roads);
    check('layout change moves the title', withLayout.title.slot === 'footer-tall');

    const withPalette = applyPalette(withLayout, getPalette('noir'));
    check('colour change leaves the layout alone',
      withPalette.title.slot === withLayout.title.slot && withPalette.detail.border === withLayout.detail.border);
    check('colour change repaints', withPalette.colors.land === '#0b0f14');

    // --- on-water title: colours must come from the WATER, not the paper ---
    const onWater = applyLayout(scene, getLayout('on-water'));
    check('on-water layout marks the title', onWater.title.onWater && onWater.title.autoPlaced);
    check('on-water layout uses no panel', onWater.title.panel === 'none');

    const navyWater = { land: '#ffffff', water: '#0a2342', roads: '#0a2342' };
    const overWater = resolveTitleColors(onWater.title, navyWater);
    const overLand = resolveTitleColors({ ...onWater.title, onWater: false }, navyWater);
    check('text on navy water is light', contrastRatio(overWater.text, '#0a2342') >= 4.5,
      `${overWater.text} ratio ${contrastRatio(overWater.text, '#0a2342').toFixed(1)}`);
    check('same words on paper go dark instead', overLand.text !== overWater.text,
      `${overLand.text} vs ${overWater.text}`);
    // The old behaviour: derived from paper, then floated over a lake.
    check('paper-derived text would have vanished on the lake',
      contrastRatio(overLand.text, '#0a2342') < 4.5,
      `ratio ${contrastRatio(overLand.text, '#0a2342').toFixed(1)}`);

    // --- water placement finds the biggest label-shaped patch ---
    // A synthetic frame: land on top, a wide lake across the bottom third.
    const fake = document.createElement('canvas');
    fake.width = 300;
    fake.height = 400;
    const fctx = fake.getContext('2d')!;
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, 300, 400);
    fctx.fillStyle = '#0a2342';
    fctx.fillRect(20, 280, 260, 90);
    const placement = findWaterPlacement(fake, '#0a2342', 4 / 3);
    check('water placement found', Boolean(placement));
    if (placement) {
      const cx = placement.rect.x + placement.rect.w / 2;
      const cy = placement.rect.y + placement.rect.h / 2;
      check('placed inside the lake horizontally', cx > 20 / 300 && cx < 280 / 300, cx.toFixed(3));
      check('placed inside the lake vertically', cy > 280 / 400 && cy < 370 / 400, cy.toFixed(3));
      check('placement is label-shaped', placement.rect.w > placement.rect.h, `${placement.rect.w.toFixed(2)}x${placement.rect.h.toFixed(2)}`);
    }
    // No water at all must report nothing rather than guessing.
    const dry = document.createElement('canvas');
    dry.width = 300; dry.height = 400;
    const dctx = dry.getContext('2d')!;
    dctx.fillStyle = '#ffffff';
    dctx.fillRect(0, 0, 300, 400);
    check('no water reports nothing', findWaterPlacement(dry, '#0a2342', 4 / 3) === null);

    // --- design URL round trip ---
    const encoded = encodeDesign(recentered);
    const decoded = decodeDesign(encoded);
    check('design encodes', Boolean(encoded), `${encoded?.length ?? 0} chars`);
    check('design round-trips layout', decoded?.layoutId === recentered.layoutId);
    check('design round-trips palette', decoded?.paletteId === recentered.paletteId);
    check('design round-trips title', decoded?.title.text === recentered.title.text);
    check('design round-trips viewport', decoded?.viewport.bbox.join() === recentered.viewport.bbox.join());
    check('design round-trips detail', decoded?.detail.border === recentered.detail.border);

    setLines(out);
  }, []);

  const failed = lines.filter((line) => line.startsWith('FAIL'));

  return (
    <pre id="selftest" data-done={lines.length > 0} data-failed={failed.length}>
      {lines.join('\n')}
    </pre>
  );
}
