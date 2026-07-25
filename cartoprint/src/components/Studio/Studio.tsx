'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type maplibregl from 'maplibre-gl';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { LivePrintCanvas } from '@/components/Studio/LivePrintCanvas';
import { TitleOverlay } from '@/components/Studio/TitleOverlay';
import { LookSwatch } from '@/components/Studio/LookSwatch';
import { StudioDock, type Move } from '@/components/Studio/StudioDock';
import { useSceneHistory } from '@/hooks/useSceneHistory';
import {
  applyLook,
  createPrintScene,
  readStoredScene,
  setFreeViewport,
  storeScene,
  syncViewport,
  type PrintScene,
  type PrintViewport,
} from '@/lib/print/scene';
import { getLook } from '@/lib/print/looks';
import { seedFromSlug, suggestLooks } from '@/lib/print/autoLook';
import { formatRadius } from '@/lib/print/framing';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import { DESIGN_PARAM, decodeDesign, encodeDesign } from '@/lib/print/designUrl';
import { SESSION_PREVIEW_KEY } from '@/lib/print/sizeCatalog';
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

const PREVIEW_EXPORT_WIDTH = 1200;
const FULL_EXPORT_WIDTH = 3600;

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
  const [waterShare, setWaterShare] = useState<number | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shared, setShared] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(96);

  const sheetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const restored = useRef(false);
  const userTouched = useRef(false);
  const autoApplied = useRef(false);

  // --- Restore: URL design first (shareable), then the session, then default.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const encoded = searchParams.get(DESIGN_PARAM);
    const decoded = decodeDesign(encoded);
    if (decoded) {
      const base = createPrintScene(print, decoded.orientation);
      reset({
        ...base,
        orientation: decoded.orientation,
        lookId: decoded.lookId,
        radiusMiles: decoded.radiusMiles,
        freeViewport: decoded.freeViewport,
        focus: [...decoded.viewport.center] as [number, number],
        viewport: decoded.viewport,
        colors: decoded.colors,
        strokeWeight: decoded.strokeWeight,
        detail: decoded.detail,
        title: decoded.title,
      });
      userTouched.current = true;
      return;
    }

    const stored = readStoredScene(print);
    if (stored) {
      reset(stored);
      userTouched.current = true;
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

  // --- Start from a good print rather than a blank one. Once the map has
  // painted we know how much of the frame is water, which is the single most
  // useful signal for which look suits this place.
  const suggestions = suggestLooks({
    kind: print.kind,
    radiusMiles: scene.place.placeRadiusMiles,
    waterShare,
    seed: seedFromSlug(print.slug),
  });

  useEffect(() => {
    if (autoApplied.current || userTouched.current) return;
    if (waterShare === null) return;
    autoApplied.current = true;
    const best = suggestions[0];
    if (best && best.id !== scene.lookId) {
      update((current) => applyLook(current, best), 'auto-look');
    }
    // `suggestions` is derived from waterShare; recomputing on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waterShare]);

  const handleViewportChange = useCallback((viewport: PrintViewport, radiusMiles: number) => {
    userTouched.current = true;
    update((current) => setFreeViewport(current, viewport, radiusMiles), 'pan');
  }, [update]);

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
      return syncViewport(resolved);
    }, label);
  }, [update]);

  async function exportPng(width: number): Promise<string> {
    return renderScene(scene, boundary, { width });
  }

  async function handleContinue() {
    if (continuing) return;
    setContinuing(true);
    setExportError(null);
    try {
      const preview = await exportPng(PREVIEW_EXPORT_WIDTH);
      sessionStorage.setItem(SESSION_PREVIEW_KEY, preview);
      storeScene(scene);
      const params = new URLSearchParams(window.location.search);
      params.set('o', scene.orientation);
      router.push(`/size?${params.toString()}`);
    } catch (error) {
      console.warn('Could not prepare the print preview', error);
      setExportError('We could not prepare the print preview. Please try again.');
      setContinuing(false);
    }
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setExportError(null);
    try {
      const url = await exportPng(FULL_EXPORT_WIDTH);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${print.slug}-${scene.orientation}.png`;
      anchor.click();
    } catch (error) {
      console.warn('Download failed', error);
      setExportError('The artwork could not be generated. Please try again.');
    } finally {
      setDownloading(false);
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

  const look = getLook(scene.lookId);
  const showStartingPoints = !userTouched.current && activeMove === null;

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
            onClick={handleDownload}
            disabled={downloading}
            className="hidden rounded-full border border-white/15 px-3.5 py-2 text-[12px] text-[#dce2dd]/80 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40 md:block"
          >
            {downloading ? 'Preparing…' : 'Download'}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={continuing}
            className="rounded-full bg-[#f7f4eb] px-5 py-2 text-[13px] font-medium text-[#14201d] transition-colors hover:bg-white disabled:opacity-60"
          >
            {continuing ? 'Preparing…' : 'Choose print'}
          </button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {/* The stage gives up exactly as much room as the dock is using, so
            opening a panel shrinks the print instead of covering it. */}
        <div
          className={`absolute inset-0 flex items-center justify-center p-3 transition-[padding] duration-200 md:p-6 ${
            // On a phone the suggestions sit above the sheet, so the stage has
            // to give up that room rather than let the card cover the artwork.
            showStartingPoints ? 'pt-[104px] md:pt-6' : ''
          }`}
          style={{ paddingBottom: dockHeight + 16 }}
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
              onWaterShare={setWaterShare}
              className="h-full w-full"
            >
              <TitleOverlay
                design={scene.title}
                colors={scene.colors}
                containerRef={sheetRef}
                onChange={(title) => touchedUpdate((current) => ({ ...current, title }), 'title-drag')}
              />
            </LivePrintCanvas>
          </div>
        </div>

        {showStartingPoints && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(520px,92vw)] -translate-x-1/2 md:left-6 md:top-6 md:w-[300px] md:translate-x-0">
            <div className="pointer-events-auto rounded-sm border border-white/12 bg-[#14201d]/92 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-[13px] text-[#f7f4eb]">
                  Three good prints of {print.name}
                </p>
                <button
                  type="button"
                  onClick={() => { userTouched.current = true; setActiveMove(null); setWaterShare((value) => value); }}
                  className="text-[12px] text-[#dce2dd]/55 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
                {suggestions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => touchedUpdate((current) => applyLook(current, option), `start-${option.id}`)}
                    className={`flex min-w-0 items-center gap-2 rounded-sm border p-1.5 text-left transition-colors ${
                      scene.lookId === option.id
                        ? 'border-[#c66b4e] bg-white/10'
                        : 'border-white/12 hover:border-white/35'
                    }`}
                  >
                    <LookSwatch look={option} width={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-[#f7f4eb]">{option.name}</span>
                      <span className="hidden truncate text-[11px] text-[#dce2dd]/50 md:block">{option.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {exportError && (
          <div className="absolute inset-x-3 top-3 z-30 rounded-sm border border-[#c1362b]/50 bg-[#2a1512] px-4 py-2.5 text-[13px] text-[#f0c9c2] md:inset-x-auto md:right-6">
            {exportError}
          </div>
        )}

        <div
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-[11px] text-white/35"
          style={{ bottom: dockHeight + 2 }}
        >
          {look.name} · {scene.freeViewport ? 'custom view' : formatRadius(scene.radiusMiles)}
        </div>

        <StudioDock
          scene={scene}
          update={touchedUpdate}
          active={activeMove}
          onActiveChange={setActiveMove}
          onHeightChange={setDockHeight}
        />
      </main>
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
