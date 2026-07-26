'use client';

// Bare page used only by scripts/gen-thumbnails.mjs to render a single print
// thumbnail. Accepts ?slug=... and renders the print scene directly at
// thumbnail resolution so the generation script can grab the data URL.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCatalogPrint } from '@/lib/catalog/prints';
import { getCachedBoundary, fetchBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import { createPrintScene } from '@/lib/print/scene';
import { DEFAULT_PALETTE } from '@/lib/print/palettes';

const THUMB_WIDTH = 720;

function ThumbnailRenderer() {
  const params = useSearchParams();
  const slug = params.get('slug') ?? '';
  const print = getCatalogPrint(slug);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!print) { setError('not-found'); return; }
    const controller = new AbortController();
    const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';

    (async () => {
      let geometry = getCachedBoundary(slug)?.geometry ?? null;
      if (!geometry) {
        const record = await fetchBoundary(slug, print.center, kind);
        geometry = record?.geometry ?? null;
      }

      const scene = createPrintScene(print, 'portrait', DEFAULT_PALETTE);
      const url = await renderScene(scene, geometry, {
        width: THUMB_WIDTH,
        signal: controller.signal,
      });
      setDataUrl(url);
    })().catch((err) => {
      if (err?.message !== 'aborted') setError(String(err));
    });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) return <div id="render-error" data-error={error} />;
  if (!dataUrl) return <div id="render-pending" />;

  // eslint-disable-next-line @next/next/no-img-element
  return <img id="render-result" src={dataUrl} alt="" style={{ width: THUMB_WIDTH, display: 'block' }} />;
}

export default function ThumbnailRenderPage() {
  return (
    <Suspense fallback={<div id="render-pending" />}>
      <ThumbnailRenderer />
    </Suspense>
  );
}
