'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import { applyPreviewColorSettings, hidePrintLabels, applyMaskColor, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { TitleOverlay, getTitleBandHeight } from '@/components/Print/TitleOverlay';
import { isFooterTitleLayout, type PreviewTitleSettings } from '@/lib/print/titleLayouts';
import { applyIsolationMask, initIsolationLayers, clearIsolationMask } from '@/lib/map/isolation';

interface PrintArtworkProps {
  slug: string;
  bbox: [string, string, string, string];
  colorSettings: PreviewColorSettings;
  titleSettings: PreviewTitleSettings;
  geometry?: GeoJSON.Geometry | null;
  className?: string;
}

export function PrintArtwork({ slug, bbox, colorSettings, titleSettings, geometry = null, className }: PrintArtworkProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [styleReady, setStyleReady] = useState(false);

  const isFooter = isFooterTitleLayout(titleSettings.layout);
  const titleBandHeight = titleSettings.enabled && isFooter
    ? getTitleBandHeight(titleSettings.layout, true, frameHeight, true)
    : 0;
  const mapHeight = Math.max(0, frameHeight - titleBandHeight);

  // Measure frame
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setFrameHeight(node.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Init map — wait until we have real height
  useEffect(() => {
    if (frameHeight === 0 || !mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: false,
      fadeDuration: 0,
      bounds: [
        [Number(bbox[2]), Number(bbox[0])],
        [Number(bbox[3]), Number(bbox[1])],
      ],
      fitBoundsOptions: { padding: 32, animate: false },
    });

    map.on('load', () => {
      hidePrintLabels(map);
      applyPreviewColorSettings(map, colorSettings);
      initIsolationLayers(map);
      applyMaskColor(map, colorSettings);
      setStyleReady(true);
    });

    mapRef.current = map;
    return () => {
      setStyleReady(false);
      map.remove();
      mapRef.current = null;
    };
  // Only re-init when slug changes; color changes handled separately
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, frameHeight > 0]);

  // Reapply colors when scheme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    hidePrintLabels(map);
    applyPreviewColorSettings(map, colorSettings);
    applyMaskColor(map, colorSettings);
  }, [colorSettings, styleReady]);

  // Apply / clear isolation mask
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (geometry) {
      applyIsolationMask(map, { name: slug, type: 'state', fullName: slug, bbox, geojson: geometry }, 1);
      applyMaskColor(map, colorSettings);
    } else {
      clearIsolationMask(map);
    }
  }, [geometry, styleReady, slug, bbox, colorSettings]);

  // Resize map when map area changes
  useEffect(() => {
    if (mapRef.current && styleReady) mapRef.current.resize();
  }, [mapHeight, styleReady]);

  return (
    <div ref={frameRef} className={`relative w-full overflow-hidden bg-white ${className ?? ''}`} style={{ aspectRatio: '3/4' }}>
      <div ref={mapContainer} className="w-full" style={{ height: mapHeight }} />
      <TitleOverlay titleSettings={titleSettings} colorSettings={colorSettings} footerHeight={titleBandHeight} />
    </div>
  );
}
