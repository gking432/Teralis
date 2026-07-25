'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import {
  applyPrintColors,
  applyPrintDetail,
  applyPrintMapStyle,
  applyPrintMaskColor,
} from '@/lib/print/printRender';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { strokeScaleFor } from '@/lib/print/strokes';
import { printGeometry, percent } from '@/lib/print/geometry';
import { radiusForViewport } from '@/lib/print/framing';
import type { PrintScene, PrintViewport } from '@/lib/print/scene';
import { measureWaterShare } from '@/lib/print/autoLook';

/**
 * The live print canvas.
 *
 * This replaces the old snapshot pipeline, which booted a brand new offscreen
 * MapLibre instance, waited for tiles, and composited a PNG for EVERY change —
 * including every keystroke in the title field. Colors, density, borders, and
 * titles are all applied to a single persistent map here, so they are instant
 * and involve no network at all. Panning and zooming are native, which means
 * pinch, scroll, and drag work the way a map is supposed to.
 *
 * The high-resolution renderer still exists, but it now runs exactly once: at
 * export time.
 */

export interface LivePrintCanvasHandle {
  map: maplibregl.Map | null;
}

interface LivePrintCanvasProps {
  scene: PrintScene;
  geometry: GeoJSON.Geometry | null;
  /** Fired after the user pans or zooms by hand. */
  onViewportChange: (viewport: PrintViewport, radiusMiles: number) => void;
  onReady?: (map: maplibregl.Map) => void;
  onWaterShare?: (share: number | null) => void;
  /** Rendered on top of the sheet — the title overlay lives here. */
  children?: ReactNode;
  interactive?: boolean;
  className?: string;
}

export function LivePrintCanvas({
  scene,
  geometry,
  onViewportChange,
  onReady,
  onWaterShare,
  children,
  interactive = true,
  className = '',
}: LivePrintCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const onWaterShareRef = useRef(onWaterShare);
  onWaterShareRef.current = onWaterShare;

  const kind = scene.place.kind === 'country' ? 'country' : scene.place.kind === 'state' ? 'state' : 'city';
  const geo = printGeometry(scene.orientation, scene.detail.border, scene.title);

  /** The stroke scale for the canvas we are actually drawing into. */
  const currentScale = useCallback(() => {
    const width = mapRef.current?.getCanvas().clientWidth || 900;
    return strokeScaleFor(width);
  }, []);

  const fitViewport = useCallback((viewport: PrintViewport) => {
    const map = mapRef.current;
    if (!map) return;
    const [south, north, west, east] = viewport.bbox.map(Number);
    if (![south, north, west, east].every(Number.isFinite)) return;
    map.fitBounds(
      [[west, south], [east, north]],
      { padding: 0, animate: false, duration: 0 },
    );
  }, []);

  // --- Map creation (exactly once) ------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: scene.viewport.center,
      zoom: 10,
      attributionControl: false,
      interactive,
      // Keeps the artwork rectilinear — a rotated or pitched print is never
      // what someone wants on a wall.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    });
    map.touchZoomRotate?.disableRotation();
    mapRef.current = map;

    map.on('error', (event) => {
      // Style/tile failures are the only fatal case; missing sprites are not.
      if ((event as { error?: { status?: number } })?.error) setFailed(true);
    });

    map.on('load', () => {
      const active = sceneRef.current;
      try {
        initIsolationLayers(map);
      } catch {}
      applyPrintMapStyle(
        map,
        active.colors,
        active.place.kind === 'country' ? 'country' : active.place.kind === 'state' ? 'state' : 'city',
        active.detail,
        strokeScaleFor(map.getCanvas().clientWidth || 900),
        active.strokeWeight,
      );
      applyPrintMaskColor(map, active.colors);
      setStyleReady(true);
      fitViewport(active.viewport);
      onReady?.(map);
    });

    // Report user-driven camera moves back up so the scene stays the source of
    // truth for the exporter.
    // Only a move the USER made should mark the composition as custom.
    // MapLibre attaches `originalEvent` to camera changes that came from a
    // gesture; `fitBounds` and `resize` have none. Anything time- or
    // flag-based here misfires, because a resize can emit `moveend` too and
    // the app then believes the map was panned the moment it loaded.
    map.on('moveend', (event) => {
      if (!(event as { originalEvent?: unknown }).originalEvent) return;
      const bounds = map.getBounds();
      const center = map.getCenter();
      const viewport: PrintViewport = {
        bbox: [
          String(bounds.getSouth()),
          String(bounds.getNorth()),
          String(bounds.getWest()),
          String(bounds.getEast()),
        ],
        center: [center.lng, center.lat],
      };
      const active = sceneRef.current;
      const ratio = printGeometry(active.orientation, active.detail.border, active.title).mapRatio;
      onViewportChangeRef.current(viewport, radiusForViewport(viewport, ratio));
    });

    map.on('idle', () => {
      if (!onWaterShareRef.current) return;
      onWaterShareRef.current(measureWaterShare(map));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Deliberately empty: the map is created once and mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Targeted updates. Each of these is paint-only: no re-render, no fetch.

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    applyPrintColors(map, scene.colors, currentScale());
    applyPrintMaskColor(map, scene.colors);
  }, [scene.colors, styleReady, currentScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    applyPrintDetail(map, kind, scene.detail, currentScale(), scene.strokeWeight);
    // Detail changes reset paint properties on the layers they touch, so the
    // palette has to be re-applied on top of them.
    applyPrintColors(map, scene.colors, currentScale());
  }, [scene.detail, scene.strokeWeight, scene.colors, kind, styleReady, currentScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!geometry || kind === 'city') {
      try {
        map.setLayoutProperty('mask-layer', 'visibility', 'none');
      } catch {}
      return;
    }
    try {
      applyIsolationMask(map, {
        name: sceneRef.current.place.name,
        type: kind,
        fullName: sceneRef.current.place.searchQuery,
        geojson: geometry,
        bbox: sceneRef.current.viewport.bbox,
      });
      applyPrintMaskColor(map, scene.colors);
    } catch {}
  }, [geometry, kind, styleReady, scene.colors]);

  // Camera follows the scene whenever the change did not come from the map.
  const bboxKey = scene.viewport.bbox.join(',');
  useEffect(() => {
    if (!styleReady) return;
    if (sceneRef.current.freeViewport) return;
    fitViewport(sceneRef.current.viewport);
  }, [bboxKey, styleReady, fitViewport]);

  // The paper shape or the border changed — the canvas resized, so both the
  // camera and the stroke scale need to catch up.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    map.resize();
    const active = sceneRef.current;
    applyPrintDetail(map, kind, active.detail, strokeScaleFor(map.getCanvas().clientWidth || 900), active.strokeWeight);
    applyPrintColors(map, active.colors, strokeScaleFor(map.getCanvas().clientWidth || 900));
    if (!active.freeViewport) fitViewport(active.viewport);
  }, [scene.orientation, geo.mapRect.w, geo.mapRect.h, kind, styleReady, fitViewport]);

  const paper = scene.colors.land || '#ffffff';
  const ink = scene.colors.useMapDefault
    ? '#4a4a48'
    : (scene.colors.water || scene.colors.roads || '#07122a');

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: paper, aspectRatio: `1 / ${geo.ratio}` }}
      data-testid="print-sheet"
    >
      {/* The ink border is a DOM frame, not a baked pixel band, so changing its
          weight is instant and never triggers a re-render of the map. */}
      {geo.borderFracW > 0 && (
        <div
          className="absolute"
          style={{
            left: percent(geo.mapFrameRect.x),
            top: percent(geo.mapFrameRect.y),
            width: percent(geo.mapFrameRect.w),
            height: percent(geo.mapFrameRect.h),
            backgroundColor: ink,
          }}
          aria-hidden
        />
      )}

      <div
        className="absolute overflow-hidden"
        style={{
          left: percent(geo.mapRect.x),
          top: percent(geo.mapRect.y),
          width: percent(geo.mapRect.w),
          height: percent(geo.mapRect.h),
          backgroundColor: paper,
        }}
      >
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {children}

      {!styleReady && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-current/20 border-t-current opacity-40" />
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="text-sm opacity-70" style={{ color: ink }}>
            Map tiles could not be loaded. Check your connection and reload.
          </p>
        </div>
      )}
    </div>
  );
}
