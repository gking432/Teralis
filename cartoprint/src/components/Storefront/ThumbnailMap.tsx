'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_COLOR_SCHEME } from '@/lib/print/colorSchemes';
import { DEFAULT_TITLE_LAYOUT } from '@/lib/print/titleLayouts';
import { getCachedBoundary } from '@/lib/print/boundaryCache';
import {
  renderPrintSnapshot,
  PREVIEW_SNAPSHOT_CACHE,
  getPreviewCacheKey,
  colorCacheKey,
  DEFAULT_DETAIL_SETTINGS,
} from '@/lib/print/printSnapshot';

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

// Shared snapshot cache — exported so downstream code can read rendered URLs
export const SNAPSHOT_CACHE = new Map<string, string>();

function defaultPreviewKey(slug: string): string {
  return getPreviewCacheKey(
    slug,
    colorCacheKey(DEFAULT_COLOR_SCHEME.colors),
    DEFAULT_TITLE_LAYOUT,
    DEFAULT_DETAIL_SETTINGS,
  );
}

export function ThumbnailMap({ slug, bbox, center, kind, title, subtitle, detail, className }: ThumbnailMapProps) {
  // When a pre-generated static PNG exists at /thumbnails/slug.png, use it
  // immediately — no MapLibre, no tile loading, just a CDN fetch.
  // staticOk starts true (optimistic). If the image 404s, staticOk goes false
  // and we fall through to the live render pipeline below.
  const [staticOk, setStaticOk] = useState(true);
  const [staticLoaded, setStaticLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(
    () => PREVIEW_SNAPSHOT_CACHE.get(defaultPreviewKey(slug)) ?? SNAPSHOT_CACHE.get(slug) ?? null
  );
  const [shouldRender, setShouldRender] = useState(false);

  // Once the static PNG fails, immediately kick off the live render (the card
  // is already visible so no need to wait for IntersectionObserver).
  useEffect(() => {
    if (!staticOk && !dataUrl) setShouldRender(true);
  }, [staticOk, dataUrl]);

  // Lazy-load trigger for the fallback live render when there's no cached URL.
  useEffect(() => {
    if (staticOk || dataUrl) return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setShouldRender(true); observer.disconnect(); }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [staticOk, dataUrl]);

  // Live render fallback — same pipeline as the customizer so the style matches.
  useEffect(() => {
    if (!shouldRender || dataUrl) return;
    const controller = new AbortController();
    const geometry = getCachedBoundary(slug)?.geometry ?? null;

    renderPrintSnapshot(
      slug, bbox, center, kind,
      DEFAULT_COLOR_SCHEME.colors,
      { enabled: true, title, subtitle, detail, layout: DEFAULT_TITLE_LAYOUT, inverted: false },
      geometry,
      controller.signal,
      DEFAULT_DETAIL_SETTINGS,
    ).then((url) => {
      PREVIEW_SNAPSHOT_CACHE.set(defaultPreviewKey(slug), url);
      SNAPSHOT_CACHE.set(slug, url);
      setDataUrl(url);
    }).catch((err) => {
      if (err?.message !== 'aborted') console.warn('Thumbnail render failed', err);
    });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, dataUrl, slug]);

  // --- Render ---

  // Static PNG path: show immediately. onError falls back to live render.
  if (staticOk && !dataUrl) {
    return (
      <div className={`relative ${className ?? ''}`} style={{ aspectRatio: '3/4' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/thumbnails/${slug}.png`}
          alt=""
          className={`h-full w-full object-cover transition-opacity duration-300 ${staticLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setStaticLoaded(true)}
          onError={() => { setStaticOk(false); setStaticLoaded(false); }}
        />
        {!staticLoaded && <div className="absolute inset-0 bg-[#07122a]/8" />}
      </div>
    );
  }

  // Live render path (dataUrl already set from cache, or pipeline running)
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
