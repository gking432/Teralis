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
  radiusForPlaceBboxAtRatio,
  framingPresets,
  radiusFromSlider,
  sliderFromRadius,
} from '@/lib/print/framing';
import { printGeometry } from '@/lib/print/geometry';
import { strokeScaleFor, scaledWidth, STROKE_CURVES, STROKE_REFERENCE_WIDTH } from '@/lib/print/strokes';
import { checkPalette, contrastRatio, makePrintable } from '@/lib/print/contrast';
import { checkPrintReadiness } from '@/lib/print/readiness';
import { encodeDesign, decodeDesign } from '@/lib/print/designUrl';
import {
  createPrintScene,
  minimumStateRadius,
  normalizeScene,
  setFreeViewport,
  resetFraming,
  reframe,
  syncViewport,
  sceneDensity,
} from '@/lib/print/scene';
import {
  resolveDensity,
  type DetailBias,
} from '@/lib/print/density';
import {
  zoomForLonSpan,
  supersampleFactor,
  DENSE_ROAD_TILE_ZOOM,
} from '@/lib/print/tileZoom';
import { buildPrintLayerState } from '@/lib/print/printRender';
import { exportWidthForSize, type SizeLabel } from '@/lib/print/sizeCatalog';
import { createPersonalDecoration, layoutDecorations } from '@/lib/print/decorations';
import {
  applyRegionTheme,
  hillshadeExaggeration,
  REGION_DETAIL_LEVELS,
} from '@/lib/print/regionDesign';
import {
  printableTitleTextColor,
  resolveTitleColors,
  snapToSlot,
  swappedTitleColors,
  titleTypography,
  defaultTitleDesign,
} from '@/lib/print/title';
import { decorationSheetPosition } from '@/lib/print/decorations';
import { buildPlaceCatalogPrint, placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { getCatalogPrint, getCityCatalogPrint, getCityCatalogPrints, getStateCatalogPrints, getFeaturedCatalogPrint } from '@/lib/catalog/prints';
import {
  STATE_COLLECTION_DESIGNS,
  designsForState,
  sceneForCollectionDesign,
} from '@/lib/catalog/stateCollection';
import { applyLayout, applyPalette, applyRegionDesign } from '@/lib/print/scene';
import { getLayout } from '@/lib/print/layouts';
import { getPalette } from '@/lib/print/palettes';
import { CITY_PRODUCT_PALETTES, createCityProductScene } from '@/lib/catalog/cityProduct';
import { findWaterPlacement } from '@/lib/print/waterPlacement';
import { splitCityRoadBbox } from '@/lib/print/cityRoads';
import {
  MAX_STATE_DETAIL_TILES,
  stateDetailTileCount,
  stateDetailZoomForBbox,
} from '@/lib/print/stateDetails';

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
    check('3 presets', presets.length === 3, presets.map((p) => p.label).join(' / '));
    check('presets ascend', presets.every((p, i) => i === 0 || p.miles > presets[i - 1].miles));
    const mid = radiusFromSlider(sliderFromRadius(7, presets), presets);
    check('slider round-trip', approx(mid, 7, 0.05), `got ${mid.toFixed(2)}`);

    // --- geometry: border + title band change the map ratio ---
    const title = { ...defaultTitleDesign('Madison', 'Wisconsin', ''), enabled: true };
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

    const solidTitle = {
      ...title,
      panel: 'solid' as const,
      textColor: '#173f35',
      panelColor: '#f4ead7',
    };
    const swapped = swappedTitleColors(solidTitle, {
      land: '#ffffff', water: '#53616f', roads: '#53616f',
    });
    check('label color swap exchanges visible colors',
      swapped.textColor === '#f4ead7' && swapped.panelColor === '#173f35',
      `${swapped.textColor} on ${swapped.panelColor}`);
    const safeManualTitle = printableTitleTextColor(
      { ...solidTitle, panelColor: '#ffffff' },
      { land: '#ffffff', water: '#53616f', roads: '#53616f' },
      '#fefefe',
    );
    check('manual label color becomes visibly print-safe',
      safeManualTitle !== '#fefefe' && contrastRatio(safeManualTitle, '#ffffff') >= 4,
      `${safeManualTitle} ratio ${contrastRatio(safeManualTitle, '#ffffff').toFixed(2)}`);

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
    check('new scene starts without a label', scene.title.enabled === false);
    check('new scene starts slate on white',
      scene.colors.land === '#ffffff'
      && scene.colors.roads === '#53616f'
      && scene.colors.water === '#53616f');
    check('new scene radius uses the whole-city preset',
      approx(scene.radiusMiles, framingPresets(scene.place.placeRadiusMiles, 'city')[1].miles));

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
    check('city 80mi still keeps every street', den('city', 80, 'xlarge').everyStreet);

    // The physical-density resolver leaves state labels to the chosen edition.
    check('state small omits place names', den('state', 150, 'small').places === 'none');
    check('state large still omits place names', den('state', 150, 'large').places === 'none');
    check('state maximum still omits place names', den('state', 150, 'xlarge', 1).places === 'none');
    check('state clean removes every road', den('state', 150, 'medium', -1).roads === 'none');
    check('state detailed shows main roads', den('state', 150, 'medium').roads === 'neutral');
    check('state more detailed increases road density', den('state', 150, 'medium', 1).roads === 'more');
    const stateLayers = buildPrintLayerState('state', {
      ...scene.detail,
      places: 'more',
      labels: { ...scene.detail.labels, cities: true, towns: true },
    });
    check('state layer gate always suppresses city and town labels',
      !stateLayers.capitals && !stateLayers.cities && !stateLayers.towns && !stateLayers.statelabels);
    check('state more detailed layer increases road density',
      buildPrintLayerState('state', { ...scene.detail, roads: 'more' }).allroads === true);

    // Cities carry no place labels — the title block names them.
    check('city print has no place labels', den('city', 8, 'medium').places === 'none');
    // Country prints drop roads.
    check('country drops roads', den('country', 1400, 'xlarge').roads === 'none');

    // No style or density bias may remove streets from a city.
    check('cleaner bias keeps every city street', den('city', 8, 'medium', -1).roads === 'more');
    check('maximum bias cannot exceed every street', den('city', 8, 'medium', 1).roads === 'more');
    check('wide city frame keeps every street', den('city', 200, 'small', 1).roads === 'more');
    check('city layer state overrides stale lower-road settings',
      buildPrintLayerState('city', { ...scene.detail, roads: 'none' }).allroads === true);

    // City streets survive reframing; state place labels remain absent.
    const wide = reframe(scene, 120);
    const tight = reframe(scene, 5);
    check('reframing wide keeps every street', sceneDensity(wide).everyStreet);
    check('reframing tight restores every street', sceneDensity(tight).everyStreet);
    const stateScene = { ...scene, place: { ...scene.place, kind: 'state' as const }, radiusMiles: 150 };
    check('paper size never turns state names back on',
      sceneDensity({ ...stateScene, size: 'small' }).places === 'none' &&
      sceneDensity({ ...stateScene, size: 'large' }).places === 'none');

    const wisconsinBbox: [string, string, string, string] = ['42.491', '47.08', '-92.889', '-86.805'];
    const wisconsinRadius = radiusForPlaceBboxAtRatio(wisconsinBbox, 4 / 3) * 1.06;
    const wisconsinViewport = viewportForRadius([-89.847, 44.786], wisconsinRadius, 4 / 3);
    const stateHeight = Number(wisconsinBbox[1]) - Number(wisconsinBbox[0]);
    const frameHeight = Number(wisconsinViewport.bbox[1]) - Number(wisconsinViewport.bbox[0]);
    check('Wisconsin fills a portrait frame without cropping', stateHeight / frameHeight > 0.72,
      `${Math.round((stateHeight / frameHeight) * 100)}% of map height`);

    const wisconsin = createPrintScene(buildPlaceCatalogPrint({
      name: 'Wisconsin',
      displayName: 'Wisconsin, United States',
      kind: 'state',
      bbox: wisconsinBbox.map(Number) as [number, number, number, number],
      center: [-89.847, 44.786],
    }), 'portrait');
    const cleanWisconsin = normalizeScene({ ...wisconsin, detailBias: -1 });
    const denseWisconsin = normalizeScene({ ...wisconsin, detailBias: 1 });
    check('state detail changes road density',
      cleanWisconsin.detail.roads === 'less' && denseWisconsin.detail.roads === 'more');
    check('state detail never adds county structure',
      !cleanWisconsin.detail.counties && !denseWisconsin.detail.counties);
    const titledWisconsin = applyLayout(wisconsin, getLayout('poster'));
    const [safeSouth, safeNorth, safeWest, safeEast] = titledWisconsin.viewport.bbox.map(Number);
    check('adding a state title preserves the whole state',
      safeSouth <= Number(wisconsinBbox[0])
      && safeNorth >= Number(wisconsinBbox[1])
      && safeWest <= Number(wisconsinBbox[2])
      && safeEast >= Number(wisconsinBbox[3]),
      `radius ${titledWisconsin.radiusMiles.toFixed(1)} >= safe ${minimumStateRadius(titledWisconsin).toFixed(1)}`);
    const attemptedStatePan = setFreeViewport(
      wisconsin,
      viewportForRadius([-87, 43], 20, 4 / 3),
      20,
    );
    check('state framing cannot pan away from the subject',
      !attemptedStatePan.freeViewport
      && approx(attemptedStatePan.focus[0], wisconsin.place.center[0], 0.0001));

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

    const denver = createPrintScene(buildPlaceCatalogPrint({
      name: 'Denver',
      displayName: 'Denver, Colorado, United States',
      kind: 'city',
      bbox: [39.6143008, 39.9142087, -105.1098845, -104.5996997],
      center: [-104.984862, 39.7392364],
    }), 'landscape');
    check('Denver scene always requests every street',
      denver.detail.roads === 'more' && sceneDensity(denver).everyStreet);

    const roadChunks = splitCityRoadBbox(['38.88', '40.60', '-105.94', '-104.04']);
    check('wide city roads split below the server tile cap',
      roadChunks.length > 1
      && roadChunks.every(([south, north, west, east]) =>
        Number(north) - Number(south) <= 0.57
        && Number(east) - Number(west) <= 0.77));
    check('road chunks still cover the full print extent',
      Math.min(...roadChunks.map((chunk) => Number(chunk[0]))) === 38.88
      && Math.max(...roadChunks.map((chunk) => Number(chunk[1]))) === 40.60
      && Math.min(...roadChunks.map((chunk) => Number(chunk[2]))) === -105.94
      && Math.max(...roadChunks.map((chunk) => Number(chunk[3]))) === -104.04);

    // Export resolution follows the finished size at 300 dpi.
    check('export is 300 dpi on the small print', exportWidthForSize('small', 'portrait') === 3600);
    check('export is 300 dpi on the largest print', exportWidthForSize('xlarge', 'portrait') === 8400,
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

    // --- the two cartographic editions ---
    // Every region sells the same pair, and each edition must actually differ
    // in what it draws — an edition that renders like the other is not a
    // second product.
    const editionPrint = getCatalogPrint('wisconsin')!;
    const topoScene = sceneForCollectionDesign(editionPrint, STATE_COLLECTION_DESIGNS.find((d) => d.id === 'topographic')!);
    const atlasScene = sceneForCollectionDesign(editionPrint, STATE_COLLECTION_DESIGNS.find((d) => d.id === 'atlas')!);
    check('a region sells exactly two editions',
      STATE_COLLECTION_DESIGNS.map((d) => d.id).join() === 'topographic,atlas');
    check('neither state edition prints town or city names',
      !atlasScene.detail.labels.cities && !atlasScene.detail.labels.towns
        && !topoScene.detail.labels.cities && !topoScene.detail.labels.towns);
    check('the street atlas draws roads and omits rivers and county lines',
      atlasScene.detail.roads !== 'none' && !atlasScene.detail.rivers && !atlasScene.detail.counties);
    check('the topographic edition keeps rivers and drops roads and county lines',
      topoScene.detail.rivers && topoScene.detail.roads === 'none' && !topoScene.detail.counties);
    check('the two editions are visibly different maps',
      atlasScene.detail.roads !== topoScene.detail.roads
        && atlasScene.detail.rivers !== topoScene.detail.rivers);
    check('each edition carries its own typography and palette',
      atlasScene.title.font !== topoScene.title.font && atlasScene.paletteId !== topoScene.paletteId);

    // A graded control that does not change the map is a control that lies.
    check('every Street Atlas detail level keeps place names off',
      REGION_DETAIL_LEVELS.every((detailBias) => {
        const detail = normalizeScene({ ...atlasScene, detailBias }).detail;
        return detail.places === 'none' && !detail.labels.cities && !detail.labels.towns;
      }));
    const roadDensities = REGION_DETAIL_LEVELS.map((detailBias) =>
      normalizeScene({ ...atlasScene, detailBias }).detail.roads);
    check('every Street Atlas detail level changes road density',
      new Set(roadDensities).size === 3, roadDensities.join(' → '));
    check('rivers belong only to the Topographic edition',
      REGION_DETAIL_LEVELS.every((detailBias) =>
        !normalizeScene({ ...atlasScene, detailBias }).detail.rivers
          && normalizeScene({ ...topoScene, detailBias }).detail.rivers));
    check('every Topographic detail level changes relief strength',
      new Set(REGION_DETAIL_LEVELS.map(hillshadeExaggeration)).size === 3);
    // Cities are a different product and stay clean: streets and water, never
    // county lines or a town-name gazetteer.
    const cityAuditScene = createPrintScene(getCityCatalogPrint('madison-wi')!, 'portrait');
    check('city prints stay street-first, with no region furniture',
      !cityAuditScene.detail.counties && !cityAuditScene.detail.labels.towns && cityAuditScene.markers.length === 0);

    // State detail is selected by physical extent, not by a state-specific
    // recipe. Every state stays within the bounded vector-tile budget.
    const stateBboxes = {
      rhodeIsland: ['41.1', '42.1', '-71.9', '-71.1'] as const,
      texas: ['25.8', '36.5', '-106.7', '-93.5'] as const,
      alaska: ['51.2', '71.4', '-179', '-129'] as const,
    };
    const stateZooms = Object.fromEntries(
      Object.entries(stateBboxes).map(([name, bbox]) => [name, stateDetailZoomForBbox(bbox)]),
    );
    check('small states keep maximum geography source detail', stateZooms.rhodeIsland === 9,
      `z${stateZooms.rhodeIsland}`);
    check('large states automatically step down source detail',
      stateZooms.texas < 9 && stateZooms.alaska < stateZooms.texas,
      `Texas z${stateZooms.texas}, Alaska z${stateZooms.alaska}`);
    check('every state detail request stays inside the tile budget',
      Object.entries(stateBboxes).every(([name, bbox]) =>
        stateDetailTileCount(bbox, stateZooms[name]) <= MAX_STATE_DETAIL_TILES));

    // --- the storefront-to-personalizer seam ---
    // The product page sells finished designs; the personalizer opens the
    // exact same scene. One source of truth, so the transition cannot drift:
    // same wording, same fonts, same geography, and no second styling step.
    const wisconsinPrint = getCatalogPrint('wisconsin')!;
    const collectionScenes = STATE_COLLECTION_DESIGNS.map((design) =>
      [design, sceneForCollectionDesign(wisconsinPrint, design)] as const);
    const [leadDesign, leadScene] = collectionScenes[0];
    check('collection sells the two cartographic editions',
      STATE_COLLECTION_DESIGNS.map((design) => design.id).join() === 'topographic,atlas');
    check('storefront scene uses the real state wording',
      leadScene.title.text === 'Wisconsin'
        && leadScene.title.subtitle === "America's Dairyland"
        && leadScene.title.detail === 'EST. 1848');
    check('each collection design carries its own typography',
      new Set(collectionScenes.map(([, scene]) => scene.title.font)).size === collectionScenes.length);
    check('each collection design carries its own palette',
      new Set(collectionScenes.map(([, scene]) => scene.paletteId)).size === collectionScenes.length);
    check('no edition ships markers the customer did not place',
      collectionScenes.every(([, scene]) => scene.markers.length === 0));
    const seamEncoded = encodeDesign(leadScene);
    const seamDecoded = decodeDesign(seamEncoded);
    check('personalize link restores the exact storefront design',
      seamDecoded?.region.theme === leadDesign.id
        && seamDecoded?.title.font === leadDesign.font
        && seamDecoded?.paletteId === leadDesign.palette
        && seamDecoded?.title.subtitle === leadScene.title.subtitle
        && seamDecoded?.viewport.bbox.join() === leadScene.viewport.bbox.join());
    check('the personalize link round-trips edition and detail',
      seamDecoded?.region.theme === leadScene.region.theme
        && seamDecoded?.detailBias === leadScene.detailBias);

    // Every state is a sellable storefront and both editions work everywhere.
    check('every state leads with the topographic edition',
      designsForState('wisconsin')[0]?.id === 'topographic'
        && designsForState('california')[0]?.id === 'topographic'
        && designsForState('delaware')[0]?.id === 'topographic');

    const statePrints = getStateCatalogPrints();
    const stateScenes = statePrints.map((statePrint) =>
      sceneForCollectionDesign(statePrint, designsForState(statePrint.slug)[0]));
    check('every state storefront scene opens with its own wording',
      stateScenes.every((scene, index) =>
        scene.title.enabled
          && scene.title.text === statePrints[index].name
          && scene.title.subtitle === statePrints[index].defaultSubtitle),
      `${statePrints.length} states`);
    check('every state storefront scene keeps the whole state on the sheet',
      stateScenes.every((scene) => !scene.freeViewport
        && scene.radiusMiles >= minimumStateRadius(scene) * 0.999));

    // --- every region audited at once ---
    // Both editions of all 51 states plus the country print, checked on every
    // visit, so a change that helps one map and breaks another is caught here
    // rather than one map at a time.
    const auditRegions = [...statePrints, getFeaturedCatalogPrint()];
    const regionProblems: string[] = [];
    for (const regionPrint of auditRegions) {
      for (const design of designsForState(regionPrint.slug, regionPrint.center)) {
        const regionScene = sceneForCollectionDesign(regionPrint, design);
        const label = `${regionPrint.slug}/${design.id}`;
        if (!checkPrintReadiness(regionScene).ready) regionProblems.push(`${label}: not print-ready`);
        if (regionScene.title.text !== regionPrint.name) regionProblems.push(`${label}: wrong title`);
        if (design.id === 'atlas' && regionScene.detail.roads === 'none') regionProblems.push(`${label}: no roads`);
        if (design.id === 'topographic' && !regionScene.detail.rivers) regionProblems.push(`${label}: no rivers`);
        // Markers belong to the customer; nothing may be placed for them.
        if (regionScene.markers.length > 0) regionProblems.push(`${label}: ships unrequested markers`);
      }
    }
    check('every region renders both editions correctly',
      regionProblems.length === 0,
      regionProblems.slice(0, 4).join(' · ') || `${auditRegions.length} regions × 2 editions`);

    // --- the search path, which is how most customers actually arrive ---
    // A place reached by search used to become `place-colorado-united-states`:
    // a slug nothing recognised, so the print silently lost its regional
    // configuration and showed "United States" instead. Catalog-only
    // coverage never saw it. These build a print the way a search does.
    const searchedColorado = buildPlaceCatalogPrint({
      name: 'Colorado',
      displayName: 'Colorado, United States',
      kind: 'state',
      placeType: 'state',
      bbox: [36.99, 41.0, -109.06, -102.04],
      center: [-105.55, 39.0],
    });
    check('a searched state resolves to its catalog print',
      searchedColorado.slug === 'colorado' && searchedColorado.defaultSubtitle === 'The Centennial State',
      `${searchedColorado.slug} · ${searchedColorado.defaultSubtitle}`);
    const searchedScene = createPrintScene(searchedColorado, 'portrait');
    check('a searched state still draws a complete map',
      searchedScene.detail.roads !== 'none'
        && !searchedScene.detail.labels.cities
        && !searchedScene.detail.labels.towns
        && !searchedScene.detail.rivers,
      `${searchedScene.detail.roads} roads · ${searchedScene.detail.places} places`);

    // The same guarantee for a URL that carries only a bbox, as an ad does.
    const deepLinked = placeFromSearchParams(new URLSearchParams({
      place: 'Michigan',
      kind: 'state',
      type: 'state',
      bbox: '41.696,48.306,-90.418,-82.413',
      center: '-85.6,44.3',
      display: 'Michigan, United States',
    }));
    check('a bbox-only deep link resolves to the same print',
      deepLinked?.slug === 'michigan'
        && !createPrintScene(deepLinked!, 'portrait').detail.labels.cities
        && !createPrintScene(deepLinked!, 'portrait').detail.labels.towns);

    // Whatever the entry path, the same place must produce the same artwork.
    const catalogColorado = createPrintScene(getCatalogPrint('colorado')!, 'portrait');
    check('search and catalog entries produce an identical print',
      searchedScene.region.theme === catalogColorado.region.theme
        && searchedScene.detail.places === catalogColorado.detail.places
        && searchedScene.detail.roads === catalogColorado.detail.roads
        && searchedScene.title.subtitle === catalogColorado.title.subtitle);

    // Markers a customer places must survive an edition change: switching
    // from atlas to topographic is choosing a different map, not discarding
    // their work.
    const withMarker = normalizeScene({
      ...atlasScene,
      markers: [createPersonalDecoration('heart', 0)],
    });
    const switched = applyRegionDesign(withMarker, applyRegionTheme(withMarker.region, 'topographic'));
    check('switching edition keeps the customer’s markers',
      switched.markers.length === 1 && switched.region.theme === 'topographic');
    check('a placed marker actually reaches the page',
      layoutDecorations(withMarker).length === 1);

    check('every state sells both finished editions',
      getStateCatalogPrints().every((statePrint) =>
        designsForState(statePrint.slug, statePrint.center).length === 2));

    // --- the v1 city catalog and colourways ---
    // City prints are the product we advertise, so the catalog has to cover
    // the places ads point at, every page has to sit on the right ground, and
    // every colour has to be printable. These run over the whole catalog.
    const cityPrints = getCityCatalogPrints();
    check('the catalog covers every state with at least one city',
      new Set(cityPrints.map((print) => print.defaultSubtitle)).size >= 50,
      `${cityPrints.length} cities · ${new Set(cityPrints.map((c) => c.defaultSubtitle)).size} states`);
    check('every city page has a unique slug',
      new Set(cityPrints.map((print) => print.slug)).size === cityPrints.length);

    const cityProblems: string[] = [];
    for (const cityPrint of cityPrints) {
      const [south, north, west, east] = cityPrint.bbox.map(Number);
      const [lng, lat] = cityPrint.center;
      if (!(south < north && west < east)) cityProblems.push(`${cityPrint.slug}: inverted bbox`);
      // A page whose frame does not contain its own centre is pointing at the
      // wrong ground — the failure that ships a print of empty countryside.
      if (lng < west || lng > east || lat < south || lat > north) {
        cityProblems.push(`${cityPrint.slug}: centre outside frame`);
      }
      if (lng < -180 || lng > -60 || lat < 15 || lat > 72) cityProblems.push(`${cityPrint.slug}: outside the US`);
      const cityScene = createCityProductScene(cityPrint, CITY_PRODUCT_PALETTES[0]);
      if (!checkPrintReadiness(cityScene).ready) cityProblems.push(`${cityPrint.slug}: not print-ready`);
      if (cityScene.detail.counties || cityScene.detail.labels.towns) {
        cityProblems.push(`${cityPrint.slug}: carries region furniture`);
      }
    }
    check('every city print is on real ground and ready to print',
      cityProblems.length === 0, cityProblems.slice(0, 4).join(' · ') || `${cityPrints.length} cities clear`);

    check('the storefront offers the six advertised colourways',
      CITY_PRODUCT_PALETTES.length === 6);
    const colorwayProblems: string[] = [];
    for (const colorway of CITY_PRODUCT_PALETTES) {
      const palette = getPalette(colorway);
      if (palette.id !== colorway) { colorwayProblems.push(`${colorway}: missing`); continue; }
      // Ink that does not separate from the paper prints as a blank sheet.
      if (checkPalette(palette.colors).verdict === 'unprintable') {
        colorwayProblems.push(`${colorway}: unprintable contrast`);
      }
      const themed = createCityProductScene(cityPrints[0], colorway);
      if (themed.colors.roads.toLowerCase() === themed.colors.land.toLowerCase()) {
        colorwayProblems.push(`${colorway}: ink matches paper`);
      }
    }
    check('every advertised colourway is printable',
      colorwayProblems.length === 0, colorwayProblems.join(' · ') || CITY_PRODUCT_PALETTES.join(', '));
    check('the colourways are visually distinct from each other',
      new Set(CITY_PRODUCT_PALETTES.map((id) => getPalette(id).colors.roads.toLowerCase())).size
        === CITY_PRODUCT_PALETTES.length);
    // The custom colour a customer picks is nudged to a printable value rather
    // than accepted as-is, so a pale yellow on white cannot ship as blank paper.
    check('a custom colour is made printable against the paper',
      contrastRatio(makePrintable('#fdfdf5', '#ffffff'), '#ffffff') > 2);

    setLines(out);
  }, []);

  const failed = lines.filter((line) => line.startsWith('FAIL'));

  return (
    <pre id="selftest" data-done={lines.length > 0} data-failed={failed.length}>
      {lines.join('\n')}
    </pre>
  );
}
