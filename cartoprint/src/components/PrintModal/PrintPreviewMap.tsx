'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { STYLE_URL, addTerrain, applyGreyscale, applyStyleOverrides } from '@/lib/map/style';
import { applyLayerVisibility } from '@/lib/map/layers';
import { applyIsolationMask, initIsolationLayers } from '@/lib/map/isolation';
import { getPrintPreviewLayers } from '@/lib/print/previewLayers';
import type { MapSelection } from '@/types/map';
import type { FrameType, PrintSize } from '@/types/order';

const RENDER_WIDTH = 2200;
export type PreviewCompositionMode = 'landscape-print' | 'portrait-print';
export type PreviewTownLabelMode = 'none' | 'major' | 'all';
export type PreviewTitleLayout =
  | 'classic-bottom'
  | 'compact-bottom'
  | 'top-left'
  | 'side-rail'
  | 'minimal-corner';

export interface PreviewLabelSettings {
  cityLabels: boolean;
  townLabels: PreviewTownLabelMode;
  streetLabels: boolean;
  lakeLabels: boolean;
  riverLabels: boolean;
  regionLabels: boolean;
}

export interface PreviewColorSettings {
  land: string;
  water: string;
  roads: string;
  useMapDefault?: boolean;
}

export interface PreviewTitleSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  detail: string;
  layout: PreviewTitleLayout;
}

interface PrintPreviewMapProps {
  size: PrintSize;
  snapshot: MapSelection | null;
  compositionMode: PreviewCompositionMode;
  labelSettings: PreviewLabelSettings;
  colorSettings: PreviewColorSettings;
  titleSettings: PreviewTitleSettings;
  frame: FrameType;
  resetCropKey: number;
}

function bboxToBounds(
  bbox: [string, string, string, string]
): [[number, number], [number, number]] {
  return [
    [Number(bbox[2]), Number(bbox[0])],
    [Number(bbox[3]), Number(bbox[1])],
  ];
}

function isSingleStateSelection(selection: MapSelection | null): boolean {
  if (!selection) return false;
  const type = selection.type.toLowerCase();
  const fullName = selection.fullName.toLowerCase();
  return (
    type.includes('state') ||
    type.includes('province') ||
    (/united states|usa|u\.s\./.test(fullName) && !type.includes('county') && !type.includes('city'))
  );
}

function isViewportSnapshot(snapshot: MapSelection | null): boolean {
  return snapshot?.type === 'viewport';
}

function getCurrentViewAspectRatio(snapshot: MapSelection | null): number {
  if (snapshot?.viewport?.width && snapshot.viewport.height) {
    return snapshot.viewport.width / snapshot.viewport.height;
  }

  return 16 / 9;
}

function getPreviewAspectRatio(mode: PreviewCompositionMode, snapshot: MapSelection | null): number {
  if (mode === 'landscape-print') {
    return Math.max(getCurrentViewAspectRatio(snapshot), 4 / 3);
  }

  return 3 / 4;
}

function isFooterTitleLayout(titleSettings: PreviewTitleSettings): boolean {
  return titleSettings.enabled && ['classic-bottom', 'compact-bottom'].includes(titleSettings.layout);
}

function getTitleBandHeight(
  titleSettings: PreviewTitleSettings,
  mode: PreviewCompositionMode,
  mapHeight: number
): number {
  if (!isFooterTitleLayout(titleSettings)) return 0;
  if (titleSettings.layout === 'compact-bottom') {
    return Math.round(mapHeight * (mode === 'landscape-print' ? 0.11 : 0.095));
  }
  return Math.round(mapHeight * (mode === 'landscape-print' ? 0.16 : 0.135));
}

function getEffectivePreviewLayers(
  layers: ReturnType<typeof getPrintPreviewLayers>,
  labelSettings: PreviewLabelSettings
) {
  const nextLayers = { ...layers };
  nextLayers.capitals = labelSettings.cityLabels;
  nextLayers.cities = labelSettings.cityLabels;
  nextLayers.towns = labelSettings.townLabels === 'major';
  nextLayers.roadlabels = labelSettings.streetLabels;
  nextLayers.waterlabels = labelSettings.lakeLabels;
  nextLayers.riverlabels = labelSettings.riverLabels;
  nextLayers.statelabels = labelSettings.regionLabels;
  nextLayers.countrylabels = labelSettings.regionLabels;
  nextLayers.states = false;
  nextLayers.countries = false;
  return nextLayers;
}

function applyPrintPreviewOverrides(
  map: maplibregl.Map,
  previewLayers: ReturnType<typeof getPrintPreviewLayers>,
  options: {
    densePlaceLabels: boolean;
    singleStatePreview: boolean;
  }
): void {
  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;

    if (/admin.*(country|2|state|3|4)|boundary.*(country|state|2|3|4)/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (/road_one_way|road_area_pattern|road_path_pedestrian|road_shield|highway-shield/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (options.densePlaceLabels && /label_(city|city_capital|town|village|other)/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (options.singleStatePreview && /label_state|place.*(state|province)/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (!previewLayers.waterlabels && /water_name_(point|line)_label/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (!previewLayers.riverlabels && /waterway.*label/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (!previewLayers.roadlabels && /highway-name|road.*label|road_name|street_name|transportation_name/.test(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
      return;
    }

    if (previewLayers.towns && /label_(town|village|other)/.test(id) && layer.type === 'symbol') {
      try {
        map.setLayerZoomRange(id, id === 'label_other' ? 6 : 4, 24);
        map.setLayoutProperty(id, 'text-size', ['interpolate', ['linear'], ['zoom'], 4, 8, 7, 9, 10, 11]);
        map.setLayoutProperty(id, 'text-padding', 1);
      } catch {}
    }

    if (previewLayers.allroads && /road_(minor|service_track|link)/.test(id)) {
      try {
        map.setLayerZoomRange(id, 4, 24);
        if (layer.type === 'line') {
          map.setPaintProperty(id, 'line-color', '#8a8a84');
          map.setPaintProperty(id, 'line-opacity', 0.84);
          map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.1, 7, 0.24, 10, 0.54, 13, 0.92]);
        }
      } catch {}
    }

    if (previewLayers.mainroads && /road_(secondary_tertiary|trunk_primary)/.test(id) && layer.type === 'line') {
      try {
        map.setLayerZoomRange(id, 4, 24);
        map.setPaintProperty(id, 'line-color', '#555552');
        map.setPaintProperty(id, 'line-opacity', 0.95);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.65, 9, 1.05, 13, 1.55]);
      } catch {}
    }

    if (previewLayers.rivers && /^waterway/.test(id)) {
      try {
        map.setLayerZoomRange(id, 4, 24);
        if (layer.type === 'line') {
          map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.7, 12, 1.15]);
        }
      } catch {}
    }
  });
}

function applyPreviewColorSettings(map: maplibregl.Map, colors: PreviewColorSettings): void {
  if (colors.useMapDefault) return;

  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;

    try {
      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', colors.land);
        return;
      }

      if (layer.type === 'fill' && /water|lake|ocean|river/.test(id)) {
        map.setPaintProperty(id, 'fill-color', colors.water);
        map.setPaintProperty(id, 'fill-opacity', 1);
        return;
      }

      if (layer.type === 'line' && /^waterway|river|stream|canal/.test(id)) {
        map.setPaintProperty(id, 'line-color', colors.water);
        return;
      }

      if (layer.type === 'fill' && /land|park|wood|grass|sand|aeroway|building/.test(id)) {
        map.setPaintProperty(id, 'fill-color', colors.land);
        return;
      }

      if (layer.type === 'line' && /road|bridge|tunnel|highway|street|path|track/.test(id)) {
        map.setPaintProperty(id, 'line-color', colors.roads);
        map.setPaintProperty(id, 'line-opacity', 0.92);
      }
    } catch {}
  });
}

function getPreviewWaterColor(colors: PreviewColorSettings): string {
  return colors.water || '#ffffff';
}

function getFrameOverlay(frame: FrameType): { label: string; borderColor: string; shadow: string } | null {
  switch (frame) {
    case 'black':
      return {
        label: 'Black frame preview',
        borderColor: '#171716',
        shadow: 'inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 0 1px rgba(0,0,0,0.18)',
      };
    case 'white':
      return {
        label: 'White frame preview',
        borderColor: '#f8f5ed',
        shadow: 'inset 0 0 0 1px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.14)',
      };
    case 'oak':
      return {
        label: 'Oak frame preview',
        borderColor: '#b9854f',
        shadow: 'inset 0 0 0 1px rgba(72,38,12,0.28), 0 0 0 1px rgba(72,38,12,0.2)',
      };
    case 'none':
    default:
      return null;
  }
}

function initPrintFeatureLayers(map: maplibregl.Map): void {
  map.addSource('print-place-labels', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'print-place-dots',
    type: 'circle',
    source: 'print-place-labels',
    paint: {
      'circle-color': '#2d2d2b',
      'circle-radius': ['match', ['get', 'place'], 'city', 1.8, 'town', 1.35, 'village', 1.1, 'township', 0.8, 0.75],
      'circle-opacity': 0.58,
    },
  });

  map.addLayer({
    id: 'print-place-labels',
    type: 'symbol',
    source: 'print-place-labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['match', ['get', 'place'], 'city', 5.1, 'town', 4.7, 'village', 4.45, 'township', 4.15, 4.1],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.35,
      'text-justify': 'auto',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': true,
      'text-padding': 1,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: {
      'text-color': '#2d2d2b',
      'text-halo-color': '#fafaf8',
      'text-halo-width': 0.55,
      'text-opacity': ['match', ['get', 'place'], 'township', 0.78, 'hamlet', 0.72, 0.94],
    },
  });

}

export function PrintPreviewMap({
  size,
  snapshot,
  compositionMode,
  labelSettings,
  colorSettings,
  titleSettings,
  frame,
  resetCropKey,
}: PrintPreviewMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [scale, setScale] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [placeCount, setPlaceCount] = useState(0);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [previewCamera, setPreviewCamera] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const { view, layers, builder, selection } = useMapStore();

  const mapAspectRatio = getPreviewAspectRatio(compositionMode, snapshot);
  const renderMapHeight = Math.round(RENDER_WIDTH / mapAspectRatio);
  const titleBandHeight = getTitleBandHeight(titleSettings, compositionMode, renderMapHeight);
  const renderHeight = renderMapHeight + titleBandHeight;
  const aspectRatio = RENDER_WIDTH / renderHeight;
  const basePreviewLayers = useMemo(
    () => getPrintPreviewLayers(layers, builder, selection),
    [builder, layers, selection]
  );
  const previewLayers = useMemo(
    () => getEffectivePreviewLayers(basePreviewLayers, labelSettings),
    [basePreviewLayers, labelSettings]
  );
  const targetBBox = snapshot?.bbox || selection?.bbox;
  const shouldLoadPrintPlaces =
    labelSettings.townLabels === 'all' && Boolean(targetBBox);
  const singleStatePreview = isSingleStateSelection(selection);
  const frameOverlay = getFrameOverlay(frame);

  useEffect(() => {
    setPreviewCamera(null);
  }, [compositionMode, resetCropKey, snapshot?.bbox]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const rect = frame.getBoundingClientRect();
      setScale(Math.min(rect.width / RENDER_WIDTH, rect.height / renderHeight));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [renderHeight]);

  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    setReady(false);
    setPlaceCount(0);
    setLoadingPlaces(false);

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: previewCamera?.center || view.center,
      zoom: previewCamera?.zoom || view.zoom,
      interactive: true,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    });

    mapRef.current = map;

    const readyTimer = window.setTimeout(() => setReady(true), 3500);

    map.on('load', () => {
      applyGreyscale(map);
      applyStyleOverrides(map);
      addTerrain(map);
      initIsolationLayers(map);
      initPrintFeatureLayers(map);
      applyLayerVisibility(map, previewLayers);
      applyPrintPreviewOverrides(map, previewLayers, {
        densePlaceLabels: labelSettings.townLabels === 'all',
        singleStatePreview,
      });
      applyPreviewColorSettings(map, colorSettings);

      if (
        targetBBox &&
        !previewCamera &&
        !isViewportSnapshot(snapshot)
      ) {
        map.fitBounds(bboxToBounds(targetBBox), {
          padding: Math.round(Math.min(RENDER_WIDTH, renderMapHeight) * 0.018),
          duration: 0,
        });
      }

      if (selection?.geojson && builder.focusMode === 'crop') {
        applyIsolationMask(
          map,
          {
            name: selection.name,
            type: selection.type,
            fullName: selection.fullName,
            bbox: selection.bbox,
            geojson: selection.geojson,
          },
          1
        );
        try {
          map.setPaintProperty('mask-layer', 'fill-color', getPreviewWaterColor(colorSettings));
        } catch {}
      }

      map.on('moveend', () => {
        const center = map.getCenter();
        setPreviewCamera({
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
        });
      });

      const printPlaceBBox = targetBBox;
      if (shouldLoadPrintPlaces && printPlaceBBox) {
        setLoadingPlaces(true);
        fetch('/api/print/features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bbox: printPlaceBBox,
            geometry: selection?.geojson || null,
            towns: true,
          }),
        })
          .then((response) => response.json())
          .then((featureCollection: GeoJSON.FeatureCollection) => {
            if (!mapRef.current || mapRef.current !== map) return;
            const source = map.getSource('print-place-labels') as GeoJSONSource | undefined;
            source?.setData(labelSettings.townLabels === 'all' ? featureCollection : { type: 'FeatureCollection', features: [] });
            setPlaceCount(featureCollection.features?.length || 0);
          })
          .catch(() => setPlaceCount(0))
          .finally(() => setLoadingPlaces(false));
      }

      map.once('idle', () => {
        window.clearTimeout(readyTimer);
        setReady(true);
      });
    });

    return () => {
      window.clearTimeout(readyTimer);
      map.remove();
      mapRef.current = null;
    };
  }, [
    builder.focusMode,
    colorSettings,
    compositionMode,
    labelSettings,
    previewLayers,
    renderHeight,
    renderMapHeight,
    resetCropKey,
    selection,
    shouldLoadPrintPlaces,
    singleStatePreview,
    size,
    snapshot,
    targetBBox,
    view.center,
    view.zoom,
  ]);

  return (
    <div>
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden border border-border bg-bg shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
        style={{ aspectRatio }}
      >
        <div
          className="absolute left-1/2 top-1/2 bg-bg"
          style={{
            width: RENDER_WIDTH,
            height: renderHeight,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          <div
            ref={mapContainer}
            className="w-full bg-bg"
            style={{ height: renderMapHeight }}
          />
          <TitleOverlay
            titleSettings={titleSettings}
            colorSettings={colorSettings}
            footerHeight={titleBandHeight}
          />
        </div>
        {!ready && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-panel/85 text-xs uppercase tracking-[1.4px] text-text-muted">
            Loading Preview
          </div>
        )}
        {frameOverlay && (
          <div
            aria-label={frameOverlay.label}
            className="pointer-events-none absolute inset-0 z-20 border-[18px]"
            style={{
              borderColor: frameOverlay.borderColor,
              boxShadow: frameOverlay.shadow,
            }}
          >
            <div className="h-full w-full border border-black/20" />
          </div>
        )}
      </div>
      <div className="mt-3 text-xs leading-relaxed text-text-muted">
        Preview uses a larger print-ratio canvas, so dense towns, streets, rivers, and borders can appear more accurately than on the live map.
        {loadingPlaces && ' Loading print-only town labels...'}
        {!loadingPlaces && placeCount > 0 && ` Added ${placeCount.toLocaleString()} print-only place labels.`}
      </div>
    </div>
  );
}

function TitleOverlay({
  titleSettings,
  colorSettings,
  footerHeight,
}: {
  titleSettings: PreviewTitleSettings;
  colorSettings: PreviewColorSettings;
  footerHeight: number;
}) {
  if (!titleSettings.enabled || !titleSettings.title.trim()) return null;

  const title = titleSettings.title.trim().toUpperCase();
  const subtitle = titleSettings.subtitle.trim().toUpperCase();
  const detail = titleSettings.detail.trim().toUpperCase();
  const ink = colorSettings.useMapDefault ? '#07122a' : colorSettings.water || colorSettings.roads || '#07122a';
  const panelStyle = {
    backgroundColor: colorSettings.land,
    color: ink,
    borderColor: ink,
  };
  const visibleLineCount = 1 + (subtitle ? 1 : 0) + (detail ? 1 : 0);
  const isLongTitle = title.length > 10;
  const isVeryLongTitle = title.length > 16;
  const isExtremeTitle = title.length > 24;
  const fitRatio = Math.min(1, 11 / Math.max(title.length, 1));
  const footerBaseSize = Math.max(28, Math.min(86, footerHeight * (visibleLineCount === 1 ? 0.44 : 0.33)));
  const compactBaseSize = Math.max(18, Math.min(58, footerHeight * (visibleLineCount === 1 ? 0.42 : 0.31)));
  const titleStyle = {
    fontSize: `${Math.round(footerBaseSize * fitRatio)}px`,
    letterSpacing: isExtremeTitle ? '0.08em' : isVeryLongTitle ? '0.12em' : isLongTitle ? '0.18em' : '0.28em',
  };
  const compactFooterTitleStyle = {
    fontSize: `${Math.round(compactBaseSize * fitRatio)}px`,
    letterSpacing: isExtremeTitle ? '0.06em' : isVeryLongTitle ? '0.1em' : isLongTitle ? '0.14em' : '0.22em',
  };
  const tinyTitleStyle = {
    fontSize: isExtremeTitle ? '12px' : isVeryLongTitle ? '14px' : isLongTitle ? '16px' : '20px',
    letterSpacing: isExtremeTitle ? '0.04em' : isVeryLongTitle ? '0.07em' : isLongTitle ? '0.1em' : '0.14em',
  };

  if (titleSettings.layout === 'compact-bottom') {
    return (
      <div
        className="pointer-events-none relative z-10 flex w-full flex-col items-center justify-center overflow-hidden border-t-2 px-[7%] text-center"
        style={{ ...panelStyle, height: footerHeight }}
      >
        <div className="max-w-full truncate font-display font-light leading-none" style={compactFooterTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-2 max-w-full truncate text-[18px] tracking-[0.26em]">{subtitle}</div>}
        {detail && <div className="mt-1.5 max-w-full truncate text-[14px] tracking-[0.14em]">{detail}</div>}
      </div>
    );
  }

  if (titleSettings.layout === 'top-left') {
    return (
      <div
        className="pointer-events-none absolute left-[4%] top-[4%] z-10 max-w-[30%] overflow-hidden border-l-2 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        style={panelStyle}
      >
        <div className="truncate font-display font-light leading-none" style={tinyTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-1 truncate text-[9px] tracking-[0.16em]">{subtitle}</div>}
        {detail && <div className="mt-0.5 truncate text-[8px] tracking-[0.08em]">{detail}</div>}
      </div>
    );
  }

  if (titleSettings.layout === 'side-rail') {
    return (
      <div
        className="pointer-events-none absolute bottom-[4%] left-[3%] top-[4%] z-10 flex w-[8%] min-w-[54px] flex-col justify-end overflow-hidden border-r px-2 pb-3"
        style={panelStyle}
      >
        <div className="origin-bottom-left -rotate-90 whitespace-nowrap font-display font-light leading-none" style={tinyTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-6 truncate text-[8px] tracking-[0.12em]">{subtitle}</div>}
        {detail && <div className="mt-1 truncate text-[7px] tracking-[0.08em]">{detail}</div>}
      </div>
    );
  }

  if (titleSettings.layout === 'minimal-corner') {
    return (
      <div
        className="pointer-events-none absolute bottom-[4%] right-[4%] z-10 max-w-[30%] overflow-hidden border-t px-2.5 pt-1.5 text-right"
        style={panelStyle}
      >
        <div className="truncate font-display font-light leading-none" style={tinyTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-1 truncate text-[8px] tracking-[0.12em]">{subtitle}</div>}
        {detail && <div className="mt-0.5 truncate text-[7px] tracking-[0.08em]">{detail}</div>}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none relative z-10 flex w-full flex-col items-center justify-center overflow-hidden border-t-[3px] px-[7%] text-center"
      style={{ ...panelStyle, height: footerHeight }}
    >
      <div className="max-w-full truncate font-display font-light leading-none" style={titleStyle}>
        {title}
      </div>
      {subtitle && <div className="mt-2 max-w-full truncate text-[22px] tracking-[0.34em]">{subtitle}</div>}
      {detail && <div className="mt-2 max-w-full truncate text-[15px] tracking-[0.16em]">{detail}</div>}
    </div>
  );
}
