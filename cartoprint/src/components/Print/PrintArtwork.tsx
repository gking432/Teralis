'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL, applyStyleOverrides, applyGreyscale } from '@/lib/map/style';
import { applyPreviewColorSettings, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { TitleOverlay, getTitleBandHeight } from '@/components/Print/TitleOverlay';
import { isFooterTitleLayout, type PreviewTitleSettings } from '@/lib/print/titleLayouts';

interface PrintArtworkProps {
  slug: string;
  bbox: [string, string, string, string];
  colorSettings: PreviewColorSettings;
  titleSettings: PreviewTitleSettings;
  className?: string;
}

export function PrintArtwork({ slug, bbox, colorSettings, titleSettings, className }: PrintArtworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const colorSettingsRef = useRef(colorSettings);
  const [containerHeight, setContainerHeight] = useState(300);

  const isFooter = isFooterTitleLayout(titleSettings.layout);
  const footerHeight = titleSettings.enabled && isFooter
    ? getTitleBandHeight(titleSettings.layout, true, containerHeight, true)
    : 0;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setContainerHeight(h);
    });
    ro.observe(node);
    const h = node.offsetHeight;
    if (h > 0) setContainerHeight(h);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!mapDivRef.current) return;

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: false,
      fadeDuration: 0,
      bounds: [
        [Number(bbox[2]), Number(bbox[0])],
        [Number(bbox[3]), Number(bbox[1])],
      ],
      fitBoundsOptions: { padding: 24, animate: false },
    });

    map.on('load', () => {
      applyStyleOverrides(map);
      if (colorSettingsRef.current.useMapDefault) {
        applyGreyscale(map);
      } else {
        applyPreviewColorSettings(map, colorSettingsRef.current);
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  // bbox coords are stable per slug; re-init only if slug changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    colorSettingsRef.current = colorSettings;
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (colorSettings.useMapDefault) {
        applyGreyscale(map);
      } else {
        applyPreviewColorSettings(map, colorSettings);
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [colorSettings]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [footerHeight]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ aspectRatio: '4/3' }}
    >
      <div
        ref={mapDivRef}
        className="absolute inset-x-0 top-0"
        style={{ bottom: footerHeight }}
      />
      {isFooter && titleSettings.enabled ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-10"
          style={{ height: footerHeight }}
        >
          <TitleOverlay
            titleSettings={titleSettings}
            colorSettings={colorSettings}
            footerHeight={footerHeight}
          />
        </div>
      ) : (
        <TitleOverlay
          titleSettings={titleSettings}
          colorSettings={colorSettings}
          footerHeight={0}
        />
      )}
    </div>
  );
}
