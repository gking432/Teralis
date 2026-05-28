'use client';

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { useOrderStore } from '@/store/orderStore';
import { STYLE_URL, applyGreyscale, applyStyleOverrides, addTerrain } from '@/lib/map/style';
import { applyLayerVisibility } from '@/lib/map/layers';
import { getReverseZoomForTarget } from '@/lib/map/builder';
import {
  initIsolationLayers,
  showSelectionOutline,
  applyIsolationMask,
  clearIsolationMask,
  clearSelectionLayers,
} from '@/lib/map/isolation';
import type { MapSelection } from '@/types/map';
import type { PrintRegionScope } from '@/types/order';

export interface MapViewHandle {
  flyTo: (center: [number, number], zoom: number) => void;
  fitBounds: (bbox: [string, string, string, string]) => void;
  snapshotView: () => MapSelection | null;
  resize: () => void;
}

interface MapViewProps {
  panelOpen: boolean;
  printMode: boolean;
}

interface BoundaryResolveResponse {
  id: string;
  level: PrintRegionScope;
  name: string;
  fullName: string;
  bbox: [string, string, string, string] | null;
  geometry: GeoJSON.Geometry;
}

function getNextScope(scope: PrintRegionScope): PrintRegionScope {
  if (scope === 'country') return 'state';
  if (scope === 'state') return 'county';
  return 'city';
}

function getClickScopeForZoom(zoom: number): PrintRegionScope {
  if (zoom < 5.5) return 'country';
  if (zoom < 7.5) return 'state';
  if (zoom < 10.5) return 'county';
  return 'city';
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { panelOpen, printMode },
  ref
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapClickHandlerRef = useRef<(e: maplibregl.MapMouseEvent) => void>(() => {});
  const tooltipRef = useRef<HTMLDivElement>(null);

  const {
    layers,
    selection,
    builder,
    fitBoundsRequest,
    setView,
    setSelection,
    setPrintMetrics,
    setFocusMode,
  } = useMapStore();
  const {
    selectRegion,
    setActiveScope,
  } = useOrderStore();

  const layersRef = useRef(layers);
  const focusModeRef = useRef(builder.focusMode);
  const selectionTargetRef = useRef(builder.selectionTarget);

  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { focusModeRef.current = builder.focusMode; }, [builder.focusMode]);
  useEffect(() => { selectionTargetRef.current = builder.selectionTarget; }, [builder.selectionTarget]);

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) => {
      mapRef.current?.flyTo({ center, zoom, duration: 1200 });
    },
    fitBounds: (bbox) => {
      mapRef.current?.fitBounds(
        [[+bbox[2], +bbox[0]], [+bbox[3], +bbox[1]]],
        { padding: 60, duration: 1200 }
      );
    },
    snapshotView: () => {
      const map = mapRef.current;
      if (!map) return null;
      const bounds = map.getBounds();
      const west = bounds.getWest();
      const south = bounds.getSouth();
      const east = bounds.getEast();
      const north = bounds.getNorth();
      const rect = map.getContainer().getBoundingClientRect();

      return {
        name: 'Snapshot View',
        type: 'viewport',
        fullName: 'Current map view',
        bbox: [south.toString(), north.toString(), west.toString(), east.toString()],
        viewport: {
          width: rect.width,
          height: rect.height,
        },
        geojson: {
          type: 'Polygon',
          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ]],
        },
      };
    },
    resize: () => {
      setTimeout(() => mapRef.current?.resize(), 320);
    },
  }));

  const handleMapClick = useCallback(
    async (e: maplibregl.MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;
      const nominatimZoom = getReverseZoomForTarget(selectionTargetRef.current);

      if (printMode) {
        try {
          const clickScope = getClickScopeForZoom(map.getZoom());
          const params = new URLSearchParams({
            lat: lat.toString(),
            lng: lng.toString(),
            level: clickScope,
          });
          const resp = await fetch(`/api/boundary/resolve?${params}`);
          if (!resp.ok) return;

          const boundary = (await resp.json()) as BoundaryResolveResponse;
          const nextSelection: MapSelection = {
            name: boundary.name,
            type: boundary.level,
            fullName: boundary.fullName,
            geojson: boundary.geometry,
            bbox: boundary.bbox,
          };

          selectRegion({
            id: boundary.id,
            name: boundary.name,
            scope: boundary.level,
            fullName: boundary.fullName,
            geojson: boundary.geometry,
            bbox: boundary.bbox,
          });

          setSelection(nextSelection);
          setFocusMode('crop');
          showSelectionOutline(map, nextSelection);
          applyIsolationMask(map, nextSelection, 1);

          if (clickScope !== 'country' && boundary.bbox) {
            map.fitBounds(
              [
                [+boundary.bbox[2], +boundary.bbox[0]],
                [+boundary.bbox[3], +boundary.bbox[1]],
              ],
              { padding: 52, duration: 900 }
            );
          }

          setActiveScope(getNextScope(clickScope));
        } catch (err) {
          console.error('Customize click error:', err);
        }
        return;
      }

      try {
        const resp = await fetch(`/api/geocode?lat=${lat}&lng=${lng}&z=${nominatimZoom}`);
        const data = await resp.json();

        if (data && data.display_name) {
          const name = data.display_name.split(',').slice(0, 2).join(', ').trim();
          const type = data.type || data.class || 'region';
          const geojson = data.geojson || null;
          const bbox = data.boundingbox || null;

          const newSelection: MapSelection = {
            name,
            type,
            fullName: data.display_name,
            geojson,
            bbox,
          };

          setSelection(newSelection);
          showSelectionOutline(map, newSelection);

          if (focusModeRef.current === 'crop') {
            applyIsolationMask(map, newSelection, 1);
          } else if (focusModeRef.current === 'fade') {
            applyIsolationMask(map, newSelection, 0.7);
          }
        }
      } catch (err) {
        console.error('Reverse geocode error:', err);
      }
    },
    [
      printMode,
      selectRegion,
      setActiveScope,
      setFocusMode,
      setSelection,
    ]
  );

  const updatePrintMetrics = useCallback(() => {
    setPrintMetrics(null);
  }, [setPrintMetrics]);

  useEffect(() => {
    mapClickHandlerRef.current = handleMapClick;
  }, [handleMapClick]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLE_URL,
      center: [-98.58, 39.83],
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      applyGreyscale(map);
      applyStyleOverrides(map);
      addTerrain(map);
      initIsolationLayers(map);
      applyLayerVisibility(map, layersRef.current);
    });

    map.on('move', () => {
      const center = map.getCenter();
      setView({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
      });
      updatePrintMetrics();
    });

    map.on('click', (e) => mapClickHandlerRef.current(e));
    map.on('idle', () => updatePrintMetrics());

    map.on('mousemove', (e) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const f = map.queryRenderedFeatures(e.point).find(
        (feat) => feat.properties && (feat.properties['name:latin'] || feat.properties.name)
      );
      if (f) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${e.originalEvent.clientX + 14}px`;
        tooltip.style.top = `${e.originalEvent.clientY + 14}px`;
        tooltip.textContent =
          (f.properties!['name:latin'] as string) || (f.properties!.name as string);
      } else {
        tooltip.style.display = 'none';
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyLayerVisibility(map, layers);
    updatePrintMetrics();
  }, [layers, updatePrintMetrics]);

  // Sync isolation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (printMode && selection?.geojson) {
      showSelectionOutline(map, selection);
      applyIsolationMask(map, selection, 1);
    } else if (printMode) {
      clearSelectionLayers(map);
    } else if (builder.focusMode === 'crop' && selection) {
      applyIsolationMask(map, selection, 1);
    } else if (builder.focusMode === 'fade' && selection) {
      applyIsolationMask(map, selection, 0.7);
    } else {
      clearIsolationMask(map);
    }
  }, [builder.focusMode, printMode, selection]);

  // Sync selection outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (printMode) return;

    if (selection) {
      showSelectionOutline(map, selection);
    } else {
      clearSelectionLayers(map);
    }
    updatePrintMetrics();
  }, [printMode, selection, updatePrintMetrics]);

  // Resize map when panel toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => map.resize(), 320);
    const metricTimer = setTimeout(() => updatePrintMetrics(), 360);
    return () => {
      clearTimeout(timer);
      clearTimeout(metricTimer);
    };
  }, [panelOpen, updatePrintMetrics]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (fitBoundsRequest?.bbox) {
      map.fitBounds(
        [
          [+fitBoundsRequest.bbox[2], +fitBoundsRequest.bbox[0]],
          [+fitBoundsRequest.bbox[3], +fitBoundsRequest.bbox[1]],
        ],
        { padding: 52, duration: 900 }
      );
    }
  }, [fitBoundsRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const canvas = map.getCanvas();
    canvas.style.cursor = printMode ? 'pointer' : '';

    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();
    map.touchZoomRotate.enable();
  }, [printMode]);

  return (
    <>
      <div ref={mapContainer} className="w-full h-full" />
      <div
        ref={tooltipRef}
        className="fixed bg-panel border border-border px-3.5 py-2 text-[13px] text-text pointer-events-none z-[1001] shadow-[0_2px_12px_rgba(0,0,0,0.08)] hidden"
      />
    </>
  );
});
