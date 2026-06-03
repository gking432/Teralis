'use client';

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import { getPrintInkColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { applyPrintMapStyle, applyPrintMaskColor, wantsEveryTown, getBorderWidth, type PrintDetailSettings, DEFAULT_DETAIL_SETTINGS } from '@/lib/print/printRender';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { fetchBoundary } from '@/lib/print/boundaryCache';
import { effectiveTitleStyle, type PreviewTitleSettings, type TitleBlockSettings, type TitleStyle } from '@/lib/print/titleLayouts';

// Shared cache for all popup/fullscreen previews keyed by slug:colorScheme:layout
export const PREVIEW_SNAPSHOT_CACHE = new Map<string, string>();

// 8" wide at 300 dpi — matches the smallest print size.
const RENDER_WIDTH = 2400;

export type Orientation = 'portrait' | 'landscape' | 'square';

// Height-to-width ratio per orientation. Portrait is 3:4 (taller), landscape
// is 4:3 (wider), square is 1:1. fitBounds adapts the camera to whatever
// canvas shape we render at.
export const ORIENTATION_RATIO: Record<Orientation, number> = {
  portrait: 4 / 3,
  landscape: 3 / 4,
  square: 1,
};

export function isValidOrientation(s: string | null | undefined): s is Orientation {
  return s === 'portrait' || s === 'landscape' || s === 'square';
}

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

// Footer band height as a fraction of the MAP area (not the total canvas).
// This way the map keeps its orientation-based ratio and the footer adds
// extra paper below it — so turning the title on grows the print's total
// height rather than squishing the map.
function getFooterFraction(
  layout: string,
  style: TitleStyle = 'standard',
  enabled = true,
): number {
  if (!enabled) return 0;
  if (style === 'translucent') return 0;
  if (layout === 'classic-bottom') return 0.15;
  if (layout === 'compact-bottom') return 0.10;
  return 0; // overlay / freeform layouts add no extra height
}

function getFooterHeight(layout: string, mapHeight: number, style: TitleStyle = 'standard', enabled = true): number {
  return Math.round(mapHeight * getFooterFraction(layout, style, enabled));
}

// Effective height/width ratio of the actual print, including any title footer.
// Used by the customizer preview container and the download canvas height.
export function getEffectivePrintRatio(
  orientation: Orientation,
  titleEnabled: boolean,
  layout: string,
  style: TitleStyle,
): number {
  const base = ORIENTATION_RATIO[orientation]; // mapH / rw
  return base * (1 + getFooterFraction(layout, style, titleEnabled));
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
  style: TitleStyle = 'standard',
): void {
  const hasSubtitle = subtitle.length > 0;
  const hasDetail = detail.length > 0;
  const isLong = title.length > 10;
  const isVeryLong = title.length > 16;
  const isExtreme = title.length > 24;
  const fitRatio = Math.min(1, 11 / Math.max(title.length, 1));
  const trans = style === 'translucent';

  // For translucent style: stroke in ink first, then fill in land on top.
  // The land fill is clear on dark (ink) areas; where it blends into light
  // (land) bg the ink stroke carries the legibility instead.
  function startText() {
    ctx.save();
  }
  function drawText(text: string, x: number, y: number, maxW?: number) {
    if (trans) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.5, ctx.canvas.width * 0.0004);
      ctx.lineJoin = 'round';
      if (maxW !== undefined) { ctx.strokeText(text, x, y, maxW); } else { ctx.strokeText(text, x, y); }
      ctx.fillStyle = land;
      if (maxW !== undefined) { ctx.fillText(text, x, y, maxW); } else { ctx.fillText(text, x, y); }
    } else {
      ctx.fillStyle = ink;
      if (maxW !== undefined) { ctx.fillText(text, x, y, maxW); } else { ctx.fillText(text, x, y); }
    }
  }
  function endText() { ctx.restore(); }

  if (layout === 'classic-bottom' || layout === 'compact-bottom') {
    const isClassic = layout === 'classic-bottom';
    // In translucent mode there's no footer strip; emulate the band height so
    // text still sits in the same vertical position over the bottom of the map.
    const fh = trans
      ? Math.round(totalHeight * (isClassic ? 0.135 : 0.095))
      : footerHeight;
    const bandTop = trans ? totalHeight - fh : mapHeight;

    if (!trans) {
      ctx.fillStyle = land;
      ctx.fillRect(0, bandTop, width, fh);
      ctx.strokeStyle = ink;
      ctx.lineWidth = isClassic ? Math.max(3, width * 0.0012) : Math.max(2, width * 0.0008);
      ctx.beginPath();
      ctx.moveTo(0, bandTop);
      ctx.lineTo(width, bandTop);
      ctx.stroke();
    }

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
    let textY = bandTop + (fh - totalTextHeight) / 2 + titleSize * 0.88;

    startText();
    ctx.textAlign = 'center';
    ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    drawText(title, width / 2, textY);

    if (hasSubtitle) {
      textY += titleSize * 0.22 + subSize;
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.26);
      drawText(subtitle, width / 2, textY);
    }
    if (hasDetail) {
      textY += subSize * 0.18 + detSize;
      ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.14);
      drawText(detail, width / 2, textY);
    }
    endText();
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

    if (!trans) {
      ctx.fillStyle = land;
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.fillStyle = ink;
      ctx.fillRect(panelX, panelY, borderW, panelH);
    }

    startText();
    ctx.textAlign = 'left';
    let textY = panelY + pad + titleSize * 0.88;
    ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    drawText(title, panelX + borderW + pad, textY, panelW - borderW - pad * 2);
    if (hasSubtitle) {
      textY += titleSize * 0.22 + subSize;
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.16);
      drawText(subtitle, panelX + borderW + pad, textY, panelW - borderW - pad * 2);
    }
    if (hasDetail) {
      textY += subSize * 0.18 + detSize;
      ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.08);
      drawText(detail, panelX + borderW + pad, textY, panelW - borderW - pad * 2);
    }
    endText();
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

    if (!trans) {
      ctx.fillStyle = land;
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.fillStyle = ink;
      ctx.fillRect(panelX, panelY, panelW, borderH);
    }

    startText();
    ctx.textAlign = 'right';
    let textY = panelY + borderH + pad + titleSize * 0.88;
    ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    drawText(title, panelX + panelW - pad, textY);
    if (hasSubtitle) {
      textY += titleSize * 0.22 + subSize;
      ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.12);
      drawText(subtitle, panelX + panelW - pad, textY);
    }
    if (hasDetail) {
      textY += subSize * 0.18 + detSize;
      ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.08);
      drawText(detail, panelX + panelW - pad, textY);
    }
    endText();
    return;
  }

  if (layout === 'side-rail') {
    const railW = Math.round(W * 0.085);
    const railX = Math.round(W * 0.03);
    const railTop = Math.round(MH * 0.04);
    const railH = MH - 2 * railTop;
    const dividerW = Math.max(1, Math.round(W * 0.0006));

    if (!trans) {
      ctx.fillStyle = land;
      ctx.fillRect(railX, railTop, railW, railH);
      ctx.fillStyle = ink;
      ctx.fillRect(railX + railW - dividerW, railTop, dividerW, railH);
    }

    const railTitleSize = Math.round(railW * 0.5);
    const railSubSize = Math.round(railW * 0.22);
    const railDetSize = Math.round(railW * 0.18);

    // Single rotated coordinate system anchored at the bottom-center of the
    // rail. After rotate(-90°): +X axis points UP the page; +Y axis points
    // out toward the map. textBaseline='middle' centers the text on the
    // rail's horizontal midline. Stack title → subtitle → detail upward.
    startText();
    ctx.translate(railX + railW / 2, railTop + railH);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let cursor = railH * 0.06;

    ctx.font = `300 ${railTitleSize}px "Cormorant Garamond", serif`;
    setLetterSpacing(ctx, letterSpacing);
    drawText(title, cursor, 0);
    cursor += ctx.measureText(title).width + railH * 0.035;

    if (hasSubtitle) {
      ctx.font = `400 ${railSubSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.22);
      drawText(subtitle, cursor, 0);
      cursor += ctx.measureText(subtitle).width + railH * 0.02;
    }

    if (hasDetail) {
      ctx.font = `400 ${railDetSize}px "DM Sans", sans-serif`;
      setLetterSpacing(ctx, 0.14);
      drawText(detail, cursor, 0);
    }

    endText();
    ctx.textBaseline = 'alphabetic';
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

// Clamp city/town bboxes so the resulting fitBounds zoom is high enough that
// OpenFreeMap Liberty tiles include residential / subdivision streets at that
// zoom. Nominatim sometimes returns very wide bboxes (e.g. Madison's includes
// Lakes Mendota/Monona and outlying suburbs); without clamping, fitBounds
// would zoom out below z13, where the tiles don't carry residential geometry,
// so the "More" roads toggle has nothing to enable.
function clampCityBbox(
  bbox: [string, string, string, string],
  center: [number, number],
  kind: 'country' | 'state' | 'city',
  rw: number,
  mapHeight: number,
): [string, string, string, string] {
  if (kind !== 'city') return bbox;

  const TARGET_ZOOM = 13;
  const PADDING_FRAC = 0.12;
  const usableW = rw * (1 - 2 * PADDING_FRAC);
  const usableH = mapHeight * (1 - 2 * PADDING_FRAC);
  const worldPx = 256 * Math.pow(2, TARGET_ZOOM);
  const [clon, clat] = center;
  const cosLat = Math.max(0.2, Math.cos((clat * Math.PI) / 180));
  // Mercator: lon-degrees per pixel are constant, lat-degrees per pixel scale
  // by cos(latitude) for small spans near `clat`.
  const maxLonSpan = (usableW / worldPx) * 360;
  const maxLatSpan = (usableH / worldPx) * 360 * cosLat;

  const south = Number(bbox[0]);
  const north = Number(bbox[1]);
  const west = Number(bbox[2]);
  const east = Number(bbox[3]);
  const lonSpan = east - west;
  const latSpan = north - south;

  if (lonSpan <= maxLonSpan && latSpan <= maxLatSpan) return bbox;

  const newLonSpan = Math.min(lonSpan, maxLonSpan);
  const newLatSpan = Math.min(latSpan, maxLatSpan);
  return [
    String(clat - newLatSpan / 2),
    String(clat + newLatSpan / 2),
    String(clon - newLonSpan / 2),
    String(clon + newLonSpan / 2),
  ];
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
  orientation: Orientation = 'portrait',
): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('aborted'));

  const rw = renderWidthOverride ?? RENDER_WIDTH;
  // Map area keeps the chosen orientation ratio. Footer is added BELOW the
  // map, so turning the title on grows the total print height rather than
  // squishing the map area.
  const mapHeight = Math.round(rw * ORIENTATION_RATIO[orientation]);
  // Border is city-only. State and country prints already get a visual frame
  // from the isolation-mask silhouette, so a redundant ink frame around them
  // would just thicken the look. City prints have no mask, so they get the
  // ink frame as their visual "edge" by default.
  const border = kind === 'city'
    ? getBorderWidth((detail ?? DEFAULT_DETAIL_SETTINGS).border, rw)
    : 0;
  const titleStyle = effectiveTitleStyle(titleSettings);
  const titleVisible = titleSettings.enabled && titleSettings.layout !== 'freeform';
  const footerHeight = titleVisible ? getFooterHeight(titleSettings.layout, mapHeight, titleStyle) : 0;
  const rh = mapHeight + footerHeight;
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

        if (titleVisible && title) {
          // Inverted style swaps the ink/land roles inside the title band,
          // so backgrounds become ink, text and dividers become land.
          const tbInk = titleStyle === 'inverted' ? land : ink;
          const tbLand = titleStyle === 'inverted' ? ink : land;
          if (footerHeight > 0) {
            // Footer layout: title band sits below the map, no border around it
            drawTitleBand(ctx, title, subtitle, detail, tbInk, tbLand, titleSettings.layout, rw, rh, mapHeight, footerHeight, titleStyle);
          } else {
            // Overlay layout (incl. translucent footer overlays): position
            // inside the bordered map area so the auto-contrast falls on
            // map content rather than the ink frame.
            ctx.save();
            ctx.translate(border, border);
            drawTitleBand(ctx, title, subtitle, detail, tbInk, tbLand, titleSettings.layout, innerMapW, innerMapH, innerMapH, 0, titleStyle);
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

    const cameraBbox = clampCityBbox(bbox, center, kind, rw, mapHeight);
    const map = new maplibregl.Map({
      container: mapDiv,
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
      bounds: [
        [Number(cameraBbox[2]), Number(cameraBbox[0])],
        [Number(cameraBbox[3]), Number(cameraBbox[1])],
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

export function bakeTitleBlock(
  ctx: CanvasRenderingContext2D,
  block: TitleBlockSettings,
  colors: PreviewColorSettings,
  printW: number,
  printH: number,
): void {
  if (!block.enabled || !block.title.trim()) return;

  const ink = getPrintInkColor(colors);
  const land = colors.land || '#ffffff';

  const px = block.x * printW;
  const py = block.y * printH;
  const pw = block.w * printW;
  const ph = block.h * printH;

  const title = block.title.trim().toUpperCase();
  const subtitle = block.subtitle.trim().toUpperCase();
  const detail = block.detail.trim().toUpperCase();
  const hasSub = subtitle.length > 0;
  const hasDet = detail.length > 0;
  const lineCount = 1 + (hasSub ? 1 : 0) + (hasDet ? 1 : 0);
  const isLong = title.length > 10;
  const isVeryLong = title.length > 16;
  const isExtreme = title.length > 24;
  const fitRatio = Math.min(1, 11 / Math.max(title.length, 1));
  const trans = block.style === 'translucent';

  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate((block.rotation * Math.PI) / 180);

  // Background — translucent skips fill entirely (clear glass).
  if (!trans) {
    ctx.fillStyle = block.style === 'inverted' ? ink : land;
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  }

  ctx.textAlign = 'center';

  const titleSize = Math.round(ph * (lineCount === 1 ? 0.46 : lineCount === 2 ? 0.38 : 0.32) * fitRatio);
  const subSize = Math.round(ph * 0.17);
  const detSize = Math.round(ph * 0.13);
  const gap = Math.round(ph * 0.05);

  const totalH = titleSize + (hasSub ? gap + subSize : 0) + (hasDet ? gap * 0.7 + detSize : 0);
  let cursor = -totalH / 2 + titleSize * 0.82;

  // Glass: stroke in ink first, then fill in land on top. This matches how
  // professional map labels handle unknown backgrounds: the land-colored fill
  // reads clearly on dark (ink) areas; where the fill blends into a light
  // (land-colored) background, the ink stroke carries the text instead.
  function drawTextLine(text: string, y: number, strokeW: number) {
    if (trans) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = strokeW;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, 0, y);
      ctx.fillStyle = land;
      ctx.fillText(text, 0, y);
    } else {
      ctx.fillStyle = block.style === 'standard' ? ink : land;
      ctx.fillText(text, 0, y);
    }
  }

  const ls = isExtreme ? '0.07em' : isVeryLong ? '0.12em' : isLong ? '0.18em' : '0.24em';
  ctx.font = `300 ${titleSize}px "Cormorant Garamond", serif`;
  (ctx as any).letterSpacing = ls;
  drawTextLine(title, cursor, Math.max(2, titleSize * 0.06));

  if (hasSub) {
    cursor += titleSize * 0.18 + gap + subSize;
    ctx.font = `400 ${subSize}px "DM Sans", sans-serif`;
    (ctx as any).letterSpacing = '0.22em';
    drawTextLine(subtitle, cursor, Math.max(1.5, subSize * 0.06));
  }
  if (hasDet) {
    cursor += subSize * 0.2 + gap * 0.7 + detSize;
    ctx.font = `400 ${detSize}px "DM Sans", sans-serif`;
    (ctx as any).letterSpacing = '0.14em';
    drawTextLine(detail, cursor, Math.max(1.5, detSize * 0.06));
  }

  ctx.restore();
}
