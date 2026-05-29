'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL } from '@/lib/map/style';
import { type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { applyPrintMapStyle, applyPrintMaskColor } from '@/lib/print/printRender';
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

// Render the map into a large fixed buffer, then CSS-scale it down to fit the
// frame. This matches the customizable editor: high zoom (more cities/roads
// visible) + crisp downscaled text.
const RENDER_WIDTH = 1200;
const PORTRAIT_RATIO = 4 / 3; // height / width

export function PrintArtwork({ slug, bbox, colorSettings, titleSettings, geometry = null, className }: PrintArtworkProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [scale, setScale] = useState(0.25);
  const [styleReady, setStyleReady] = useState(false);

  const renderTotalHeight = Math.round(RENDER_WIDTH * PORTRAIT_RATIO);
  const isFooter = isFooterTitleLayout(titleSettings.layout);
  const footerHeight = titleSettings.enabled && isFooter
    ? getTitleBandHeight(titleSettings.layout, true, renderTotalHeight, false)
    : 0;
  const renderMapHeight = renderTotalHeight - footerHeight;

  // Fit the render buffer into the visible frame
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => {
      const r = frame.getBoundingClientRect();
      setScale(Math.min(r.width / RENDER_WIDTH, r.height / renderTotalHeight));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [renderTotalHeight]);

  // Init map once per slug
  useEffect(() => {
    if (!mapContainer.current) return;

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
      fitBoundsOptions: { padding: 48, animate: false },
    });

    map.on('load', () => {
      applyPrintMapStyle(map, colorSettings);
      initIsolationLayers(map);
      applyPrintMaskColor(map, colorSettings);
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

  // Reapply colors when scheme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    applyPrintMapStyle(map, colorSettings);
    applyPrintMaskColor(map, colorSettings);
  }, [colorSettings, styleReady]);

  // Apply / clear isolation mask
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (geometry) {
      applyIsolationMask(map, { name: slug, type: 'state', fullName: slug, bbox, geojson: geometry }, 1);
      applyPrintMaskColor(map, colorSettings);
    } else {
      clearIsolationMask(map);
    }
  }, [geometry, styleReady, slug, bbox, colorSettings]);

  // Resize the map when the map area changes (e.g. footer toggled)
  useEffect(() => {
    if (mapRef.current && styleReady) mapRef.current.resize();
  }, [renderMapHeight, styleReady]);

  return (
    <div
      ref={frameRef}
      className={`relative w-full overflow-hidden bg-white ${className ?? ''}`}
      style={{ aspectRatio: '3 / 4' }}
    >
      <div
        className="absolute left-1/2 top-1/2 bg-white"
        style={{
          width: RENDER_WIDTH,
          height: renderTotalHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        <div ref={mapContainer} className="w-full bg-white" style={{ height: renderMapHeight }} />
        <TitleOverlay titleSettings={titleSettings} colorSettings={colorSettings} footerHeight={footerHeight} />
      </div>
    </div>
  );
}
