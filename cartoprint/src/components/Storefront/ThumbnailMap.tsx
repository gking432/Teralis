'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import { applyPreviewColorSettings, hidePrintLabels, applyMaskColor, getPrintInkColor, DEFAULT_COLOR_SCHEME } from '@/lib/print/colorSchemes';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';

interface ThumbnailMapProps {
  slug: string;
  bbox: [string, string, string, string];
  center: [number, number];
  kind: 'country' | 'state' | 'city';
  title: string;
  subtitle: string;
  detail: string;
  className?: string;
}

// Shared snapshot cache — exported so the popup can show it immediately
export const SNAPSHOT_CACHE = new Map<string, string>();

// Portrait 3:4. Footer is 13.5% of total height.
const FOOTER_RATIO = 0.135;
const ASPECT = 4 / 3; // height = width * ASPECT

function buildCompositeSnapshot(
  mapCanvas: HTMLCanvasElement,
  width: number,
  mapHeight: number,
  footerHeight: number,
  ink: string,
  land: string,
  title: string,
  subtitle: string,
  detail: string
): string {
  const totalHeight = mapHeight + footerHeight;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = totalHeight;
  const ctx = c.getContext('2d')!;

  // Draw map
  ctx.drawImage(mapCanvas, 0, 0, width, mapHeight);

  // Footer band
  ctx.fillStyle = land;
  ctx.fillRect(0, mapHeight, width, footerHeight);

  // Top border line on footer
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, width * 0.004);
  ctx.beginPath();
  ctx.moveTo(0, mapHeight);
  ctx.lineTo(width, mapHeight);
  ctx.stroke();

  // Title text (centered, uppercase)
  const titleSize = Math.round(footerHeight * 0.36);
  const subSize = Math.round(footerHeight * 0.18);
  const detSize = Math.round(footerHeight * 0.14);
  const cx = width / 2;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';

  const hasSubtitle = subtitle.trim().length > 0;
  const hasDetail = detail.trim().length > 0;
  const lineCount = 1 + (hasSubtitle ? 1 : 0) + (hasDetail ? 1 : 0);
  const totalTextHeight = titleSize + (hasSubtitle ? subSize + footerHeight * 0.06 : 0) + (hasDetail ? detSize + footerHeight * 0.04 : 0);
  let textY = mapHeight + (footerHeight - totalTextHeight) / 2 + titleSize * 0.88;

  ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
  ctx.letterSpacing = `${Math.min(0.28, 10 / Math.max(title.length, 1) * 0.28)}em` as any;
  ctx.fillText(title.toUpperCase(), cx, textY);

  if (hasSubtitle) {
    textY += titleSize * 0.22 + subSize;
    ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
    ctx.letterSpacing = '0.26em' as any;
    ctx.fillText(subtitle.toUpperCase(), cx, textY);
  }

  if (hasDetail) {
    textY += subSize * 0.18 + detSize;
    ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
    ctx.letterSpacing = '0.14em' as any;
    ctx.fillText(detail.toUpperCase(), cx, textY);
  }

  return c.toDataURL('image/png');
}

export function ThumbnailMap({ slug, bbox, center, kind, title, subtitle, detail, className }: ThumbnailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(() => SNAPSHOT_CACHE.get(slug) ?? null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (dataUrl) return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setShouldMount(true); observer.disconnect(); }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [dataUrl]);

  useEffect(() => {
    if (!shouldMount || dataUrl) return;
    const node = containerRef.current;
    if (!node) return;

    // Render into the map portion of a portrait container.
    // The node is the full portrait card area; map lives in the top (1 - FOOTER_RATIO) fraction.
    const totalWidth = node.clientWidth || 240;
    const totalHeight = Math.round(totalWidth * ASPECT);
    const footerHeight = Math.round(totalHeight * FOOTER_RATIO);
    const mapHeight = totalHeight - footerHeight;

    // Hidden map div sized to the map area only
    const mapDiv = document.createElement('div');
    mapDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${totalWidth}px;height:${mapHeight}px;`;
    document.body.appendChild(mapDiv);

    let cancelled = false;
    const colors = DEFAULT_COLOR_SCHEME.colors;
    const ink = getPrintInkColor(colors);
    const land = colors.land;

    const map = new maplibregl.Map({
      container: mapDiv,
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
      bounds: [
        [Number(bbox[2]), Number(bbox[0])],
        [Number(bbox[3]), Number(bbox[1])],
      ],
      fitBoundsOptions: { padding: 16, animate: false },
    });

    let snapshotted = false;
    let geometryReady = false;
    let styleLoaded = false;
    let geometry: GeoJSON.Geometry | null = getCachedBoundary(slug)?.geometry ?? null;
    const fallback = window.setTimeout(() => snapshot(true), 12000);

    function snapshot(force: boolean) {
      if (snapshotted) return;
      if (!force && (!geometryReady || !map.areTilesLoaded())) return;
      snapshotted = true;
      window.clearTimeout(fallback);
      try {
        const url = buildCompositeSnapshot(
          map.getCanvas(), totalWidth, mapHeight, footerHeight, ink, land, title, subtitle, detail
        );
        SNAPSHOT_CACHE.set(slug, url);
        if (!cancelled) setDataUrl(url);
      } catch (err) {
        console.warn('Thumbnail snapshot failed', err);
      }
      map.remove();
      document.body.removeChild(mapDiv);
    }

    function tryApplyMask() {
      if (!geometry || !styleLoaded) return;
      applyIsolationMask(map, { name: slug, type: kind, fullName: slug, bbox, geojson: geometry }, 1);
      applyMaskColor(map, colors);
      geometryReady = true;
    }

    map.on('load', () => {
      hidePrintLabels(map);
      applyPreviewColorSettings(map, colors);
      initIsolationLayers(map);
      // Default mask to ink color so exterior shows correctly before geometry arrives
      applyMaskColor(map, colors);
      styleLoaded = true;
      if (geometry) {
        tryApplyMask();
      } else {
        fetchBoundary(slug, center, kind).then((record) => {
          if (cancelled) return;
          if (record?.geometry) { geometry = record.geometry; tryApplyMask(); }
          else { geometryReady = true; }
        });
      }
    });

    map.on('idle', () => snapshot(false));

    // If geometry was already cached, ensure mask is applied once style loads
    if (geometry && !styleLoaded) {
      // tryApplyMask called inside load handler above
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      if (!snapshotted) {
        try { map.remove(); } catch {}
        if (document.body.contains(mapDiv)) document.body.removeChild(mapDiv);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldMount, dataUrl, slug]);

  return (
    <div ref={containerRef} className={className} style={{ aspectRatio: '3/4' }}>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-full w-full bg-[#07122a]/8" />
      )}
    </div>
  );
}
