'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type maplibregl from 'maplibre-gl';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { LivePrintCanvas } from '@/components/Studio/LivePrintCanvas';
import { TitleOverlay } from '@/components/Studio/TitleOverlay';
import { DoodleOverlay } from '@/components/Studio/DoodleOverlay';
import { StyleGallery } from '@/components/Studio/StyleGallery';
import { MOVES, MoveTabs, StudioDock, StudioPanels, type Move } from '@/components/Studio/StudioDock';
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
import { seedFromSlug, suggestPalettes } from '@/lib/print/autoLook';
import { formatRadius } from '@/lib/print/framing';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import { DESIGN_PARAM, decodeDesign, encodeDesign } from '@/lib/print/designUrl';
import { restoreIllustrationDesign } from '@/lib/print/decorations';
import { storeProof } from '@/lib/print/proof';
import { checkPrintReadiness } from '@/lib/print/readiness';
import type { Orientation } from '@/lib/print/orientation';

/**
 * The studio.
 *
 * Layout principle: the artwork is the largest thing on screen at every
 * viewport, and the controls float over it. The old two-column layout put a
 * 520px print in a 1000px column of empty space and pushed the primary action
 * below the fold; on a phone the entire first screen was the preview with
 * every control scrolled off beneath it.
 */

/** Width of the small composite handed to the size/frame mockups. */
const PREVIEW_EXPORT_WIDTH = 1200;

interface StudioProps {
  print: CatalogPrint;
  orientation?: Orientation;
}

export function Studio({ print, orientation = 'portrait' }: StudioProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { scene, update, reset, undo, redo, canUndo, canRedo } = useSceneHistory(
    () => createPrintScene(print, orientation),
  );

  const [boundary, setBoundary] = useState<GeoJSON.Geometry | null>(null);
  const [activeMove, setActiveMove] = useState<Move | null>(null);
  // The rail always has something open, so it needs its own current move.
  const [railMove, setRailMove] = useState<Move>('view');
  const [waterShare, setWaterShare] = useState<number | null>(null);
  const [waterPlacementAvailable, setWaterPlacementAvailable] = useState<boolean | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  const [mapPreview, setMapPreview] = useState<string | null>(null);
  const [styleGalleryOpen, setStyleGalleryOpen] = useState(false);
  const [viewLocked, setViewLocked] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [shared, setShared] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(96);

  const sheetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const restored = useRef(false);
  const userTouched = useRef(false);

  // --- Restore: URL design first (shareable), then the session, then default.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const encoded = searchParams.get(DESIGN_PARAM);
    const decoded = decodeDesign(encoded);
    if (decoded) {
      const base = createPrintScene(print, decoded.orientation);
      reset(normalizeScene({
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
        illustration: restoreIllustrationDesign(decoded.illustration, base.illustration, print.slug),
      }));
      userTouched.current = true;
      setViewLocked(true);
      return;
    }

    const stored = readStoredScene(print);
    if (stored) {
      reset(normalizeScene(stored));
      userTouched.current = true;
      setViewLocked(true);
    }
  }, [print, reset, searchParams]);

  // --- Persist to the session and to the URL, so a design survives a reload.
  useEffect(() => {
    if (!restored.current) return;
    storeScene(scene);

    const handle = window.setTimeout(() => {
      const encoded = encodeDesign(scene);
      if (!encoded) return;
      const params = new URLSearchParams(window.location.search);
      params.set(DESIGN_PARAM, encoded);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
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

  // Water share still informs recommendations, but the print always opens in
  // the neutral slate default. Suggestions must never recolor work silently.
  const suggestions = suggestPalettes({
    kind: print.kind,
    radiusMiles: scene.place.placeRadiusMiles,
    waterShare,
    seed: seedFromSlug(print.slug),
  });

  /**
   * Accept an automatic placement. Only while the title is still auto-placed —
   * the instant the user drags it, `autoPlaced` clears and their position wins.
   */
  const handleWaterPlacement = useCallback((rect: { x: number; y: number; w: number; h: number } | null) => {
    setWaterPlacementAvailable(Boolean(rect));
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
          ...(rect ? { slot: 'free' as const, ...rect } : { slot: 'bottom-left' as const }),
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
    if (continuing || !mapReady || !checkPrintReadiness(target).ready) return;
    setContinuing(true);
    setExportError(null);
    try {
      const preview = await exportPng(target, PREVIEW_EXPORT_WIDTH);
      storeProof(target, preview);
      storeScene(target);
      const params = new URLSearchParams(window.location.search);
      params.set('o', target.orientation);
      router.push(`/size?${params.toString()}`);
    } catch (error) {
      console.warn('Could not prepare the print preview', error);
      setExportError('We could not prepare the print preview. Please try again.');
      setContinuing(false);
    }
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch {
      setExportError('Could not copy the link. You can copy it from the address bar.');
    }
  }

  function openStyleGallery() {
    setViewLocked(true);
    if (scene.place.kind === 'state') {
      setStyleGalleryOpen(false);
      setRailMove('style');
      setActiveMove('style');
      return;
    }
    setActiveMove(null);
    setStyleGalleryOpen(true);
  }

  function closeStyleGallery() {
    setStyleGalleryOpen(false);
    setViewLocked(false);
    setRailMove('view');
    setActiveMove('view');
  }

  function finishStyleGallery(target: PrintScene) {
    setStyleGalleryOpen(false);
    void handleContinue(target);
  }

  const currentStep = MOVES.find((move) => move.id === railMove) ?? MOVES[0];
  const layout = getLayout(scene.layoutId);
  const palette = getPalette(scene.paletteId);
  const readiness = checkPrintReadiness(scene);
  const canContinue = mapReady && readiness.ready;
  const readinessLabel = !mapReady
    ? 'Loading map'
    : readiness.ready
      ? 'Map ready'
      : 'Needs adjustment';
  // Suggestions live inside the Look panel rather than floating over the print,
  // and retire as soon as the user has expressed a preference of their own.
  const showSuggestions = !userTouched.current;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#14201d] text-[#f7f4eb]">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 md:px-5">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <Link href="/" className="studio-wordmark shrink-0 text-[15px]" aria-label="Terralis home">
            Terra<span>lis</span>
          </Link>
          <Link
            href="/"
            className="hidden truncate rounded-full border border-white/15 px-3 py-1.5 text-[13px] text-[#dce2dd]/80 transition-colors hover:border-white/40 hover:text-white sm:block"
          >
            {print.name} <span className="opacity-50">· change</span>
          </Link>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <IconButton label="Undo" onClick={undo} disabled={!canUndo}>↺</IconButton>
          <IconButton label="Redo" onClick={redo} disabled={!canRedo}>↻</IconButton>
          <button
            type="button"
            onClick={handleShare}
            className="hidden rounded-full border border-white/15 px-3.5 py-2 text-[12px] text-[#dce2dd]/80 transition-colors hover:border-white/40 hover:text-white sm:block"
          >
            {shared ? 'Link copied' : 'Share'}
          </button>
          <button
            type="button"
            onClick={() => scene.place.kind === 'state' ? void handleContinue() : openStyleGallery()}
            disabled={scene.place.kind === 'state' ? !canContinue : !mapReady}
            title={!canContinue ? readiness.issues[0] ?? 'Waiting for the map to finish loading.' : undefined}
            className="rounded-full bg-[#f7f4eb] px-5 py-2 text-[13px] font-medium text-[#14201d] transition-colors hover:bg-white disabled:opacity-60 lg:hidden"
          >
            {scene.place.kind === 'state' ? 'Choose finish' : 'Next'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 lg:flex-row">
      <main className="relative min-h-0 flex-1">
        {/* The stage gives up exactly as much room as the dock is using, so
            opening a panel shrinks the print instead of covering it. */}
        <div
          className="absolute inset-0 flex items-center justify-center p-3 transition-[padding] duration-200 md:p-6"
          style={{ paddingBottom: dockHeight > 0 ? dockHeight + 16 : undefined }}
        >
          <div
            ref={sheetRef}
            className="relative h-full max-h-full w-auto max-w-full shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            style={{ aspectRatio: `1 / ${scene.orientation === 'portrait' ? 4 / 3 : scene.orientation === 'landscape' ? 3 / 4 : 1}` }}
          >
            <LivePrintCanvas
              scene={scene}
              geometry={boundary}
              onViewportChange={handleViewportChange}
              onReady={(map) => { mapRef.current = map; }}
              onReadyStateChange={setMapReady}
              onWaterShare={setWaterShare}
              onWaterPlacement={handleWaterPlacement}
              onMapPreview={setMapPreview}
              interactive={!viewLocked && scene.place.kind !== 'state'}
              className="h-full w-full"
            >
              <DoodleOverlay
                scene={scene}
                containerRef={sheetRef}
                onChange={(decorations) => touchedUpdate((current) => ({
                  ...current,
                  illustration: { ...current.illustration, decorations },
                }), 'decoration-drag')}
              />
              <TitleOverlay
                design={scene.title}
                colors={scene.colors}
                containerRef={sheetRef}
                onChange={(title) => touchedUpdate((current) => ({ ...current, title }), 'title-drag')}
              />
            </LivePrintCanvas>
          </div>
        </div>

        {exportError && (
          <div className="absolute inset-x-3 top-3 z-30 rounded-sm border border-[#c1362b]/50 bg-[#2a1512] px-4 py-2.5 text-[13px] text-[#f0c9c2] md:inset-x-auto md:right-6">
            {exportError}
          </div>
        )}

        <div
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-[11px] text-white/35"
          style={{ bottom: dockHeight + 2 }}
        >
          {palette.name} · {layout.name} · {scene.freeViewport ? 'custom view' : formatRadius(scene.radiusMiles)}
        </div>

        {/* Bottom sheet: phones and tablets only. */}
        <div className="lg:hidden">
          <StudioDock
            scene={scene}
            update={touchedUpdate}
            active={activeMove}
            onActiveChange={(move) => {
              if (activeMove === 'view' && move !== 'view') setViewLocked(true);
              if (move === 'style' && scene.place.kind !== 'state') openStyleGallery();
              else {
                if (move === 'title') setViewLocked(true);
                setActiveMove(move);
              }
            }}
            onHeightChange={setDockHeight}
            suggestions={showSuggestions ? suggestions : undefined}
            waterAvailable={waterPlacementAvailable}
            viewLocked={viewLocked}
            onViewLockedChange={setViewLocked}
            onOpenStyle={openStyleGallery}
            onFinishFraming={openStyleGallery}
          />
        </div>
      </main>

      {/* Right rail: on a wide screen there is room to keep the controls
          permanently beside the artwork instead of over it, so nothing has to
          be opened and closed and the print never has to shrink. */}
      <aside className="hidden w-[400px] flex-none flex-col border-l border-white/10 bg-[#fbfaf6] text-[#14201d] transition-[width] duration-200 lg:flex xl:w-[480px]">
        <div className="flex-none border-b border-[#e0ddd4] p-4">
          <MoveTabs
            active={styleGalleryOpen ? 'style' : railMove}
            onActiveChange={(move) => {
              if (move === 'style' && scene.place.kind !== 'state') openStyleGallery();
              else if (move) {
                if (move === 'title') setViewLocked(true);
                setRailMove(move);
              }
            }}
            variant="rail"
          />
          <p className="mt-3 text-[13px] text-[#44504b]">{currentStep.question}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <StudioPanels
            scene={scene}
            update={touchedUpdate}
            active={railMove}
            suggestions={showSuggestions ? suggestions : undefined}
            waterAvailable={waterPlacementAvailable}
            viewLocked={viewLocked}
            onViewLockedChange={setViewLocked}
            onOpenStyle={openStyleGallery}
            onFinishFraming={openStyleGallery}
          />
        </div>

        <div className="flex flex-none items-center gap-3 border-t border-[#e0ddd4] p-4">
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-2 text-[12px] font-medium ${
              canContinue ? 'text-[#173f35]' : 'text-[#8a5a3f]'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                canContinue ? 'bg-[#2f7d62]' : mapReady ? 'bg-[#c66b4e]' : 'animate-pulse bg-[#aeb5b0]'
              }`} />
              {readinessLabel}
            </div>
            {!canContinue && (
              <p className="mt-1 truncate text-[10px] text-[#7b837e]">
                {readiness.issues[0] ?? 'Finishing the live map…'}
              </p>
            )}
          </div>
          {scene.place.kind !== 'state' && <button type="button" onClick={openStyleGallery} disabled={!mapReady} className="studio-ghost-button hidden px-3 sm:block disabled:opacity-40">
            Skip
          </button>}
          <button
            type="button"
            onClick={() => scene.place.kind === 'state' ? void handleContinue() : openStyleGallery()}
            disabled={scene.place.kind === 'state' ? !canContinue : !mapReady}
            className="rounded-sm bg-[#173f35] px-5 py-2.5 text-[13px] text-white transition-colors hover:bg-[#0f2f27] disabled:opacity-45"
          >
            {scene.place.kind === 'state' ? 'Choose finish' : 'Next'}
          </button>
        </div>
      </aside>
      </div>

      {styleGalleryOpen && (
        <StyleGallery
          scene={scene}
          mapImage={mapPreview}
          waterAvailable={waterPlacementAvailable}
          update={touchedUpdate}
          onClose={closeStyleGallery}
          onFinish={finishStyleGallery}
        />
      )}
      {continuing && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[#101a17]/82 text-white backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-white/75">Preparing your print…</p>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-9 w-9 rounded-full border border-white/15 text-[15px] text-[#dce2dd]/80 transition-colors hover:border-white/40 hover:text-white disabled:opacity-25"
    >
      {children}
    </button>
  );
}
