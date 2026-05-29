'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL, applyStyleOverrides, applyGreyscale } from '@/lib/map/style';
import {
  applyPreviewColorSettings,
  type PreviewColorSettings,
} from '@/lib/print/colorSchemes';
import { TitleOverlay, getTitleBandHeight } from '@/components/Print/TitleOverlay';
import {
  isFooterTitleLayout,
  type PreviewTitleSettings,
} from '@/lib/print/titleLayouts';
import { applyIsolationMask, initIsolationLayers, clearIsolationMask } from '@/lib/map/isolation';

interface PrintArtworkProps {
  slug: string;
  bbox: [string, string, string, string];
  colorSettings: PreviewColorSettings;
  titleSettings: PreviewTitleSettings;
  geometry?: GeoJSON.Geometry | null;
  className?: string;
}

export function PrintArtwork({
  slug,
  bbox,
  colorSettings,
  titleSettings,
  geometry = null,
  className,
}: PrintArtworkProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [styleReady, setStyleReady] = useState(false);

  const isFooter = isFooterTitleLayout(titleSettings.layout);
  const titleBandHeight =
    titleSettings.enabled && isFooter
      ? getTitleBandHeight(titleSettings.layout, true, frameHeight, true)
      : 0;
  const mapHeight = Math.max(0, frameHeight - titleBandHeight);

  // Track frame size
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setFrameHeight(node.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Initialize map (once per slug)
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
      bounds: [
        [Number(bbox[2]), Number(bbox[0])],
        [Number(bbox[3]), Number(bbox[1])],
      ],
      fitBoundsOptions: { padding: 24, animate: false },
    });

    map.on('load', () => {
      applyStyleOverrides(map);
      initIsolationLayers(map);
      setStyleReady(true);
    });

    mapRef.current = map;
    return () => {
      setStyleReady(false);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Apply color settings whenever they change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (colorSettings.useMapDefault) {
      applyGreyscale(map);
    } else {
      applyPreviewColorSettings(map, colorSettings);
    }
  }, [colorSettings, styleReady]);

  // Apply isolation mask when geometry arrives
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (geometry) {
      applyIsolationMask(map, { name: slug, type: 'state', fullName: slug, bbox, geojson: geometry }, 1);
    } else {
      clearIsolationMask(map);
    }
  }, [geometry, styleReady, slug, bbox]);

  // Resize map when frame dimensions change
  useEffect(() => {
    mapRef.current?.resize();
  }, [mapHeight]);

  return (
    <div
      ref={frameRef}
      className={`relative w-full overflow-hidden bg-white ${className ?? ''}`}
      style={{ aspectRatio: '4 / 3' }}
    >
      <div
        ref={mapContainer}
        className="w-full"
        style={{ height: mapHeight }}
      />
      <TitleOverlay
        titleSettings={titleSettings}
        colorSettings={colorSettings}
        footerHeight={titleBandHeight}
      />
    </div>
  );
}
