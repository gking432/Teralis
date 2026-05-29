'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { COLOR_SCHEMES, DEFAULT_COLOR_SCHEME, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { TITLE_LAYOUTS, DEFAULT_TITLE_LAYOUT, type PreviewTitleLayout, type PreviewTitleSettings } from '@/lib/print/titleLayouts';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { SNAPSHOT_CACHE } from '@/components/Storefront/ThumbnailMap';
import { renderPrintSnapshot, PREVIEW_SNAPSHOT_CACHE, getPreviewCacheKey } from '@/lib/print/printSnapshot';
import { ImageMagnifier } from '@/components/ui/ImageMagnifier';

interface PrintQuickShopProps {
  print: CatalogPrint;
  onClose: () => void;
}

export function PrintQuickShop({ print, onClose }: PrintQuickShopProps) {
  const [selectedScheme, setSelectedScheme] = useState(DEFAULT_COLOR_SCHEME.value);
  const [selectedLayout, setSelectedLayout] = useState<PreviewTitleLayout>(DEFAULT_TITLE_LAYOUT);
  const [fullscreen, setFullscreen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [geometry, setGeometry] = useState<GeoJSON.Geometry | null>(
    () => getCachedBoundary(print.slug)?.geometry ?? null
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const cachedThumb = SNAPSHOT_CACHE.get(print.slug) ?? null;

  useEffect(() => {
    if (geometry) return;
    let cancelled = false;
    const level = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';
    fetchBoundary(print.slug, print.center, level).then((record) => {
      if (!cancelled && record?.geometry) setGeometry(record.geometry);
    });
    return () => { cancelled = true; };
  }, [print.slug, print.center, print.kind, geometry]);

  useEffect(() => {
    if (!geometry) return;

    const cacheKey = getPreviewCacheKey(print.slug, selectedScheme, selectedLayout);
    const cached = PREVIEW_SNAPSHOT_CACHE.get(cacheKey);
    if (cached) {
      setPreviewUrl(cached);
      setPreviewLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewLoading(true);

    const colorSettings: PreviewColorSettings =
      COLOR_SCHEMES.find((s) => s.value === selectedScheme)?.colors ?? DEFAULT_COLOR_SCHEME.colors;
    const titleSettings: PreviewTitleSettings = {
      enabled: true,
      title: print.defaultTitle,
      subtitle: print.defaultSubtitle,
      detail: print.establishedYear ? `EST. ${print.establishedYear}` : '',
      layout: selectedLayout,
    };
    const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';

    renderPrintSnapshot(
      print.slug, print.bbox, print.center, kind,
      colorSettings, titleSettings, geometry,
      controller.signal,
    ).then((url) => {
      if (controller.signal.aborted) return;
      PREVIEW_SNAPSHOT_CACHE.set(cacheKey, url);
      setPreviewUrl(url);
      setPreviewLoading(false);
    }).catch((err) => {
      if (err?.message !== 'aborted') {
        console.warn('Preview snapshot failed', err);
        setPreviewLoading(false);
      }
    });

    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print.slug, selectedScheme, selectedLayout, geometry]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (fullscreen) setFullscreen(false);
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fullscreen]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Download a 12×16 @ 300 DPI (3600 × 4800 px) print file
  async function handleDownload() {
    if (!geometry || downloading) return;
    setDownloading(true);
    try {
      const colorSettings: PreviewColorSettings =
        COLOR_SCHEMES.find((s) => s.value === selectedScheme)?.colors ?? DEFAULT_COLOR_SCHEME.colors;
      const titleSettings: PreviewTitleSettings = {
        enabled: true,
        title: print.defaultTitle,
        subtitle: print.defaultSubtitle,
        detail: print.establishedYear ? `EST. ${print.establishedYear}` : '',
        layout: selectedLayout,
      };
      const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';

      const url = await renderPrintSnapshot(
        print.slug, print.bbox, print.center, kind,
        colorSettings, titleSettings, geometry,
        undefined,
        3600, // 12 × 16 in @ 300 DPI
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${print.slug}-map-print-12x16.png`;
      a.click();
    } catch (err) {
      console.warn('Download failed', err);
    } finally {
      setDownloading(false);
    }
  }

  const displayUrl = previewUrl ?? cachedThumb;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden bg-white shadow-[0_40px_120px_rgba(0,0,0,0.3)] lg:flex-row">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center text-[#666] hover:text-[#111]"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Left: print preview */}
        <div className="flex flex-shrink-0 flex-col items-center justify-center gap-4 bg-[#f4f0e8] p-6 lg:w-[46%]">
          <div className="relative w-full max-w-[320px]" style={{ aspectRatio: '3/4' }}>
            {displayUrl ? (
              <ImageMagnifier
                src={displayUrl}
                alt={`${print.name} map print preview`}
                className="absolute inset-0 h-full w-full object-cover shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
                magnification={3.5}
                lensSize={220}
              />
            ) : (
              <div className="absolute inset-0 bg-[#07122a]/8 shadow-[0_20px_60px_rgba(0,0,0,0.22)]" />
            )}
            {previewLoading && displayUrl && (
              <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/20" />
            )}
            {previewLoading && !displayUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#07122a]/20 border-t-[#07122a]" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-5">
            <button
              onClick={() => setFullscreen(true)}
              disabled={!previewUrl}
              className="flex items-center gap-2 text-[10px] uppercase tracking-[1.6px] text-[#555] transition-colors hover:text-[#111] disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Full Screen
            </button>
            <button
              onClick={handleDownload}
              disabled={!geometry || downloading}
              className="flex items-center gap-2 text-[10px] uppercase tracking-[1.6px] text-[#555] transition-colors hover:text-[#111] disabled:opacity-40"
              title="Download 12×16 in print file at 300 DPI"
            >
              {downloading ? (
                <div className="h-3 w-3 animate-spin rounded-full border border-[#555] border-t-transparent" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1v9M4 7l4 4 4-4M2 14h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {downloading ? 'Generating…' : 'Download 12×16'}
            </button>
          </div>

          <p className="text-center text-[9px] uppercase tracking-[1px] text-[#aaa]">
            Hover preview to zoom · Download is 300 DPI
          </p>
        </div>

        {/* Right: options */}
        <div className="flex flex-1 flex-col overflow-y-auto p-7 lg:p-8">

          <div className="mb-6 border-b border-[#e8e2d8] pb-6">
            <div className="mb-1 text-[10px] uppercase tracking-[2px] text-[#999]">
              {print.kind === 'country' ? 'National Print' : 'State Print'}
            </div>
            <h2 className="font-display text-3xl font-light leading-tight">{print.name}</h2>
            {print.defaultSubtitle && <p className="mt-1 text-sm text-[#777]">{print.defaultSubtitle}</p>}
            {print.establishedYear && (
              <p className="mt-0.5 text-[11px] uppercase tracking-[1.4px] text-[#aaa]">EST. {print.establishedYear}</p>
            )}
          </div>

          <div className="mb-6">
            <div className="mb-3 text-[10px] uppercase tracking-[2px] text-[#777]">Color Scheme</div>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.value}
                  onClick={() => setSelectedScheme(scheme.value)}
                  className={`flex flex-col items-start gap-2 border p-2.5 text-left transition-all ${
                    selectedScheme === scheme.value
                      ? 'border-[#111] shadow-[inset_0_0_0_1px_#111]'
                      : 'border-[#e0dbd2] hover:border-[#aaa]'
                  }`}
                >
                  <ColorSwatch colors={scheme.colors} />
                  <span className="text-[10px] uppercase tracking-[1.4px] leading-none">{scheme.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-3 text-[10px] uppercase tracking-[2px] text-[#777]">Title Layout</div>
            <div className="flex flex-col gap-1.5">
              {TITLE_LAYOUTS.map((layout) => (
                <button
                  key={layout.value}
                  onClick={() => setSelectedLayout(layout.value)}
                  className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-all ${
                    selectedLayout === layout.value
                      ? 'border-[#111] bg-[#f8f6f2]'
                      : 'border-[#e0dbd2] hover:border-[#bbb]'
                  }`}
                >
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full border ${selectedLayout === layout.value ? 'border-[#111] bg-[#111]' : 'border-[#bbb]'}`} />
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[1.2px]">{layout.label}</div>
                    <div className="text-[10px] text-[#999]">{layout.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-4">
            <button className="w-full bg-[#07122a] py-4 text-[11px] font-medium uppercase tracking-[2px] text-white transition-opacity hover:opacity-85">
              Add to Cart — From $49
            </button>
            <Link
              href={`/customize?print=${print.slug}`}
              className="block w-full border border-[#ccc] py-3.5 text-center text-[11px] uppercase tracking-[1.6px] text-[#555] transition-colors hover:border-[#111] hover:text-[#111]"
            >
              Customize this view
            </Link>
          </div>
        </div>
      </div>

      {/* Fullscreen — same cached snapshot, instant, with magnifier */}
      {fullscreen && previewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0a0a]/95 p-6"
          onClick={(e) => { if (e.currentTarget === e.target) setFullscreen(false); }}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute right-6 top-6 z-10 flex items-center gap-2 text-[11px] uppercase tracking-[1.6px] text-white/70 transition-colors hover:text-white"
            aria-label="Close full screen"
          >
            Close
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <ImageMagnifier
            src={previewUrl}
            alt={`${print.name} map print — full screen`}
            className="shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
            style={{ height: '90vh', width: 'auto', maxWidth: '92vw', objectFit: 'contain' }}
            magnification={4}
            lensSize={280}
          />
        </div>
      )}
    </div>
  );
}

function ColorSwatch({ colors }: { colors: PreviewColorSettings }) {
  const ink = colors.useMapDefault ? '#8a8a84' : (colors.water || colors.roads || '#07122a');
  return (
    <div className="h-7 w-full overflow-hidden" style={{ backgroundColor: colors.land || '#fff' }}>
      <div className="h-[40%] w-full" style={{ backgroundColor: ink }} />
    </div>
  );
}
