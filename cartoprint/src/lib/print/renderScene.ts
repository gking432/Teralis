'use client';

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import { getStateCatalogPrints } from '@/lib/catalog/prints';
import { getPrintInkColor } from '@/lib/print/colorSchemes';
import {
  addDetailedCityRoads,
  addDetailedStateFeatures,
  applyRegionMapLayers,
  applyPrintMapStyle,
  applyPrintMaskColor,
  wantsEveryTown,
} from '@/lib/print/printRender';
import { fetchDetailedCityRoads } from '@/lib/print/cityRoads';
import { fetchDetailedStateFeatures } from '@/lib/print/stateDetails';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { strokeScaleFor } from '@/lib/print/strokes';
import { printGeometry } from '@/lib/print/geometry';
import { supersampleFactor } from '@/lib/print/tileZoom';
import { bakeTitle } from '@/lib/print/bakeTitle';
import type { PrintScene } from '@/lib/print/scene';
import { drawDecorations } from '@/lib/print/decorations';

/**
 * The high-resolution renderer.
 *
 * This is the ONLY place an offscreen MapLibre instance is created, and it now
 * runs once — when the user exports or continues to checkout — rather than on
 * every colour tweak and every keystroke of the title.
 *
 * It derives its layout from the same `printGeometry` the live canvas uses and
 * bakes the title through the same routine the overlay renders with, so the
 * export matches what was on screen.
 */

const TILE_TIMEOUT_MS = 20000;

function addEveryTownLayer(
  map: maplibregl.Map,
  fc: GeoJSON.FeatureCollection,
  ink: string,
  land: string,
  haloWidth: number,
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
        'text-halo-width': haloWidth,
      },
    });
  } catch {}
}

function addUnitedStatesLabels(map: maplibregl.Map, ink: string, land: string, haloWidth: number): void {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = getStateCatalogPrints().map((state) => ({
    type: 'Feature',
    properties: { name: state.name },
    geometry: { type: 'Point', coordinates: state.center },
  }));

  try {
    map.addSource('print-us-state-labels', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });
    map.addLayer({
      id: 'print-us-state-labels',
      type: 'symbol',
      source: 'print-us-state-labels',
      layout: {
        'text-field': ['upcase', ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 14,
        'text-letter-spacing': 0.05,
        'text-max-width': 8,
        'text-allow-overlap': false,
        'text-optional': true,
        'text-padding': 2,
      },
      paint: {
        'text-color': ink,
        'text-halo-color': land,
        'text-halo-width': haloWidth,
      },
    });
  } catch {}
}

export interface RenderSceneOptions {
  /** Final image width in pixels. Height follows the orientation ratio. */
  width: number;
  signal?: AbortSignal;
}

export async function renderScene(
  scene: PrintScene,
  boundary: GeoJSON.Geometry | null,
  { width, signal }: RenderSceneOptions,
): Promise<string> {
  if (signal?.aborted) throw new Error('aborted');

  const geo = printGeometry(scene.orientation, scene.detail.border, scene.title);
  const sheetW = Math.round(width);
  const sheetH = Math.round(width * geo.ratio);

  // The map is rendered at EXACTLY the size it will occupy on the sheet, so a
  // thick border can no longer squash the artwork. (The previous renderer drew
  // a full-size map canvas into the smaller bordered box — a non-uniform
  // scale.)
  const targetMapW = Math.max(Math.round(geo.mapRect.w * sheetW), 1);
  const targetMapH = Math.max(Math.round(geo.mapRect.h * sheetH), 1);
  const kind = scene.place.kind === 'country' ? 'country' : scene.place.kind === 'state' ? 'state' : 'city';

  // Dense street work needs a high enough zoom that the tiles actually contain
  // residential roads. Render larger and downsample; the stroke scale is taken
  // from the render width, so the downsampled result still matches. This is the
  // same rule the live preview uses, so the two stay the same picture.
  const denseFactor = kind === 'city'
    ? 1
    : supersampleFactor(scene.viewport.bbox, targetMapW, scene.detail.roads, targetMapH);
  const renderMapW = Math.round(targetMapW * denseFactor);
  const renderMapH = Math.round(targetMapH * denseFactor);

  const scale = strokeScaleFor(renderMapW);
  const ink = getPrintInkColor(scene.colors);
  const paper = scene.colors.land || '#ffffff';

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${renderMapW}px;height:${renderMapH}px;`;
  document.body.appendChild(host);

  const map = new maplibregl.Map({
    container: host,
    style: STYLE_URL,
    center: scene.viewport.center,
    zoom: 10,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    fadeDuration: 0,
  });

  const cleanup = () => {
    try { map.remove(); } catch {}
    if (document.body.contains(host)) document.body.removeChild(host);
  };

  let styleLoaded = false;
  let settled = false;

  try {
    await new Promise<void>((resolve, reject) => {
      // The timeout is a backstop for slow tiles, not for a broken style. If
      // the style never loaded there is nothing to draw, and silently handing
      // back a blank sheet would be worse than saying so.
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(styleLoaded
          ? 'Map tiles did not finish loading.'
          : 'Map tiles are unavailable.'));
      }, TILE_TIMEOUT_MS);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      map.on('load', () => {
        styleLoaded = true;
        try { initIsolationLayers(map); } catch {}

        applyPrintMapStyle(map, scene.colors, kind, scene.detail, scale, scene.strokeWeight);
        applyRegionMapLayers(map, scene.region, scene.detail);

        if (boundary && kind !== 'city') {
          try {
            applyIsolationMask(map, {
              name: scene.place.name,
              type: kind,
              fullName: scene.place.searchQuery,
              geojson: boundary,
              bbox: scene.viewport.bbox,
            });
            applyPrintMaskColor(map, scene.colors);
          } catch {}
        }

        if (kind === 'country' && scene.detail.labels.cities) {
          addUnitedStatesLabels(map, ink, paper, 1.4 * scale.widthScale);
        }

        const [south, north, west, east] = scene.viewport.bbox.map(Number);
        map.fitBounds([[west, south], [east, north]], { padding: 0, animate: false, duration: 0 });

        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };

        const featureTasks: Promise<void>[] = [];

        if (kind === 'city') {
          featureTasks.push(fetchDetailedCityRoads(scene.viewport.bbox, signal)
            .then((fc) => {
              addDetailedCityRoads(map, fc, scene.colors, scale, scene.strokeWeight);
            })
            .catch(() => {}));
        }

        if (kind === 'state') {
          featureTasks.push(fetchDetailedStateFeatures(scene.viewport.bbox, signal)
            .then((fc) => {
              addDetailedStateFeatures(map, fc, scene.colors, scale, scene.strokeWeight);
              applyRegionMapLayers(map, scene.region, scene.detail);
              try { map.moveLayer('mask-layer'); } catch {}
            })
            .catch(() => {}));
        }

        if (wantsEveryTown(scene.detail)) {
          featureTasks.push(fetch('/api/print/features', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bbox: scene.viewport.bbox, geometry: boundary, towns: true }),
            signal,
          })
            .then((response) => (response.ok ? response.json() : null))
            .then((fc: GeoJSON.FeatureCollection | null) => {
              if (fc) addEveryTownLayer(map, fc, ink, paper, 1.4 * scale.widthScale);
            })
            .catch(() => {}));
        }

        if (featureTasks.length) {
          Promise.all(featureTasks).finally(() => {
            if (settled) return;
            map.once('idle', finish);
            map.triggerRepaint();
          });
        } else {
          // Style mutations are asynchronous. Waiting for the first full idle
          // frame after applying them prevents the exporter from capturing the
          // untouched base style while `areTilesLoaded()` still reports true.
          map.once('idle', finish);
          map.triggerRepaint();
        }
      });

      map.on('error', () => {/* tiles retry on their own; the timeout is the backstop */});
    });

    await document.fonts.ready;

    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create the print canvas');

    // Paper.
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, sheetW, sheetH);

    // Ink border around the map area only — never behind the title band.
    if (geo.borderFracW > 0) {
      ctx.fillStyle = ink;
      ctx.fillRect(
        Math.round(geo.mapFrameRect.x * sheetW),
        Math.round(geo.mapFrameRect.y * sheetH),
        Math.round(geo.mapFrameRect.w * sheetW),
        Math.round(geo.mapFrameRect.h * sheetH),
      );
    }

    ctx.drawImage(
      map.getCanvas(),
      Math.round(geo.mapRect.x * sheetW),
      Math.round(geo.mapRect.y * sheetH),
      targetMapW,
      targetMapH,
    );

    // Illustrated geography and personal story elements use sheet coordinates
    // and are drawn after the map, before the title. The live overlay uses the
    // same scene objects, so none of the customer's additions disappear when
    // the print is exported.
    drawDecorations(ctx, scene, sheetW, sheetH);
    bakeTitle(ctx, scene.title, scene.colors, sheetW, sheetH);

    return canvas.toDataURL('image/png');
  } finally {
    cleanup();
  }
}
