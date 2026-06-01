'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CatalogPrint } from '@/lib/catalog/prints';
import {
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME,
  sameColorSettings,
  type PreviewColorSettings,
} from '@/lib/print/colorSchemes';
import { TITLE_LAYOUTS, DEFAULT_TITLE_LAYOUT, type PreviewTitleLayout, type PreviewTitleSettings } from '@/lib/print/titleLayouts';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderPrintSnapshot, PREVIEW_SNAPSHOT_CACHE, getPreviewCacheKey, colorCacheKey } from '@/lib/print/printSnapshot';
import { type PrintDetailSettings, type Density, type BorderWeight, DEFAULT_DETAIL_SETTINGS } from '@/lib/print/printRender';
import { ImageMagnifier } from '@/components/ui/ImageMagnifier';

interface PrintCustomizerProps {
  print: CatalogPrint;
}

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'less', label: 'Less' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'more', label: 'More' },
];

export function PrintCustomizer({ print }: PrintCustomizerProps) {
  const [colors, setColors] = useState<PreviewColorSettings>(DEFAULT_COLOR_SCHEME.colors);
  const [layout, setLayout] = useState<PreviewTitleLayout>(DEFAULT_TITLE_LAYOUT);
  const [detail, setDetail] = useState<PrintDetailSettings>(DEFAULT_DETAIL_SETTINGS);
  const [downloading, setDownloading] = useState(false);

  const [geometry, setGeometry] = useState<GeoJSON.Geometry | null>(
    () => getCachedBoundary(print.slug)?.geometry ?? null
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';
  const isCountry = kind === 'country';
  const activePreset = COLOR_SCHEMES.find((s) => sameColorSettings(s.colors, colors))?.value ?? 'custom';

  useEffect(() => {
    if (geometry) return;
    let cancelled = false;
    fetchBoundary(print.slug, print.center, kind).then((record) => {
      if (!cancelled && record?.geometry) setGeometry(record.geometry);
    });
    return () => { cancelled = true; };
  }, [print.slug, print.center, kind, geometry]);

  useEffect(() => {
    if (!geometry) return;
    const cacheKey = getPreviewCacheKey(print.slug, colorCacheKey(colors), layout, detail);
    const cached = PREVIEW_SNAPSHOT_CACHE.get(cacheKey);
    if (cached) { setPreviewUrl(cached); setLoading(false); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    renderPrintSnapshot(
      print.slug, print.bbox, print.center, kind,
      colors, titleFor(print, layout), geometry,
      controller.signal,
      detail,
    ).then((url) => {
      if (controller.signal.aborted) return;
      PREVIEW_SNAPSHOT_CACHE.set(cacheKey, url);
      setPreviewUrl(url);
      setLoading(false);
    }).catch((err) => {
      if (err?.message !== 'aborted') { console.warn('Snapshot failed', err); setLoading(false); }
    });

    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print.slug, colors, layout, detail, geometry]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleDownload() {
    if (!geometry || downloading) return;
    setDownloading(true);
    try {
      const url = await renderPrintSnapshot(
        print.slug, print.bbox, print.center, kind,
        colors, titleFor(print, layout), geometry,
        undefined, detail, 3600,
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

  function setColor(channel: 'land' | 'water' | 'roads', value: string) {
    setColors((c) => ({ land: c.land, water: c.water, roads: c.roads, [channel]: value }));
  }

  return (
    <div className="min-h-screen bg-[#ece7dd]">
      <div className="flex items-center justify-between border-b border-[#ddd6c8] bg-[#f4f0e8] px-6 py-4">
        <Link href="/" className="text-[11px] uppercase tracking-[1.8px] text-[#555] transition-colors hover:text-[#111]">
          ← Back to Catalog
        </Link>
        <div className="text-[11px] uppercase tracking-[2px] text-[#999]">Customize Your Print</div>
        <div className="w-[120px]" />
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-6 py-8 lg:flex-row lg:py-12">

        {/* Left: large preview */}
        <div className="flex flex-1 flex-col items-center justify-start lg:sticky lg:top-12 lg:self-start">
          <div className="relative w-full max-w-[520px]" style={{ aspectRatio: '3/4' }}>
            {previewUrl ? (
              <ImageMagnifier
                src={previewUrl}
                alt={`${print.name} customizable map print`}
                className="absolute inset-0 h-full w-full object-cover shadow-[0_30px_90px_rgba(0,0,0,0.28)]"
                magnification={3.5}
                lensSize={260}
              />
            ) : (
              <div className="absolute inset-0 bg-[#07122a]/8 shadow-[0_30px_90px_rgba(0,0,0,0.28)]" />
            )}
            {loading && previewUrl && (
              <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/25" />
            )}
            {loading && !previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#07122a]/20 border-t-[#07122a]" />
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-[10px] uppercase tracking-[1.4px] text-[#999]">
            {loading ? 'Updating preview…' : 'Hover to zoom · Live print preview'}
          </p>
        </div>

        {/* Right: controls */}
        <div className="w-full lg:w-[400px]">
          <div className="mb-1 text-[10px] uppercase tracking-[2px] text-[#999]">
            {isCountry ? 'National Print' : print.kind === 'state' ? 'State Print' : 'City Print'}
          </div>
          <h1 className="font-display text-4xl font-light leading-tight">{print.name}</h1>
          {print.defaultSubtitle && <p className="mt-1 text-sm text-[#777]">{print.defaultSubtitle}</p>}

          <div className="mt-8 flex flex-col gap-7">

            {/* Map detail */}
            <Section title="Map Detail">
              {isCountry && (
                <p className="mb-3 text-[10px] leading-relaxed text-[#999]">
                  Always includes state outlines + state capitals. Toggles add more on top.
                </p>
              )}
              <SegRow
                label={isCountry ? 'Cities & Towns' : 'Cities & Towns'}
                hint="Less = major cities · More = every town"
                options={DENSITY_OPTIONS}
                value={detail.places}
                onChange={(v) => setDetail((d) => ({ ...d, places: v }))}
              />
              <SegRow
                label="Roads"
                hint="Less = highways · More = streets"
                options={DENSITY_OPTIONS}
                value={detail.roads}
                onChange={(v) => setDetail((d) => ({ ...d, roads: v }))}
              />
              <SegRow
                label="County Lines"
                options={[
                  { value: 'none' as Density, label: 'Off' },
                  { value: 'more' as Density, label: 'On' },
                ]}
                value={detail.counties ? 'more' : 'none'}
                onChange={(v) => setDetail((d) => ({ ...d, counties: v === 'more' }))}
              />
              {kind === 'city' && (
                <SegRow<BorderWeight>
                  label="Border"
                  hint="Ink frame around the map"
                  options={[
                    { value: 'none', label: 'Off' },
                    { value: 'thin', label: 'Thin' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'thick', label: 'Thick' },
                  ]}
                  value={detail.border}
                  onChange={(v) => setDetail((d) => ({ ...d, border: v }))}
                />
              )}
            </Section>

            {/* Color scheme presets */}
            <Section title="Color Scheme">
              <div className="grid grid-cols-3 gap-2">
                {COLOR_SCHEMES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setColors(s.colors)}
                    className={`flex flex-col items-start gap-2 border p-2.5 text-left transition-all ${
                      activePreset === s.value ? 'border-[#111] shadow-[inset_0_0_0_1px_#111]' : 'border-[#d8d1c4] hover:border-[#aaa]'
                    }`}
                  >
                    <ColorSwatch colors={s.colors} />
                    <span className="text-[10px] uppercase tracking-[1.4px] leading-none">{s.label}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Custom colors — any color for land + water (+ roads) */}
            <Section title="Custom Colors">
              <div className="flex flex-col gap-2">
                <ColorField label="Land" value={colors.land} onChange={(v) => setColor('land', v)} />
                <ColorField label="Water" value={colors.water} onChange={(v) => setColor('water', v)} />
                <ColorField label="Roads & Labels" value={colors.roads} onChange={(v) => setColor('roads', v)} />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[#999]">
                Pick any color for land and water. {activePreset === 'custom' && 'Custom palette active.'}
              </p>
            </Section>

            {/* Title layout */}
            <Section title="Title Layout">
              <div className="flex flex-col gap-1.5">
                {TITLE_LAYOUTS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLayout(l.value)}
                    className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-all ${
                      layout === l.value ? 'border-[#111] bg-[#f8f6f2]' : 'border-[#d8d1c4] hover:border-[#bbb]'
                    }`}
                  >
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full border ${layout === l.value ? 'border-[#111] bg-[#111]' : 'border-[#bbb]'}`} />
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[1.2px]">{l.label}</div>
                      <div className="text-[10px] text-[#999]">{l.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            {/* Actions */}
            <div className="flex flex-col gap-3 border-t border-[#ddd6c8] pt-6">
              <button className="w-full bg-[#07122a] py-4 text-[11px] font-medium uppercase tracking-[2px] text-white transition-opacity hover:opacity-85">
                Add to Cart — From $49
              </button>
              <button
                onClick={handleDownload}
                disabled={!geometry || downloading}
                className="flex w-full items-center justify-center gap-2 border border-[#bbb] py-3.5 text-[11px] uppercase tracking-[1.6px] text-[#555] transition-colors hover:border-[#111] hover:text-[#111] disabled:opacity-40"
              >
                {downloading ? (
                  <><div className="h-3 w-3 animate-spin rounded-full border border-[#555] border-t-transparent" /> Generating…</>
                ) : (
                  'Download 12×16 (300 DPI)'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function titleFor(print: CatalogPrint, layout: PreviewTitleLayout): PreviewTitleSettings {
  return {
    enabled: true,
    title: print.defaultTitle,
    subtitle: print.defaultSubtitle,
    detail: print.establishedYear ? `EST. ${print.establishedYear}` : '',
    layout,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[2px] text-[#777]">{title}</div>
      {children}
    </div>
  );
}

function SegRow<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[1.2px] text-[#444]">{label}</span>
        {hint && <span className="text-right text-[9px] text-[#aaa]">{hint}</span>}
      </div>
      <div className="flex w-full overflow-hidden rounded border border-[#d8d1c4]">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2 text-[10px] uppercase tracking-[1.2px] transition-all ${i > 0 ? 'border-l border-[#d8d1c4]' : ''} ${
              value === opt.value ? 'bg-[#111] text-white' : 'bg-white text-[#777] hover:bg-[#f4f0e8]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 border border-[#d8d1c4] bg-white px-3 py-2">
      <span>
        <span className="block text-[11px] text-[#444]">{label}</span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase text-[#aaa]">{value}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer border border-[#d8d1c4] bg-white p-0.5"
      />
    </label>
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
