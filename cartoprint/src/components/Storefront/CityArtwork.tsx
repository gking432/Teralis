'use client';

import { useEffect, useState } from 'react';
import { renderScene } from '@/lib/print/renderScene';
import { sceneCacheTag, type PrintScene } from '@/lib/print/scene';

const artworkCache = new Map<string, string>();

export function useCityArtwork(scene: PrintScene, width = 1000, enabled = true) {
  const cacheKey = `${width}:${sceneCacheTag(scene)}`;
  const [image, setImage] = useState<string | null>(() => artworkCache.get(cacheKey) ?? null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(image ? 'ready' : 'loading');

  useEffect(() => {
    if (!enabled) {
      setImage(null);
      setStatus('ready');
      return;
    }
    const cached = artworkCache.get(cacheKey);
    if (cached) {
      setImage(cached);
      setStatus('ready');
      return;
    }

    const controller = new AbortController();
    setImage(null);
    setStatus('loading');
    renderScene(scene, null, { width, signal: controller.signal })
      .then((dataUrl) => {
        if (controller.signal.aborted) return;
        artworkCache.set(cacheKey, dataUrl);
        setImage(dataUrl);
        setStatus('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.message === 'aborted') return;
        setStatus('error');
      });

    return () => controller.abort();
  }, [cacheKey, enabled, scene, width]);

  return { image, status };
}

export function CityArtworkImage({
  src,
  status,
  label,
  alt,
  className = '',
}: {
  src: string | null;
  status: 'loading' | 'ready' | 'error';
  label: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-fill" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[#f7f4eb] px-8 text-center">
          <div>
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border border-[#173f35]/20 border-t-[#173f35]" />
            <p className="mt-4 text-[9px] uppercase tracking-[0.2em] text-[#617069]">
              {status === 'error' ? 'Preview unavailable' : label}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CityArtwork({
  scene,
  width = 1000,
  alt,
  className = '',
  fallbackSrc,
}: {
  scene: PrintScene;
  width?: number;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}) {
  const { image, status } = useCityArtwork(scene, width);
  const visibleImage = image || fallbackSrc || null;

  return (
    <CityArtworkImage
      src={visibleImage}
      status={status}
      label={`Drawing ${scene.place.name}'s streets`}
      alt={alt}
      className={className}
    />
  );
}
