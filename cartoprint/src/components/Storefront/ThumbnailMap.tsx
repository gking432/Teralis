'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL, applyStyleOverrides } from '@/lib/map/style';
import { applyPreviewColorSettings, DEFAULT_COLOR_SCHEME } from '@/lib/print/colorSchemes';

interface ThumbnailMapProps {
  slug: string;
  bbox: [string, string, string, string];
  className?: string;
}

const SNAPSHOT_CACHE = new Map<string, string>();

export function ThumbnailMap({ slug, bbox, className }: ThumbnailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(() => SNAPSHOT_CACHE.get(slug) || null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (dataUrl) return;
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [dataUrl]);

  useEffect(() => {
    if (!shouldMount || dataUrl) return;
    const node = containerRef.current;
    if (!node) return;

    const map = new maplibregl.Map({
      container: node,
      style: STYLE_URL,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
      bounds: [
        [Number(bbox[2]), Number(bbox[0])],
        [Number(bbox[3]), Number(bbox[1])],
      ],
      fitBoundsOptions: { padding: 18, animate: false },
    });

    let snapshotted = false;
    const fallback = window.setTimeout(() => snapshot(true), 6000);

    function snapshot(force: boolean) {
      if (snapshotted) return;
      try {
        if (!force && !map.areTilesLoaded()) return;
      } catch {
        // ignore
      }
      snapshotted = true;
      window.clearTimeout(fallback);
      try {
        const url = map.getCanvas().toDataURL('image/png');
        SNAPSHOT_CACHE.set(slug, url);
        setDataUrl(url);
      } catch (err) {
        console.warn('Thumbnail snapshot failed', err);
      }
      map.remove();
    }

    map.on('load', () => {
      applyStyleOverrides(map);
      applyPreviewColorSettings(map, DEFAULT_COLOR_SCHEME.colors);
    });

    map.on('idle', () => snapshot(false));

    return () => {
      window.clearTimeout(fallback);
      if (!snapshotted) {
        try {
          map.remove();
        } catch {
          // ignore
        }
      }
    };
  }, [shouldMount, dataUrl, bbox, slug]);

  return (
    <div ref={containerRef} className={className}>
      {dataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}
    </div>
  );
}
