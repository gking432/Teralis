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
  applyPrintRegionOutline,
  addDetailedCityRoads,
  addDetailedStateFeatures,
  applyRegionMapLayers,
  removeDetailedStateFeatures,
  setDetailedCityRoadsVisible,
  styleDetailedStateFeatures,
} from '@/lib/print/printRender';
import { fetchDetailedCityRoads } from '@/lib/print/cityRoads';
import { fetchDetailedStateFeatures } from '@/lib/print/stateDetails';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { strokeScaleFor } from '@/lib/print/strokes';
import { printGeometry, percent } from '@/lib/print/geometry';
import { radiusForViewport } from '@/lib/print/framing';
import type { PrintScene, PrintViewport } from '@/lib/print/scene';
import { measureWaterShare } from '@/lib/print/autoLook';
import { supersampleFactor } from '@/lib/print/tileZoom';
import { findWaterPlacement, mapRectToSheet } from '@/lib/print/waterPlacement';
import type { NormalisedRect } from '@/lib/print/geometry';
import { printColorSettingsKey, printDetailSettingsKey } from '@/lib/print/mapChangeKeys';

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
  onReadyStateChange?: (ready: boolean) => void;
  onWaterShare?: (share: number | null) => void;
  /** Low-resolution copy of the current map area for the style showroom. */
  onMapPreview?: (image: string) => void;
  /**
   * Reports where a title can sit on open water, in SHEET coordinates, or null
   * when there is no stretch big enough. Only computed when the scene asks.
   */
  onWaterPlacement?: (rect: NormalisedRect | null) => void;
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
  onReadyStateChange,
  onWaterShare,
  onMapPreview,
  onWaterPlacement,
  children,
  interactive = true,
  className = '',
}: LivePrintCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [styleReady, setStyleReady] = useState(false);
  const [stateDetailLoaded, setStateDetailLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const onWaterShareRef = useRef(onWaterShare);
  onWaterShareRef.current = onWaterShare;
  const onMapPreviewRef = useRef(onMapPreview);
  onMapPreviewRef.current = onMapPreview;
  const onWaterPlacementRef = useRef(onWaterPlacement);
  onWaterPlacementRef.current = onWaterPlacement;
  const onReadyStateChangeRef = useRef(onReadyStateChange);
  onReadyStateChangeRef.current = onReadyStateChange;

  const kind = scene.place.kind === 'country' ? 'country' : scene.place.kind === 'state' ? 'state' : 'city';
  const bboxKey = scene.viewport.bbox.join(',');
  // Scene normalization recreates nested objects after every edit. Depending
  // on those object identities made a title-font click rerun the entire map
  // styling pipeline even though no map setting changed. Scalar signatures
  // keep title-only edits completely isolated from MapLibre.
  const colorsKey = printColorSettingsKey(scene.colors);
  const detailKey = printDetailSettingsKey(scene.detail);
  const regionTheme = scene.region.theme;
  const geo = printGeometry(scene.orientation, scene.detail.border, scene.title);

  useEffect(() => {
    const element = mapAreaRef.current;
    if (!element) return;
    const measure = () => setDisplaySize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Draw on an oversized canvas when the frame asks for the residential street
  // network, so `fitBounds` reaches the zoom at which those roads exist in the
  // vector tiles. Scaled back down for display, so the print is unchanged.
  const supersample = kind !== 'city' && displaySize.width > 0
    ? supersampleFactor(scene.viewport.bbox, displaySize.width, scene.detail.roads, displaySize.height)
    : 1;
  const canvasWidth = Math.round(displaySize.width * supersample);
  const canvasHeight = Math.round(displaySize.height * supersample);

  /** The stroke scale for the canvas we are actually drawing into. */
  const currentScale = useCallback(() => {
    const width = mapRef.current?.getCanvas().clientWidth || 900;
    return strokeScaleFor(width);
  }, []);

  const reportMapPreview = useCallback((map: maplibregl.Map) => {
    const report = onMapPreviewRef.current;
    if (!report) return;
    try {
      const source = map.getCanvas();
      if (!source.width || !source.height) return;
      const width = Math.min(source.width, 900);
      const height = Math.max(1, Math.round(width * source.height / source.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(source, 0, 0, width, height);
      report(canvas.toDataURL('image/png'));
    } catch {
      // A preview is an enhancement; a browser canvas restriction must never
      // prevent someone from editing or exporting the real print.
    }
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
    onReadyStateChangeRef.current?.(false);

    let styleDidLoad = false;
    const styleLoadTimeout = window.setTimeout(() => {
      if (styleDidLoad) return;
      setFailed(true);
      onReadyStateChangeRef.current?.(false);
    }, 15_000);

    map.on('error', (event) => {
      // Individual source tiles can fail once and then succeed on retry. That
      // is especially common when terrain is first revealed, and it must not
      // replace an otherwise usable map with a fatal error overlay. The load
      // timeout above is the backstop for a style that genuinely cannot boot.
      if (process.env.NODE_ENV !== 'production' && (event as { error?: unknown })?.error) {
        console.warn('A map resource failed and will be retried.', (event as { error?: unknown }).error);
      }
    });

    map.on('load', () => {
      styleDidLoad = true;
      window.clearTimeout(styleLoadTimeout);
      setFailed(false);
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
      applyRegionMapLayers(map, active.region, active.detail, active.detailBias, active.place.kind);
      applyPrintMaskColor(map, active.colors);
      setStyleReady(true);
      fitViewport(active.viewport);
      onReady?.(map);

      // Dev-only handle. The camera zoom is what decides whether the tiles
      // contain the residential street network at all, and it is otherwise
      // impossible to assert from outside the component.
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __teralisMap?: maplibregl.Map }).__teralisMap = map;
      }
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
      onReadyStateChangeRef.current?.(true);
      onWaterShareRef.current?.(measureWaterShare(map));
      reportMapPreview(map);

      // Where could a title sit on open water? Computed from the pixels we
      // just drew, because the water colour is one we chose ourselves and a
      // single readback beats thousands of feature queries.
      const report = onWaterPlacementRef.current;
      if (!report) return;
      const active = sceneRef.current;
      const activeGeo = printGeometry(active.orientation, active.detail.border, active.title);
      const found = findWaterPlacement(
        map.getCanvas(),
        active.colors.water || '#0a2342',
        activeGeo.mapRatio,
      );
      report(found ? mapRectToSheet(found.rect, activeGeo.mapRect) : null);
    });

    return () => {
      window.clearTimeout(styleLoadTimeout);
      map.remove();
      mapRef.current = null;
    };
    // Deliberately empty: the map is created once and mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An edition/color/camera edit invalidates the previous ready frame. The
  // existing idle listener publishes readiness only after the new frame settles.
  useEffect(() => {
    if (!styleReady || !mapRef.current) return;
    onReadyStateChangeRef.current?.(false);
    mapRef.current.triggerRepaint();
  }, [styleReady, colorsKey, detailKey, regionTheme, scene.detailBias, bboxKey, canvasWidth, canvasHeight]);

  // --- Targeted updates. Each of these is paint-only: no re-render, no fetch.

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const active = sceneRef.current;
    applyPrintColors(map, active.colors, currentScale());
    applyPrintMaskColor(map, active.colors);
    map.once('render', () => reportMapPreview(map));
    map.triggerRepaint();
  }, [colorsKey, styleReady, currentScale, reportMapPreview]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const active = sceneRef.current;
    applyPrintDetail(map, kind, active.detail, currentScale(), active.strokeWeight);
    // Detail changes reset paint properties on the layers they touch, so the
    // palette has to be re-applied on top of them.
    applyPrintColors(map, active.colors, currentScale());
    map.once('render', () => reportMapPreview(map));
    map.triggerRepaint();
  }, [colorsKey, detailKey, scene.strokeWeight, kind, styleReady, currentScale, reportMapPreview]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || kind !== 'state') return;
    const active = sceneRef.current;
    applyRegionMapLayers(map, active.region, active.detail, active.detailBias, kind);
    map.once('render', () => reportMapPreview(map));
    map.triggerRepaint();
  }, [detailKey, kind, reportMapPreview, regionTheme, scene.detailBias, styleReady]);

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
      const active = sceneRef.current;
      applyPrintMaskColor(map, active.colors);
      applyPrintRegionOutline(map, geometry, active.colors, currentScale());
    } catch {}
  }, [colorsKey, currentScale, geometry, kind, styleReady]);

  // State-scale base tiles are generalized differently at preview and export
  // sizes. Load one shared scale-aware geography pass for every state scene so
  // lakes and rivers never disappear when the customer enters the editor;
  // secondary routes and county structure are revealed only at maximum detail.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || kind !== 'state') return;

    const controller = new AbortController();
    const detailBbox = bboxKey.split(',') as [string, string, string, string];
    onReadyStateChangeRef.current?.(false);
    fetchDetailedStateFeatures(detailBbox, geometry, controller.signal)
      .then((collection) => {
        if (controller.signal.aborted) return;
        const active = sceneRef.current;
        const added = addDetailedStateFeatures(map, collection, active.colors, currentScale(), active.strokeWeight);
        setStateDetailLoaded(added);
        applyRegionMapLayers(map, active.region, active.detail, active.detailBias, kind);
        try {
          map.moveLayer('mask-layer');
          map.moveLayer('selection-outline-layer');
        } catch {}
        // The state GeoJSON is already local at this point, so the next frame
        // contains the added geography. Waiting for full map `idle`
        // can hang indefinitely while optional terrain tiles retry, leaving a
        // visibly finished print stuck behind a disabled purchase button.
        map.once('render', () => {
          onReadyStateChangeRef.current?.(true);
          reportMapPreview(map);
        });
        map.triggerRepaint();
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStateDetailLoaded(false);
          onReadyStateChangeRef.current?.(true);
        }
      });

    return () => controller.abort();
  }, [bboxKey, currentScale, geometry, kind, reportMapPreview, styleReady]);

  // City streets come from z12 transportation tiles decoded by our API. This
  // keeps the complete residential network independent of the visible camera
  // zoom and gives the live canvas the same geometry as the final export.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || kind !== 'city') return;

    const controller = new AbortController();
    const roadBbox = bboxKey.split(',') as [string, string, string, string];
    onReadyStateChangeRef.current?.(false);
    setDetailedCityRoadsVisible(map, false);
    fetchDetailedCityRoads(roadBbox, controller.signal)
      .then((collection) => {
        if (controller.signal.aborted) return;
        const active = sceneRef.current;
        addDetailedCityRoads(map, collection, active.colors, currentScale(), active.strokeWeight);
        map.once('idle', () => {
          onReadyStateChangeRef.current?.(true);
          reportMapPreview(map);
        });
        map.triggerRepaint();
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) onReadyStateChangeRef.current?.(true);
      });

    return () => controller.abort();
  }, [bboxKey, currentScale, kind, reportMapPreview, styleReady]);

  // Camera follows the scene whenever the change did not come from the map.
  useEffect(() => {
    if (!styleReady) return;
    if (sceneRef.current.freeViewport) return;
    fitViewport(sceneRef.current.viewport);
  }, [bboxKey, styleReady, fitViewport]);

  // The canvas changed size — because the paper shape or border changed, the
  // window resized, or the supersample factor moved. Both the camera and the
  // stroke scale are derived from canvas width, so both have to catch up.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || canvasWidth <= 0) return;
    map.resize();
    const active = sceneRef.current;
    const scale = strokeScaleFor(map.getCanvas().clientWidth || canvasWidth);
    applyPrintDetail(map, kind, active.detail, scale, active.strokeWeight);
    applyPrintColors(map, active.colors, scale);
    if (kind === 'state') styleDetailedStateFeatures(map, scale, active.strokeWeight);
    if (geometry && kind !== 'city') {
      applyPrintRegionOutline(map, geometry, active.colors, scale);
    }
    applyRegionMapLayers(map, active.region, active.detail, active.detailBias, active.place.kind);
    if (!active.freeViewport) fitViewport(active.viewport);
    map.once('render', () => reportMapPreview(map));
    map.triggerRepaint();
  }, [canvasWidth, canvasHeight, scene.orientation, currentScale, geometry, kind, styleReady, fitViewport, reportMapPreview]);

  // Framing is an explicit phase. Once styling begins, every MapLibre input
  // handler is disabled so a stray drag, wheel, or pinch cannot change the
  // composition underneath the user's design.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const toggle = interactive ? 'enable' : 'disable';
    for (const handler of [
      map.dragPan,
      map.scrollZoom,
      map.boxZoom,
      map.keyboard,
      map.doubleClickZoom,
      map.touchZoomRotate,
    ]) {
      try { handler?.[toggle](); } catch {}
    }
    // Rotation remains forbidden even while framing is editable.
    try { map.dragRotate.disable(); } catch {}
    try { map.touchZoomRotate.disableRotation(); } catch {}
    map.getCanvas().style.cursor = interactive ? 'grab' : 'default';
  }, [interactive, styleReady]);

  const paper = scene.colors.land || '#ffffff';
  const ink = scene.colors.useMapDefault
    ? '#4a4a48'
    : (scene.colors.water || scene.colors.roads || '#07122a');

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: paper, aspectRatio: `1 / ${geo.ratio}` }}
      data-testid="print-sheet"
      data-map-detail={scene.detailBias}
      data-state-detail-loaded={kind === 'state' ? stateDetailLoaded : undefined}
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
        ref={mapAreaRef}
        className="absolute overflow-hidden"
        style={{
          left: percent(geo.mapRect.x),
          top: percent(geo.mapRect.y),
          width: percent(geo.mapRect.w),
          height: percent(geo.mapRect.h),
          backgroundColor: paper,
        }}
      >
        {/* Oversized when the print needs the residential network, then scaled
            back to the display size. MapLibre divides pointer coordinates by
            the element's scale, so dragging and pinching stay 1:1. */}
        <div
          ref={containerRef}
          style={canvasWidth > 0 ? {
            width: canvasWidth,
            height: canvasHeight,
            transform: supersample === 1 ? undefined : `scale(${1 / supersample})`,
            transformOrigin: 'top left',
          } : { width: '100%', height: '100%' }}
        />
      </div>

      {children}

      {geo.titleBand && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 h-px"
          style={{
            top: geo.titleBand.edge === 'top'
              ? percent(geo.titleBand.height)
              : percent(1 - geo.titleBand.height),
            backgroundColor: ink,
            opacity: 0.18,
          }}
        />
      )}

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
