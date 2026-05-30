'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_COLOR_SCHEME } from '@/lib/print/colorSchemes';
import { DEFAULT_TITLE_LAYOUT } from '@/lib/print/titleLayouts';
import { getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderPrintSnapshot, DEFAULT_DETAIL_SETTINGS } from '@/lib/print/printSnapshot';

interface ThumbnailMapProps {
  slug: string;
  bbox: [string, string, string, string];
  center: [number, number];
  kind: 'country' | 'state' | 'city';
  title: string;
  subtitle: string;
  detail: string;
  className?: string;
}

// Shared snapshot cache — exported so the popup can show it immediately
export const SNAPSHOT_CACHE = new Map<string, string>();

// Thumbnails render at 720px — same pipeline as the popup but smaller for speed.
const THUMBNAIL_WIDTH = 720;

export function ThumbnailMap({ slug, bbox, center, kind, title, subtitle, detail, className }: ThumbnailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(() => SNAPSHOT_CACHE.get(slug) ?? null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (dataUrl) return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setShouldMount(true); observer.disconnect(); }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [dataUrl]);

  useEffect(() => {
    if (!shouldMount || dataUrl) return;

    const controller = new AbortController();
    const geometry = getCachedBoundary(slug)?.geometry ?? null;

    renderPrintSnapshot(
      slug, bbox, center, kind,
      DEFAULT_COLOR_SCHEME.colors,
      { enabled: true, title, subtitle, detail, layout: DEFAULT_TITLE_LAYOUT },
      geometry,
      controller.signal,
      DEFAULT_DETAIL_SETTINGS,
      THUMBNAIL_WIDTH,
    ).then((url) => {
      SNAPSHOT_CACHE.set(slug, url);
      setDataUrl(url);
    }).catch((err) => {
      if (err?.message !== 'aborted') console.warn('Thumbnail render failed', err);
    });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldMount, dataUrl, slug]);

  return (
    <div ref={containerRef} className={className} style={{ aspectRatio: '3/4' }}>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-full w-full bg-[#07122a]/8" />
      )}
    </div>
  );
}
