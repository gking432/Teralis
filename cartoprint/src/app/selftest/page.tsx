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
import { createPrintScene, setFreeViewport, resetFraming, reframe, syncViewport } from '@/lib/print/scene';
import { snapToSlot, titleTypography, defaultTitleDesign, resolveTitleColors } from '@/lib/print/title';
import { buildPlaceCatalogPrint } from '@/lib/catalog/placeFromQuery';

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

    // --- design URL round trip ---
    const encoded = encodeDesign(recentered);
    const decoded = decodeDesign(encoded);
    check('design encodes', Boolean(encoded), `${encoded?.length ?? 0} chars`);
    check('design round-trips look', decoded?.lookId === recentered.lookId);
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
