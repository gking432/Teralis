'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { COLOR_SCHEMES, DEFAULT_COLOR_SCHEME, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { TITLE_LAYOUTS, DEFAULT_TITLE_LAYOUT, type PreviewTitleLayout, type PreviewTitleSettings } from '@/lib/print/titleLayouts';

const PrintArtwork = dynamic(
  () => import('@/components/Print/PrintArtwork').then((m) => m.PrintArtwork),
  { ssr: false, loading: () => <div className="w-full bg-[#07122a]" style={{ aspectRatio: '4/3' }} /> }
);

interface PrintQuickShopProps {
  print: CatalogPrint;
  onClose: () => void;
}

export function PrintQuickShop({ print, onClose }: PrintQuickShopProps) {
  const [selectedScheme, setSelectedScheme] = useState(DEFAULT_COLOR_SCHEME.value);
  const [selectedLayout, setSelectedLayout] = useState<PreviewTitleLayout>(DEFAULT_TITLE_LAYOUT);
  const overlayRef = useRef<HTMLDivElement>(null);

  const colorSettings: PreviewColorSettings =
    COLOR_SCHEMES.find((s) => s.value === selectedScheme)?.colors ?? DEFAULT_COLOR_SCHEME.colors;

  const titleSettings: PreviewTitleSettings = {
    enabled: true,
    title: print.defaultTitle,
    subtitle: print.defaultSubtitle,
    detail: print.establishedYear ? `EST. ${print.establishedYear}` : '',
    layout: selectedLayout,
  };

  // Close on backdrop click
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-[960px] flex-col overflow-hidden bg-white shadow-[0_40px_120px_rgba(0,0,0,0.3)] lg:flex-row">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center text-[#666] hover:text-[#111]"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Left: Print preview */}
        <div className="flex flex-shrink-0 items-center justify-center bg-[#f4f0e8] p-6 lg:w-[55%]">
          <div className="w-full max-w-[480px]">
            <PrintArtwork
              slug={print.slug}
              bbox={print.bbox}
              colorSettings={colorSettings}
              titleSettings={titleSettings}
              className="shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
            />
          </div>
        </div>

        {/* Right: Options panel */}
        <div className="flex flex-1 flex-col overflow-y-auto p-7 lg:p-8">
          {/* Print identity */}
          <div className="mb-7 border-b border-[#e8e2d8] pb-6">
            <div className="mb-1 text-[10px] uppercase tracking-[2px] text-[#999]">
              {print.kind === 'country' ? 'National Print' : 'State Print'}
            </div>
            <h2 className="font-display text-3xl font-light leading-tight">{print.name}</h2>
            {print.defaultSubtitle && (
              <p className="mt-1 text-sm text-[#777]">{print.defaultSubtitle}</p>
            )}
            {print.establishedYear && (
              <p className="mt-0.5 text-[11px] uppercase tracking-[1.4px] text-[#aaa]">
                EST. {print.establishedYear}
              </p>
            )}
          </div>

          {/* Color scheme */}
          <div className="mb-7">
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

          {/* Title layout */}
          <div className="mb-8">
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
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full border ${
                      selectedLayout === layout.value ? 'border-[#111] bg-[#111]' : 'border-[#bbb]'
                    }`}
                  />
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[1.2px]">{layout.label}</div>
                    <div className="text-[10px] text-[#999]">{layout.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-3">
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
    </div>
  );
}

function ColorSwatch({ colors }: { colors: PreviewColorSettings }) {
  const ink = colors.useMapDefault ? '#8a8a84' : colors.water || colors.roads || '#07122a';
  const land = colors.land || '#ffffff';
  return (
    <div
      className="h-7 w-full overflow-hidden"
      style={{ backgroundColor: land }}
    >
      <div className="h-[40%] w-full" style={{ backgroundColor: ink }} />
    </div>
  );
}
