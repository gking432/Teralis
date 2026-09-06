'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type maplibregl from 'maplibre-gl';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { LivePrintCanvas } from '@/components/Studio/LivePrintCanvas';
import { TitleOverlay } from '@/components/Studio/TitleOverlay';
import { ProofInspector } from './ProofInspector';
import { PlaceOptions } from './PlaceOptions';
import { chooseEdition, recommendedOrientation, recommendedStateEdition } from '@/lib/print/editions';
import { illustrationFor, illustrationRect } from '@/lib/print/illustrations';
import { percent } from '@/lib/print/geometry';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { useSceneHistory } from '@/hooks/useSceneHistory';
import {
  applyLayout,
  createPrintScene,
  readStoredScene,
  setFreeViewport,
  storeScene,
  normalizeScene,
  type PrintScene,
  type PrintViewport,
} from '@/lib/print/scene';
import { getLayout } from '@/lib/print/layouts';
import { getPalette } from '@/lib/print/palettes';


import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import { DESIGN_PARAM, decodeDesign, encodeDesign } from '@/lib/print/designUrl';
import { regionThemeName } from '@/lib/print/regionDesign';
import { storeProof } from '@/lib/print/proof';
import { checkPrintReadiness } from '@/lib/print/readiness';
import { trackDemoEvent } from '@/lib/demoAnalytics';
import { SIZE_CATALOG, formatPrice, getSizePrice } from '@/lib/print/sizeCatalog';
import { isValidOrientation, type Orientation } from '@/lib/print/orientation';

/** Width of the small composite handed to the size/frame mockups. */
const PREVIEW_EXPORT_WIDTH = 1200;

/** The design's name on the "Change design" chip. */
function designLabelFor(scene: PrintScene): string {
  if (scene.place.kind !== 'city') return regionThemeName(scene.region.theme);
  if (scene.paletteId === 'custom') return 'Custom colors';
  return getPalette(scene.paletteId).name;
}

interface StudioProps {
  print: CatalogPrint;
  orientation?: Orientation;
}

export function Studio({ print, orientation = 'portrait' }: StudioProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlOrientation = searchParams.get('o');
  if (isValidOrientation(urlOrientation)) orientation = urlOrientation;

  const { scene, update, reset, undo, redo, canUndo, canRedo } = useSceneHistory(
    () => createPrintScene(print, orientation),
  );

  const [boundary, setBoundary] = useState<GeoJSON.Geometry | null>(null);
  const [inspect, setInspect] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapPreview, setMapPreview] = useState<string>();
  const [waterNotice, setWaterNotice] = useState(false);
  const [waterPlacementAvailable, setWaterPlacementAvailable] = useState<boolean | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  const [previewSeen, setPreviewSeen] = useState(false);
  const reportReady = useCallback((ready: boolean) => {
    setMapReady(ready);
    if (ready) setPreviewSeen(true);
  }, []);
  const [viewLocked, setViewLocked] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [shared, setShared] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);


  const sheetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const restored = useRef(false);
  const userTouched = useRef(false);
  /** The design as it arrived — the safe state "Start over" returns to. */
  const arrivalScene = useRef<PrintScene | null>(null);

  // --- Restore: URL design first (shareable), then the session, then default.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const encoded = searchParams.get(DESIGN_PARAM);
    const decoded = decodeDesign(encoded);
    if (decoded) {
      const base = createPrintScene(print, decoded.orientation);
      const restoredScene = normalizeScene({
        ...base,
        orientation: decoded.orientation,
        layoutId: decoded.layoutId,
        paletteId: decoded.paletteId,
        radiusMiles: decoded.radiusMiles,
        freeViewport: decoded.freeViewport,
        focus: [...decoded.viewport.center] as [number, number],
        viewport: decoded.viewport,
        colors: decoded.colors,
        strokeWeight: decoded.strokeWeight,
        size: decoded.size,
        detailBias: decoded.detailBias,
        labelsAuto: decoded.labelsAuto,
        detail: decoded.detail,
        title: decoded.title,
        region: decoded.region ?? base.region,
      });
      arrivalScene.current = restoredScene;
      reset(restoredScene);
      userTouched.current = true;
      setViewLocked(true);
      // They chose this design on the product page — open on making it theirs,
      // not on re-deciding anything.

      return;
    }

    const explicit = searchParams.has('look') || searchParams.has('edition') || searchParams.has('palette');
    const stored = explicit ? null : readStoredScene(print);
    if (stored) {
      const storedScene = normalizeScene(stored);
      arrivalScene.current = storedScene;
      reset(storedScene);
      userTouched.current = true;
      setViewLocked(true);

      return;
    }
    let initial = createPrintScene(print, searchParams.has('o') ? orientation : recommendedOrientation(print));
    const edition = searchParams.get('edition');
    if (print.kind !== 'city') initial = chooseEdition(initial, edition === 'atlas' || edition === 'illustrated' || edition === 'detailed' || edition === 'topographic' ? edition : recommendedStateEdition(print.slug));
    if (print.kind === 'city') {
      const look = searchParams.get('look');
      const coastal = ['chicago-il', 'madison-wi', 'miami-fl', 'seattle-wa', 'san-francisco-ca'].includes(print.slug);
      initial = applyLayout(initial, getLayout(look || (coastal ? 'on-water' : 'footer')));
    }
    if (print.kind === 'city' && (edition === 'illustrated' || edition === 'landmarks')) initial = chooseEdition(initial, 'landmarks');
    const palette = searchParams.get('palette');
    if (palette && initial.region.theme !== 'illustrated') initial = normalizeScene({ ...initial, paletteId: getPalette(palette).id, colors: getPalette(palette).colors });
    arrivalScene.current = initial;
    reset(initial);
  }, [orientation, print, reset, searchParams]);

  // --- Persist to the session and to the URL, so a design survives a reload.
  useEffect(() => {
    if (!restored.current) return;
    storeScene(scene);

    const handle = window.setTimeout(() => {
      const encoded = encodeDesign(scene);
      if (!encoded) return;
      const params = new URLSearchParams(window.location.search);
      params.set(DESIGN_PARAM, encoded);
      window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [scene]);

  // --- Boundary for the isolation mask (state and country prints only).
  useEffect(() => {
    if (print.kind === 'city') { setBoundary(null); return; }
    const cached = getCachedBoundary(print.slug)?.geometry;
    if (cached) { setBoundary(cached); return; }

    let cancelled = false;
    fetchBoundary(print.slug, print.center, print.kind)
      .then((record) => { if (!cancelled) setBoundary(record?.geometry ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [print.slug, print.center, print.kind]);

  /**
   * Accept an automatic placement. Only while the title is still auto-placed —
   * the instant the user drags it, `autoPlaced` clears and their position wins.
   */
  const handleWaterPlacement = useCallback((rect: { x: number; y: number; w: number; h: number } | null) => {
    setWaterPlacementAvailable(Boolean(rect));
    if (rect) rect = { x: Math.max(.015, rect.x), y: Math.max(.015, rect.y), w: Math.min(rect.w, .985 - Math.max(.015, rect.x)), h: Math.min(rect.h, .985 - Math.max(.015, rect.y)) };
    update((current) => {
      if (!current.title.autoPlaced) return current;
      const found = Boolean(rect);
      const same = rect
        && Math.abs(current.title.x - rect.x) < 0.002
        && Math.abs(current.title.y - rect.y) < 0.002
        && Math.abs(current.title.w - rect.w) < 0.002;
      if (same && current.title.onWater === found) return current;
      return {
        ...current,
        title: {
          ...current.title,
          // No water big enough: keep the words somewhere readable rather than
          // dropping them on the city, and colour them for paper again.
          ...(rect ? { slot: 'free' as const, x: Math.max(.015, rect.x), y: Math.max(.015, rect.y), w: Math.min(rect.w, .985 - Math.max(.015, rect.x)), h: Math.min(rect.h, .985 - Math.max(.015, rect.y)) } : { slot: 'bottom-left' as const }),
          onWater: found,
        },
      };
    }, 'water-placement');
  }, [update]);

  const handleViewportChange = useCallback((viewport: PrintViewport, radiusMiles: number) => {
    userTouched.current = true;
    update((current) => setFreeViewport(current, viewport, radiusMiles), 'pan');
  }, [update]);

  useEffect(() => {
    if (
      waterPlacementAvailable !== false
      || scene.layoutId !== 'on-water'
      || !scene.title.autoPlaced
    ) return;
    setWaterNotice(true);
    update((current) => applyLayout(current, getLayout('footer')), 'water-fallback');
  }, [scene.layoutId, scene.title.autoPlaced, update, waterPlacementAvailable]);

  /**
   * Every edit funnels through here so the framing radius stays meaningful.
   * Orientation, border weight, and a reserved title band all change the shape
   * of the map area, and the radius is measured against that shape — so the
   * viewport has to be re-derived after any of them, not just after a reframe.
   * (`syncViewport` is a no-op once the user has panned by hand.)
   */
  const touchedUpdate = useCallback<typeof update>((next, label) => {
    userTouched.current = true;
    update((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      return normalizeScene(resolved);
    }, label);
  }, [update]);

  async function exportPng(target: PrintScene, width: number): Promise<string> {
    return renderScene(target, boundary, { width });
  }

  async function handleContinue(target: PrintScene = scene) {
    // The enabled button gates preview readiness. Export renders its own scene;
    // a late live-map readiness event must not silently discard this click.
    if (continuing || !checkPrintReadiness(target).ready) return;
    setContinuing(true);
    setExportError(null);
    try {
      const preview = await exportPng(target, PREVIEW_EXPORT_WIDTH);
      storeProof(target, preview);
      storeScene(target);
      const params = new URLSearchParams(window.location.search);
      params.set('o', target.orientation);
      if (!params.has('place')) params.set('print', print.slug);
      const encoded = encodeDesign(target);
      if (encoded) params.set(DESIGN_PARAM, encoded);
      router.push(`/size?${params.toString()}`);
    } catch (error) {
      console.warn('Could not prepare the print preview', error);
      setExportError('We could not prepare the print preview. Please try again.');
      setContinuing(false);
    }
  }

  /** Return to the exact design the customer arrived with. Undo still works. */
  function handleStartOver() {
    if (!arrivalScene.current) return;
    update(() => normalizeScene(arrivalScene.current!), 'start-over');
    trackDemoEvent('design_reset', { place: print.slug, kind: print.kind });
  }

  async function handleShare() {
    try {
      const url = new URL(window.location.href);
      const encoded = encodeDesign(scene);
      if (encoded) url.searchParams.set(DESIGN_PARAM, encoded);
      await navigator.clipboard.writeText(url.toString());
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch {
      setExportError('Could not copy the link. You can copy it from the address bar.');
    }
  }

  const designLabel = designLabelFor(scene);
  const readiness = checkPrintReadiness(scene);
  // Preserve a stable click target while palette/edition changes repaint the live map.
  const canContinue = (mapReady || previewSeen) && readiness.ready;
  const readinessLabel = !mapReady
    ? 'Loading map'
    : readiness.ready
      ? 'Ready to print'
      : 'Needs adjustment';
  const sizeOption = SIZE_CATALOG[scene.orientation][scene.size];
  const price = formatPrice(getSizePrice(scene.size, 'none', false));
  const illustrated = scene.region.theme === 'illustrated';
  const art = illustrationFor(scene);
  const artRect = illustrated && art ? illustrationRect(scene) : null;


  return (
    <div className="place-workspace">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-white/15 px-4 py-3 md:px-7">
        <Link href="/" className="studio-wordmark text-lg" aria-label="Terralis home">Terra<span>lis</span></Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setSearchOpen(!searchOpen)} aria-expanded={searchOpen} className="rounded-full border border-white/25 px-4 py-2 text-sm">Find another place</button>
          <IconButton label="Undo" onClick={undo} disabled={!canUndo}>↺</IconButton>
          <IconButton label="Redo" onClick={redo} disabled={!canRedo}>↻</IconButton>
          <button onClick={handleShare} className="hidden px-3 py-2 text-sm sm:block">{shared ? 'Link copied' : 'Share'}</button>
        </div>
      </header>
      {searchOpen && <div className="relative z-50 border-b border-white/15 px-5 py-5"><div className="mx-auto max-w-2xl"><LocationSearch autoFocus placeholder="City, town, or state" /></div></div>}
      <div className="place-workspace-body">
        <main className="place-stage" aria-label={`${print.name} print preview`}>
          <div ref={sheetRef} className="place-sheet" style={{ '--sheet-ratio': scene.orientation === 'portrait' ? 4 / 3 : scene.orientation === 'landscape' ? 3 / 4 : 1, aspectRatio: `1 / ${scene.orientation === 'portrait' ? 4 / 3 : scene.orientation === 'landscape' ? 3 / 4 : 1}` } as CSSProperties}>
            {illustrated && art && artRect ? <div className="relative h-full w-full" style={{ background: art.paper }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.src} alt={`Illustrated ${print.name} with local landscapes and landmarks`} onLoad={() => reportReady(true)} onError={() => { setMapReady(false); setExportError('The illustration could not load. Try another edition or reload.'); }} style={{ position: 'absolute', left: percent(artRect.x), top: percent(artRect.y), width: percent(artRect.w), height: percent(artRect.h) }} />
              <TitleOverlay design={scene.title} colors={scene.colors} containerRef={sheetRef} onChange={() => {}} editable={false} />
            </div> : <LivePrintCanvas scene={scene} geometry={boundary} onViewportChange={handleViewportChange} onReady={(map) => { mapRef.current = map; }} onReadyStateChange={reportReady} onMapPreview={setMapPreview} onWaterPlacement={handleWaterPlacement} interactive={!viewLocked && scene.place.kind === 'city'} className="h-full w-full">
              <TitleOverlay design={scene.title} colors={scene.colors} containerRef={sheetRef} onChange={() => {}} editable={false} />
            </LivePrintCanvas>}
          </div>
          <button disabled={!mapReady && !previewSeen} onClick={() => setInspect(true)} className="absolute right-4 top-4 rounded-full bg-[#f7f4eb] px-4 py-2 text-sm text-[#173f35] shadow disabled:opacity-50">Inspect print ↗</button>
          {exportError && <div role="alert" className="absolute inset-x-4 top-4 z-30 rounded bg-[#552b21] px-4 py-3 text-sm text-white">{exportError}<button onClick={() => setExportError(null)} aria-label="Dismiss error" className="ml-3">×</button></div>}
          <span className="pointer-events-none absolute bottom-1 text-xs text-white/60">{illustrated ? 'Illustrated Atlas' : scene.place.kind === 'city' ? 'Your city, your view' : designLabel}</span>
        </main>
        <aside className="place-controls" aria-label="Personalize your print">
          <div className="place-controls-inner">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.16em] text-[#9b6045]">{print.kind === 'city' ? 'City & town maps' : 'State maps'}</p>
              <h1 className="mt-2 font-display text-5xl leading-none">{print.name}</h1>
              <p className="mt-3 text-sm leading-6 text-[#657167]">{print.kind === 'city' ? 'Find your favorite version. Make a few changes, or keep it just as it is.' : 'The landscape, the towns you know, or a world drawn in ink.'}</p>
            </div>
            {waterNotice && scene.layoutId !== 'on-water' && <p role="status" className="mb-4 rounded bg-[#f1eadc] p-3 text-sm text-[#695237]">This view doesn’t have enough open water for the title. We’ve used Gallery; widen the map area to explore the shoreline.</p>}
            <PlaceOptions print={print} scene={scene} update={touchedUpdate} boundary={boundary} waterAvailable={waterPlacementAvailable} mapPreview={mapPreview} onAdjustArea={(active) => setViewLocked(!active)} />
            <button onClick={handleStartOver} disabled={!canUndo} className="mt-5 text-sm text-[#637165] underline underline-offset-4 disabled:opacity-40">Reset to starting design</button>
          </div>
          <div className="place-finish flex items-center justify-between gap-3">
            <div><p className="text-sm">{sizeOption.dimensionStr} · {price}</p><p className="mt-1 text-xs text-[#647064]" role="status">{canContinue ? 'Sizes & framing next' : readiness.issues[0] ?? readinessLabel}</p></div>
            <button onClick={() => void handleContinue()} disabled={!canContinue || continuing} className="rounded-sm bg-[#173f35] px-5 py-3 text-sm text-white disabled:opacity-50">{continuing ? 'Preparing…' : 'Choose size & frame'}</button>
          </div>
        </aside>
      </div>
      {inspect && <ProofInspector scene={scene} boundary={boundary} onClose={() => setInspect(false)} />}
      {continuing && <div role="status" className="fixed inset-0 z-[90] grid place-items-center bg-[#101a17]/80 text-white backdrop-blur-sm"><p>Preparing your print…</p></div>}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="h-9 w-9 rounded-full border border-white/20 text-base disabled:opacity-30">{children}</button>;
}
