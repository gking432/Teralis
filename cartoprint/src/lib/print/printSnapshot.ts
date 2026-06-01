'use client';

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import { getPrintInkColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { applyPrintMapStyle, applyPrintMaskColor, wantsEveryTown, getBorderWidth, type PrintDetailSettings, DEFAULT_DETAIL_SETTINGS } from '@/lib/print/printRender';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { fetchBoundary } from '@/lib/print/boundaryCache';
import type { PreviewTitleSettings } from '@/lib/print/titleLayouts';

// Shared cache for all popup/fullscreen previews keyed by slug:colorScheme:layout
export const PREVIEW_SNAPSHOT_CACHE = new Map<string, string>();

// 8" wide at 300 dpi — matches the smallest print size. Portrait 3:4.
const RENDER_WIDTH = 2400;
const RENDER_TOTAL_HEIGHT = Math.round(RENDER_WIDTH * (4 / 3)); // 3200

// Stable string for a color combination — used inside the preview cache key so
// the thumbnail and the customizer (which both default to the same colors)
// resolve to the exact same cached PNG.
export function colorCacheKey(c: PreviewColorSettings): string {
  return `${c.land}_${c.water}_${c.roads}_${c.useMapDefault ? 'd' : ''}`;
}

export function getPreviewCacheKey(
  slug: string,
  colorScheme: string,
  layout: string,
  detail?: PrintDetailSettings,
): string {
  const d = detail ?? DEFAULT_DETAIL_SETTINGS;
  return `${slug}:${colorScheme}:${layout}:${d.places}:${d.roads}:${d.counties ? 'c' : ''}:b${d.border}`;
}

function getFooterHeight(layout: string, totalHeight: number): number {
  if (layout === 'classic-bottom') return Math.round(totalHeight * 0.135);
  if (layout === 'compact-bottom') return Math.round(totalHeight * 0.095);
  return 0; // overlay layouts have no footer strip
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, em: number) {
  (ctx as any).letterSpacing = `${em}em`;
}

function drawTitleBand(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  detail: string,
  ink: string,
  land: string,
  layout: string,
  width: number,
  totalHeight: number,
  mapHeight: number,
  footerHeight: number,
): void {
  const hasSubtitle = subtitle.length > 0;
  const hasDetail = detail.length > 0;
  const isLong = title.length > 10;
  const isVeryLong = title.length > 16;
  const isExtreme = title.length > 24;
  const fitRatio = Math.min(1, 11 / Math.max(title.length, 1));

  if (layout === 'classic-bottom' || layout === 'compact-bottom') {
    const isClassic = layout === 'classic-bottom';
    const fh = footerHeight;

    ctx.fillStyle = land;
    ctx.fillRect(0, mapHeight, width, fh);

    ctx.strokeStyle = ink;
    ctx.lineWidth = isClassic ? Math.max(3, width * 0.0012) : Math.max(2, width * 0.0008);
    ctx.beginPath();
    ctx.moveTo(0, mapHeight);
    ctx.lineTo(width, mapHeight);
    ctx.stroke();

    const baseSize = isClassic
      ? Math.max(48, Math.min(fh * (hasSubtitle || hasDetail ? 0.33 : 0.44), 160))
      : Math.max(32, Math.min(fh * (hasSubtitle || hasDetail ? 0.31 : 0.42), 110));
    const titleSize = Math.round(baseSize * fitRatio);
    const letterSpacing = isExtreme ? 0.08 : isVeryLong ? 0.12 : isLong ? 0.18 : 0.28;
    const subSize = isClassic ? Math.round(fh * 0.18) : Math.round(fh * 0.16);
    const detSize = isClassic ? Math.round(fh * 0.14) : Math.round(fh * 0.12);

    const totalTextHeight =
      titleSize +
      (hasSubtitle ? fh * 0.06 + subSize : 0) +
      (hasDetail ? fh * 0.04 + detSize : 0);
    let textY = mapHeight + (fh - totalTextHeight) / 2 + titleSize * 0.88;

    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    ctx.fillText(title, width / 2, textY);

    if (hasSubtitle) {
      textY += titleSize * 0.22 + subSize;
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.26);
      ctx.fillText(subtitle, width / 2, textY);
    }
    if (hasDetail) {
      textY += subSize * 0.18 + detSize;
      ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.14);
      ctx.fillText(detail, width / 2, textY);
    }
    return;
  }

  // Overlay layouts: text drawn on top of the full-height map canvas
  const W = width;
  const MH = totalHeight;
  const titleSize = Math.round(W * (isExtreme ? 0.0083 : isVeryLong ? 0.01 : isLong ? 0.013 : 0.017));
  const subSize = Math.round(W * 0.0075);
  const detSize = Math.round(W * 0.006);
  const letterSpacing = isExtreme ? 0.04 : isVeryLong ? 0.07 : isLong ? 0.1 : 0.14;
  const pad = Math.round(W * 0.012);

  if (layout === 'top-left') {
    const panelW = Math.round(W * 0.28);
    const panelX = Math.round(W * 0.04);
    const panelY = Math.round(MH * 0.04);
    const panelH = Math.round(
      pad * 2 + titleSize +
      (hasSubtitle ? pad * 0.6 + subSize : 0) +
      (hasDetail ? pad * 0.4 + detSize : 0)
    );
    const borderW = Math.max(2, Math.round(W * 0.0008));

    ctx.fillStyle = land;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = ink;
    ctx.fillRect(panelX, panelY, borderW, panelH);

    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    let textY = panelY + pad + titleSize * 0.88;
    ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    ctx.fillText(title, panelX + borderW + pad, textY, panelW - borderW - pad * 2);
    if (hasSubtitle) {
      textY += titleSize * 0.22 + subSize;
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.16);
      ctx.fillText(subtitle, panelX + borderW + pad, textY, panelW - borderW - pad * 2);
    }
    if (hasDetail) {
      textY += subSize * 0.18 + detSize;
      ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.08);
      ctx.fillText(detail, panelX + borderW + pad, textY, panelW - borderW - pad * 2);
    }
    return;
  }

  if (layout === 'minimal-corner') {
    const panelW = Math.round(W * 0.28);
    const panelH = Math.round(
      pad * 2 + titleSize +
      (hasSubtitle ? pad * 0.6 + subSize : 0) +
      (hasDetail ? pad * 0.4 + detSize : 0)
    );
    const panelX = W - Math.round(W * 0.04) - panelW;
    const panelY = MH - Math.round(MH * 0.04) - panelH;
    const borderH = Math.max(1, Math.round(W * 0.0004));

    ctx.fillStyle = land;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = ink;
    ctx.fillRect(panelX, panelY, panelW, borderH);

    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    let textY = panelY + borderH + pad + titleSize * 0.88;
    ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    ctx.fillText(title, panelX + panelW - pad, textY);
    if (hasSubtitle) {
      textY += titleSize * 0.22 + subSize;
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.12);
      ctx.fillText(subtitle, panelX + panelW - pad, textY);
    }
    if (hasDetail) {
      textY += subSize * 0.18 + detSize;
      ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.08);
      ctx.fillText(detail, panelX + panelW - pad, textY);
    }
    return;
  }

  if (layout === 'side-rail') {
    const railW = Math.round(W * 0.08);
    const railX = Math.round(W * 0.03);
    const railTop = Math.round(MH * 0.04);
    const railH = MH - 2 * railTop;
    const railTitleSize = Math.round(railW * 0.55);
    const borderW = Math.max(1, Math.round(W * 0.0004));

    ctx.fillStyle = land;
    ctx.fillRect(railX, railTop, railW, railH);
    ctx.fillStyle = ink;
    ctx.fillRect(railX + railW - borderW, railTop, borderW, railH);

    ctx.save();
    ctx.translate(railX + railW / 2, railTop + railH);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.font = `300 ${railTitleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    ctx.fillText(title, 0, railTitleSize * 0.88, railH);
    ctx.restore();

    if (hasSubtitle) {
      ctx.save();
      ctx.translate(railX + railW * 0.5, railTop + Math.round(subSize * 1.5));
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = ink;
      ctx.textAlign = 'right';
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.12);
      ctx.fillText(subtitle, 0, subSize * 0.88);
      ctx.restore();
    }
  }
}

// Sizes (width × height) for common print sizes at 300 DPI
export const PRINT_SIZES: Record<string, { width: number; height: number; label: string }> = {
  'preview':  { width: 2400,  height: 3200,  label: 'Preview (2400 px)' },
  '12x16':    { width: 3600,  height: 4800,  label: '12 × 16 in (300 DPI)' },
  '18x24':    { width: 5400,  height: 7200,  label: '18 × 24 in (300 DPI)' },
  '24x36':    { width: 7200,  height: 10800, label: '24 × 36 in (300 DPI)' },
};

export type { PrintDetailSettings };
export { DEFAULT_DETAIL_SETTINGS };

// Adds a dense "every town" label layer from the place dataset, used when the
// Places detail is set to More. Mirrors the full builder's print-place layer.
function addEveryTownLayer(
  map: maplibregl.Map,
  fc: GeoJSON.FeatureCollection,
  ink: string,
  land: string,
): void {
  if (!fc?.features?.length) return;
  try {
    if (map.getLayer('print-every-town-labels')) map.removeLayer('print-every-town-labels');
    if (map.getLayer('print-every-town-dots')) map.removeLayer('print-every-town-dots');
    if (map.getSource('print-every-town')) map.removeSource('print-every-town');
  } catch {}
  try {
    map.addSource('print-every-town', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'print-every-town-dots',
      type: 'circle',
      source: 'print-every-town',
      paint: {
        'circle-color': ink,
        'circle-radius': ['match', ['get', 'place'], 'city', 2.4, 'town', 1.9, 'village', 1.5, 1.2],
        'circle-opacity': 0.6,
      },
    });
    map.addLayer({
      id: 'print-every-town-labels',
      type: 'symbol',
      source: 'print-every-town',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['match', ['get', 'place'], 'city', 13, 'town', 11, 'village', 10, 9.5],
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.4,
        'text-justify': 'auto',
        'text-allow-overlap': false,
        'text-optional': true,
        'text-padding': 1,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: {
        'text-color': ink,
        'text-halo-color': land,
        'text-halo-width': 1.4,
      },
    });
  } catch {}
}

export async function renderPrintSnapshot(
  slug: string,
  bbox: [string, string, string, string],
  center: [number, number],
  kind: 'country' | 'state' | 'city',
  colorSettings: PreviewColorSettings,
  titleSettings: PreviewTitleSettings,
  geometry: GeoJSON.Geometry | null,
  signal?: AbortSignal,
  detail?: PrintDetailSettings,
  renderWidthOverride?: number,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('aborted'));

  const rw = renderWidthOverride ?? RENDER_WIDTH;
  const rh = Math.round(rw * (4 / 3));
  // Border is city-only. State and country prints already get a visual frame
  // from the isolation-mask silhouette, so a redundant ink frame around them
  // would just thicken the look. City prints have no mask, so they get the
  // ink frame as their visual "edge" by default.
  const border = kind === 'city'
    ? getBorderWidth((detail ?? DEFAULT_DETAIL_SETTINGS).border, rw)
    : 0;
  const footerHeight = getFooterHeight(titleSettings.layout, rh);
  const mapHeight = rh - footerHeight;
  // The bordered region inside the map area. MapLibre always renders at the
  // FULL (rw × mapHeight) — independent of border thickness — so the camera
  // zoom level is identical regardless of border. We then draw the rendered
  // canvas scaled into the inner region during composition. This guarantees
  // road density, label density, and visible content are the same whether
  // the user picks none / thin / medium / thick borders.
  const innerMapW = rw - 2 * border;
  const innerMapH = mapHeight - 2 * border;

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return; }

    const mapDiv = document.createElement('div');
    mapDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${rw}px;height:${mapHeight}px;`;
    document.body.appendChild(mapDiv);

    let snapshotted = false;
    let styleLoaded = false;
    let geom: GeoJSON.Geometry | null = geometry;
    let geometryReady = false;
    // Gate the snapshot on the "every town" dataset when Places = More.
    let placesReady = !(detail && wantsEveryTown(detail));
    let placesFetchStarted = false;

    const fallback = window.setTimeout(() => { void doSnapshot(true); }, 15000);

    function loadEveryTownIfNeeded() {
      if (placesFetchStarted) return;
      if (!detail || !wantsEveryTown(detail)) { placesReady = true; return; }
      placesFetchStarted = true;
      fetch('/api/print/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox, geometry: geom, towns: true }),
      })
        .then((r) => r.json())
        .then((fc: GeoJSON.FeatureCollection) => {
          if (snapshotted) return;
          addEveryTownLayer(map, fc, getPrintInkColor(colorSettings), colorSettings.land || '#ffffff');
        })
        .catch(() => {})
        .finally(() => {
          // Mark ready AFTER the GeoJSON source has been added. Do NOT call
          // doSnapshot directly here — adding a GeoJSON source triggers a
          // MapLibre re-render. We wait for the next idle event so the labels
          // are actually painted before the canvas is captured.
          placesReady = true;
        });
    }

    function cleanup() {
      window.clearTimeout(fallback);
      try { map.remove(); } catch {}
      if (document.body.contains(mapDiv)) document.body.removeChild(mapDiv);
    }

    async function doSnapshot(force: boolean) {
      if (snapshotted) return;
      if (!force && (!geometryReady || !placesReady || !map.areTilesLoaded())) return;
      snapshotted = true;

      try {
        // Ensure fonts (Cormorant Garamond, DM Sans) are ready before drawing text
        await document.fonts.ready;

        const ink = getPrintInkColor(colorSettings);
        const land = colorSettings.land || '#ffffff';
        const title = titleSettings.title.trim().toUpperCase();
        const subtitle = titleSettings.subtitle.trim().toUpperCase();
        const detail = titleSettings.detail.trim().toUpperCase();

        const c = document.createElement('canvas');
        c.width = rw;
        c.height = rh;
        const ctx = c.getContext('2d')!;

        // Land fill for the title band area below the map (unbordered, edge to
        // edge). Drawn first so subsequent layers paint on top.
        ctx.fillStyle = land;
        ctx.fillRect(0, 0, rw, rh);

        // Map area frame: ink rectangle over the entire map portion (NOT the
        // title band below it), then land fill over the inner region. The
        // border ends flush against the top of the title band.
        if (border > 0) {
          ctx.fillStyle = ink;
          ctx.fillRect(0, 0, rw, mapHeight);
          ctx.fillStyle = land;
          ctx.fillRect(border, border, innerMapW, innerMapH);
        }

        // Draw the rendered map into the bordered inner region.
        ctx.drawImage(map.getCanvas(), border, border, innerMapW, innerMapH);

        if (titleSettings.enabled && title) {
          if (footerHeight > 0) {
            // Footer layout: title band sits below the map, no border around it
            drawTitleBand(ctx, title, subtitle, detail, ink, land, titleSettings.layout, rw, rh, mapHeight, footerHeight);
          } else {
            // Overlay layout: position the title inside the bordered map area
            ctx.save();
            ctx.translate(border, border);
            drawTitleBand(ctx, title, subtitle, detail, ink, land, titleSettings.layout, innerMapW, innerMapH, innerMapH, 0);
            ctx.restore();
          }
        }

        const url = c.toDataURL('image/png');
        cleanup();
        resolve(url);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    function tryApplyMask() {
      if (!geom || !styleLoaded) return;

      // For cities, we don't want to cut out a jagged city-shaped silhouette —
      // a city print is a normal map view cropped by the bbox, with neighboring
      // streets and labels still visible for context. Skip the isolation mask
      // and the `within` label filter; the bbox crop alone does the framing.
      // (We still keep the geometry around for the server-side every-town
      //  filter, which uses it to pick which places to label.)
      if (kind === 'city') {
        geometryReady = true;
        loadEveryTownIfNeeded();
        return;
      }

      applyIsolationMask(map, { name: slug, type: kind, fullName: slug, bbox, geojson: geom }, 1);
      applyPrintMaskColor(map, colorSettings);
      // Move city/town/capital symbol layers above the mask so labels that
      // straddle the state border aren't clipped by the ink fill — but filter
      // each one to features that fall WITHIN the boundary, so labels from
      // neighbouring states don't appear in the masked-out white space.
      const within: maplibregl.ExpressionSpecification = ['within', geom as GeoJSON.Polygon | GeoJSON.MultiPolygon];
      const style = map.getStyle();
      if (style) {
        style.layers.forEach((layer) => {
          if (layer.type === 'symbol' && /label_(city|city_capital|town|village)/.test(layer.id)) {
            try {
              const existing = map.getFilter(layer.id) as maplibregl.FilterSpecification | undefined;
              const combined = existing
                ? (['all', existing, within] as maplibregl.FilterSpecification)
                : (within as maplibregl.FilterSpecification);
              map.setFilter(layer.id, combined);
              map.moveLayer(layer.id);
            } catch {}
          }
        });
      }
      geometryReady = true;
      loadEveryTownIfNeeded();
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        if (!snapshotted) { snapshotted = true; cleanup(); reject(new Error('aborted')); }
      });
    }

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
      fitBoundsOptions: {
        padding: Math.round(Math.min(rw, mapHeight) * 0.12),
        animate: false,
      },
    });

    map.on('load', () => {
      applyPrintMapStyle(map, colorSettings, kind, detail);
      initIsolationLayers(map);
      applyPrintMaskColor(map, colorSettings);
      styleLoaded = true;

      if (geom) {
        tryApplyMask();
      } else {
        fetchBoundary(slug, center, kind).then((record) => {
          if (snapshotted) return;
          if (record?.geometry) { geom = record.geometry; tryApplyMask(); }
          else { geometryReady = true; loadEveryTownIfNeeded(); }
        });
      }
    });

    map.on('idle', () => { void doSnapshot(false); });
  });
}
