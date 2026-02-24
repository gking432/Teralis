'use client';

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/store/mapStore';
import { STYLE_URL, applyGreyscale, applyStyleOverrides, addTerrain } from '@/lib/map/style';
import { applyLayerVisibility } from '@/lib/map/layers';
import {
  initIsolationLayers,
  showSelectionOutline,
  applyIsolationMask,
  clearIsolationMask,
  clearSelectionLayers,
} from '@/lib/map/isolation';
import type { MapSelection } from '@/types/map';

export interface MapViewHandle {
  flyTo: (center: [number, number], zoom: number) => void;
  fitBounds: (bbox: [string, string, string, string]) => void;
  resize: () => void;
}

interface MapViewProps {
  panelOpen: boolean;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { panelOpen },
  ref
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const {
    layers,
    selection,
    isIsolated,
    setView,
    setSelection,
  } = useMapStore();

  const layersRef = useRef(layers);
  const isIsolatedRef = useRef(isIsolated);

  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { isIsolatedRef.current = isIsolated; }, [isIsolated]);

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
    resize: () => {
      setTimeout(() => mapRef.current?.resize(), 320);
    },
  }));

  const handleMapClick = useCallback(
    async (e: maplibregl.MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      const features = map.queryRenderedFeatures(e.point);
      let placeName: string | null = null;
      let bestBoundary: maplibregl.MapGeoJSONFeature | null = null;

      for (const f of features) {
        if (f.sourceLayer === 'boundary' && f.properties?.admin_level) {
          if (!bestBoundary || f.properties.admin_level > bestBoundary.properties!.admin_level) {
            bestBoundary = f;
          }
        }
      }

      for (const f of features) {
        if (f.sourceLayer === 'place' && f.properties?.name) {
          placeName = (f.properties['name:latin'] as string) || (f.properties.name as string);
          break;
        }
      }

      if (!placeName && !bestBoundary) return;

      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;
      const zoom = map.getZoom();
      const nominatimZoom = zoom > 8 ? 14 : zoom > 5 ? 8 : 5;

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

          if (isIsolatedRef.current) {
            applyIsolationMask(map, newSelection);
          }
        }
      } catch (err) {
        console.error('Reverse geocode error:', err);
      }
    },
    [setSelection]
  );

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
    });

    map.on('click', (e) => handleMapClick(e));

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
  }, [layers]);

  // Sync isolation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (isIsolated && selection) {
      applyIsolationMask(map, selection);
    } else {
      clearIsolationMask(map);
    }
  }, [isIsolated, selection]);

  // Sync selection outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (selection) {
      showSelectionOutline(map, selection);
    } else {
      clearSelectionLayers(map);
    }
  }, [selection]);

  // Resize map when panel toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => map.resize(), 320);
    return () => clearTimeout(timer);
  }, [panelOpen]);

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
