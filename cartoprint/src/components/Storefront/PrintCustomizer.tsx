'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CatalogPrint } from '@/lib/catalog/prints';
import {
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME,
  getPrintInkColor,
  sameColorSettings,
  type PreviewColorSettings,
} from '@/lib/print/colorSchemes';
import {
  TITLE_LAYOUTS,
  type TitleBlockSettings,
  type TitleStyle,
  defaultTitleBlock,
} from '@/lib/print/titleLayouts';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderPrintSnapshot, PREVIEW_SNAPSHOT_CACHE, getPreviewCacheKey, colorCacheKey, bakeTitleBlock, ORIENTATION_RATIO, type Orientation } from '@/lib/print/printSnapshot';
import { SESSION_PREVIEW_KEY, SESSION_CUSTOMIZATION_KEY } from '@/lib/print/sizeCatalog';
import { type PrintDetailSettings, type Density, type BorderWeight, DEFAULT_DETAIL_SETTINGS } from '@/lib/print/printRender';

interface PrintCustomizerProps {
  print: CatalogPrint;
  orientation?: Orientation;
}

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'less', label: 'Less' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'more', label: 'More' },
];

// State-level roads: no residential streets. "More" maps to highways + main
// roads (the old 'neutral' tier).
const STATE_ROADS_OPTIONS: { value: Density; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'less', label: 'Less' },
  { value: 'neutral', label: 'More' },
];

export function PrintCustomizer({ print, orientation = 'portrait' }: PrintCustomizerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [colors, setColors] = useState<PreviewColorSettings>(DEFAULT_COLOR_SCHEME.colors);
  const [titleBlock, setTitleBlock] = useState<TitleBlockSettings>(() =>
    defaultTitleBlock(
      print.defaultTitle,
      print.defaultSubtitle,
      print.establishedYear ? `EST. ${print.establishedYear}` : '',
    )
  );
  const [detail, setDetail] = useState<PrintDetailSettings>(DEFAULT_DETAIL_SETTINGS);
  const [downloading, setDownloading] = useState(false);

  const [geometry, setGeometry] = useState<GeoJSON.Geometry | null>(
    () => getCachedBoundary(print.slug)?.geometry ?? null
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';
  const isCountry = kind === 'country';
  const activePreset = COLOR_SCHEMES.find((s) => sameColorSettings(s.colors, colors))?.value ?? 'custom';
  const isFreeform = titleBlock.layout === 'freeform';
  // Print height/width ratio comes from orientation alone. The title footer
  // (if any) is carved out of the canvas — the canvas itself never grows.
  const printRatio = ORIENTATION_RATIO[orientation];

  useEffect(() => {
    if (geometry) return;
    let cancelled = false;
    fetchBoundary(print.slug, print.center, kind).then((record) => {
      if (!cancelled && record?.geometry) setGeometry(record.geometry);
    });
    return () => { cancelled = true; };
  }, [print.slug, print.center, kind, geometry]);

  // Preview cache key: for fixed layouts we bake the title into the snapshot,
  // so layout + style + enabled must all be part of the key (enabled grows the
  // canvas with a footer). For freeform the snapshot is identical regardless
  // of title position. Orientation changes the canvas shape too.
  const glassTag = titleBlock.style === 'translucent' ? `:${titleBlock.glassFill}` : '';
  const previewLayoutKey = `${orientation}:${isFreeform ? 'freeform' : `${titleBlock.layout}:${titleBlock.style}${glassTag}:${titleBlock.enabled ? 'on' : 'off'}`}`;

  useEffect(() => {
    if (!geometry) return;
    const cacheKey = getPreviewCacheKey(print.slug, colorCacheKey(colors), previewLayoutKey, detail);
    const cached = PREVIEW_SNAPSHOT_CACHE.get(cacheKey);
    if (cached) { setPreviewUrl(cached); setLoading(false); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    renderPrintSnapshot(
      print.slug, print.bbox, print.center, kind,
      colors,
      {
        enabled: titleBlock.enabled,
        title: titleBlock.title,
        subtitle: titleBlock.subtitle,
        detail: titleBlock.detail,
        layout: titleBlock.layout,
        inverted: false,
        style: titleBlock.style,
        glassTextColor: titleBlock.glassFill === 'ink'
          ? getPrintInkColor(colors)
          : (colors.land || '#ffffff'),
      },
      geometry,
      controller.signal,
      detail,
      undefined,
      orientation,
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
  }, [print.slug, colors, detail, geometry, previewLayoutKey, titleBlock.enabled, orientation]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleDownload() {
    if (!geometry || downloading) return;
    setDownloading(true);
    try {
      const DOWNLOAD_W = 3600;
      const DOWNLOAD_H = Math.round(DOWNLOAD_W * printRatio);
      const mapUrl = await renderPrintSnapshot(
        print.slug, print.bbox, print.center, kind,
        colors,
        {
          enabled: titleBlock.enabled,
          title: titleBlock.title,
          subtitle: titleBlock.subtitle,
          detail: titleBlock.detail,
          layout: titleBlock.layout,
          inverted: false,
          style: titleBlock.style,
          glassTextColor: titleBlock.glassFill === 'ink'
            ? getPrintInkColor(colors)
            : (colors.land || '#ffffff'),
        },
        geometry,
        undefined, detail, DOWNLOAD_W, orientation,
      );

      let finalDataUrl: string;
      if (isFreeform && titleBlock.enabled) {
        // Snapshot is map-only; bake the freeform title block onto it.
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const el = new Image();
          el.onload = () => res(el);
          el.onerror = rej;
          el.src = mapUrl;
        });
        const c = document.createElement('canvas');
        c.width = DOWNLOAD_W;
        c.height = DOWNLOAD_H;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        await document.fonts.ready;
        bakeTitleBlock(ctx, titleBlock, colors, DOWNLOAD_W, DOWNLOAD_H);
        finalDataUrl = c.toDataURL('image/png');
      } else {
        finalDataUrl = mapUrl;
      }

      const a = document.createElement('a');
      a.href = finalDataUrl;
      a.download = `${print.slug}-map-print-${orientation}.png`;
      a.click();
    } catch (err) {
      console.warn('Download failed', err);
    } finally {
      setDownloading(false);
    }
  }

  function handleNext() {
    try {
      if (previewUrl) sessionStorage.setItem(SESSION_PREVIEW_KEY, previewUrl);
      sessionStorage.setItem(SESSION_CUSTOMIZATION_KEY, JSON.stringify({ colors, titleBlock, detail }));
    } catch {}
    const params = new URLSearchParams(searchParams.toString());
    router.push(`/size?${params.toString()}`);
  }

  function setColor(channel: 'land' | 'water' | 'roads', value: string) {
    setColors((c) => ({ land: c.land, water: c.water, roads: c.roads, [channel]: value }));
  }

  return (
    <div className="min-h-screen bg-[#ece7dd]">
      <div className="flex items-center justify-between border-b border-[#ddd6c8] bg-[#f4f0e8] px-6 py-4">
        <Link
          href={`/design?${searchParams.toString()}`}
          className="text-[11px] uppercase tracking-[1.8px] text-[#555] transition-colors hover:text-[#111]"
        >
          ← Back to Orientation
        </Link>
        <div className="text-[11px] uppercase tracking-[2px] text-[#999]">
          Step 2 of 3 · Customize · <span className="text-[#555]">{orientation}</span>
        </div>
        <div className="w-[120px]" />
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-8 lg:flex-row lg:py-12">

        {/* Left: large preview */}
        <div className="flex flex-1 flex-col items-center justify-start lg:sticky lg:top-4 lg:self-start">
          <div
            ref={previewContainerRef}
            className="relative overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.28)]"
            style={{
              // Explicit width AND height — no aspect-ratio fallback math.
              // Width uses min() so the preview shrinks on narrow viewports;
              // height tracks width via the same min() multiplied by printRatio,
              // so container ratio is mathematically guaranteed to equal image ratio.
              width: orientation === 'landscape' ? 'min(880px, 90vw)' : 'min(600px, 90vw)',
              height: orientation === 'landscape'
                ? `calc(min(880px, 90vw) * ${printRatio.toFixed(4)})`
                : `calc(min(600px, 90vw) * ${printRatio.toFixed(4)})`,
            }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt={`${print.name} customizable map print`}
                className="absolute inset-0 h-full w-full object-fill"
              />
            )}
            {!previewUrl && (
              <div className="absolute inset-0 bg-[#07122a]/8" />
            )}
            {loading && previewUrl && (
              <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/25" />
            )}
            {loading && !previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#07122a]/20 border-t-[#07122a]" />
              </div>
            )}
            {isFreeform && titleBlock.enabled && (
              <DraggableTitle
                block={titleBlock}
                onChange={setTitleBlock}
                containerRef={previewContainerRef}
                colors={colors}
              />
            )}
          </div>
          <p className="mt-4 text-center text-[10px] uppercase tracking-[1.4px] text-[#999]">
            {loading
              ? 'Updating preview…'
              : isFreeform
                ? 'Click label to select · drag to reposition'
                : 'Live print preview'}
          </p>
          <p className="mt-1 text-center text-[10px] uppercase tracking-[1.4px] text-[#bbb]">
            Print ratio · {(1 / printRatio).toFixed(2)} : 1.00
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
              {kind !== 'city' && (
                <SegRow
                  label="Cities & Towns"
                  hint="Less = major cities · More = every town"
                  options={DENSITY_OPTIONS}
                  value={detail.places}
                  onChange={(v) => setDetail((d) => ({ ...d, places: v }))}
                />
              )}
              <SegRow
                label="Roads"
                hint={kind === 'state' ? 'Less = highways · More = main roads' : 'Less = highways · More = streets'}
                options={kind === 'state' ? STATE_ROADS_OPTIONS : DENSITY_OPTIONS}
                value={detail.roads}
                onChange={(v) => setDetail((d) => ({ ...d, roads: v }))}
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

            {/* Title Label */}
            <Section title="Title Label">
              <SegRow
                label="Label"
                options={[
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
                value={titleBlock.enabled ? 'on' : 'off'}
                onChange={(v) => setTitleBlock((b) => ({ ...b, enabled: v === 'on' }))}
              />
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[1.2px] text-[#444]">Layout</div>
                <div className="grid grid-cols-2 gap-2">
                  {TITLE_LAYOUTS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTitleBlock((b) => ({ ...b, layout: opt.value }))}
                      disabled={!titleBlock.enabled}
                      className={`flex flex-col items-start gap-0.5 border px-3 py-2 text-left transition-all disabled:opacity-40 ${
                        titleBlock.layout === opt.value
                          ? 'border-[#111] bg-[#f4f0e8]'
                          : 'border-[#d8d1c4] bg-white hover:border-[#aaa]'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-[1.2px] text-[#222]">{opt.label}</span>
                      <span className="text-[9px] leading-tight text-[#999]">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <SegRow<TitleStyle>
                label="Background"
                hint="Light · Dark panel · Clear glass"
                options={[
                  { value: 'standard', label: 'Light' },
                  { value: 'inverted', label: 'Dark' },
                  { value: 'translucent', label: 'Glass' },
                ]}
                value={titleBlock.style}
                onChange={(v) => setTitleBlock((b) => ({ ...b, style: v }))}
              />
              {titleBlock.style === 'translucent' && (
                <div className="mb-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[1.2px] text-[#444]">Text Color</span>
                    <span className="text-right text-[9px] text-[#aaa]">Pick from your scheme</span>
                  </div>
                  <div className="flex gap-2">
                    {([
                      { fill: 'land' as const, hex: colors.land || '#ffffff', label: 'Light' },
                      { fill: 'ink' as const, hex: getPrintInkColor(colors), label: 'Dark' },
                    ]).map(({ fill, hex, label }) => (
                      <button
                        key={fill}
                        onClick={() => setTitleBlock((b) => ({ ...b, glassFill: fill }))}
                        className={`flex items-center gap-2 border px-3 py-2 text-[10px] uppercase tracking-[1.2px] transition-all ${
                          titleBlock.glassFill === fill
                            ? 'border-[#111] bg-[#f4f0e8]'
                            : 'border-[#d8d1c4] bg-white hover:border-[#aaa]'
                        }`}
                      >
                        <span
                          className="inline-block h-4 w-4 rounded-full border border-[#ccc] flex-shrink-0"
                          style={{ backgroundColor: hex }}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isFreeform && (
                <p className="mt-1 text-[10px] leading-relaxed text-[#999]">
                  Click label to select · drag to move · corners to resize · circle to rotate · click away to deselect
                </p>
              )}
            </Section>

            {/* Actions */}
            <div className="flex flex-col gap-3 border-t border-[#ddd6c8] pt-6">
              <button
                onClick={handleNext}
                className="w-full bg-[#07122a] py-4 text-[11px] font-medium uppercase tracking-[2px] text-white transition-opacity hover:opacity-85"
              >
                Next: Size &amp; Frame →
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

// Measures the rendered text against its parent's width and returns a uniform
// scale that makes the text fit horizontally. scrollWidth is unaffected by
// CSS transforms, so applying transform: scale() doesn't fight the measurement.
function useFitText(deps: unknown[]): {
  textRef: React.RefObject<HTMLDivElement>;
  scaleStyle: React.CSSProperties;
} {
  const textRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = textRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    function measure() {
      if (!el || !parent) return;
      const textW = el.scrollWidth;
      const parentW = parent.clientWidth;
      const next = textW > 0 && textW > parentW ? parentW / textW : 1;
      setScale((prev) => (Math.abs(prev - next) > 0.001 ? next : prev));
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    textRef,
    scaleStyle: { transform: `scale(${scale})`, transformOrigin: 'center' },
  };
}

type DragHandle = 'body' | 'tl' | 'tr' | 'bl' | 'br' | 'rotate';

function DraggableTitle({
  block,
  onChange,
  containerRef,
  colors,
}: {
  block: TitleBlockSettings;
  onChange: (b: TitleBlockSettings) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  colors: PreviewColorSettings;
}) {
  const [selected, setSelected] = useState(true);
  const titleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: DragHandle;
    startNX: number; startNY: number;
    orig: TitleBlockSettings;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (titleRef.current && !titleRef.current.contains(e.target as Node)) {
        setSelected(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const ink = getPrintInkColor(colors);
  const land = colors.land || '#ffffff';
  const trans = block.style === 'translucent';
  const glassColor = block.glassFill === 'ink' ? ink : land;

  function toNorm(e: MouseEvent | React.MouseEvent): { nx: number; ny: number } {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    };
  }

  function onBodyMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    if (!selected) {
      // First click: select only, don't start a drag.
      setSelected(true);
      return;
    }
    const { nx, ny } = toNorm(e);
    dragRef.current = { handle: 'body', startNX: nx, startNY: ny, orig: { ...block }, moved: false };
  }

  function onHandleMouseDown(handle: Exclude<DragHandle, 'body'>, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { nx, ny } = toNorm(e);
    dragRef.current = { handle, startNX: nx, startNY: ny, orig: { ...block }, moved: false };
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const { handle, startNX, startNY, orig } = dragRef.current;
      const { nx, ny } = toNorm(e);
      const dx = nx - startNX;
      const dy = ny - startNY;
      dragRef.current.moved = true;

      if (handle === 'body') {
        onChange({ ...orig, x: orig.x + dx, y: orig.y + dy });
      } else if (handle === 'rotate') {
        const cx = orig.x + orig.w / 2;
        const cy = orig.y + orig.h / 2;
        const startA = Math.atan2(startNY - cy, startNX - cx);
        const curA = Math.atan2(ny - cy, nx - cx);
        onChange({ ...orig, rotation: orig.rotation + (curA - startA) * (180 / Math.PI) });
      } else {
        // Locked aspect-ratio resize: compute a single uniform scale from the
        // average of how much each axis changed relative to its original size,
        // so the box always scales proportionally and text can never overflow.
        const ratio = orig.w / orig.h;
        let scale: number;
        if (handle === 'br') {
          scale = 1 + (dx / orig.w + dy / orig.h) / 2;
        } else if (handle === 'tl') {
          scale = 1 + (-dx / orig.w - dy / orig.h) / 2;
        } else if (handle === 'tr') {
          scale = 1 + (dx / orig.w - dy / orig.h) / 2;
        } else {
          // bl
          scale = 1 + (-dx / orig.w + dy / orig.h) / 2;
        }
        const newW = Math.max(0.06, orig.w * scale);
        const newH = newW / ratio;
        // Keep the anchor corner (opposite to the drag handle) fixed in place.
        let newX = orig.x, newY = orig.y;
        if (handle === 'tl') { newX = orig.x + orig.w - newW; newY = orig.y + orig.h - newH; }
        else if (handle === 'tr') { newY = orig.y + orig.h - newH; }
        else if (handle === 'bl') { newX = orig.x + orig.w - newW; }
        onChange({ ...orig, x: newX, y: newY, w: newW, h: newH });
      }
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onChange, containerRef]);

  const bgColor = block.style === 'inverted' ? ink : land;
  const textFill = trans ? glassColor : (block.style === 'standard' ? ink : land);
  const hasSubtitle = Boolean(block.subtitle.trim());
  const hasDetail = Boolean(block.detail.trim());
  const isLong = block.title.length > 10;
  const isVeryLong = block.title.length > 16;

  const titleFit    = useFitText([block.title,    hasSubtitle, hasDetail, block.w, block.h]);
  const subtitleFit = useFitText([block.subtitle, hasDetail,              block.w, block.h]);
  const detailFit   = useFitText([block.detail,                           block.w, block.h]);

  if (!block.enabled) return null;

  return (
    <div
      ref={titleRef}
      style={{
        position: 'absolute',
        left: `${block.x * 100}%`,
        top: `${block.y * 100}%`,
        width: `${block.w * 100}%`,
        height: `${block.h * 100}%`,
        transform: `rotate(${block.rotation}deg)`,
        transformOrigin: 'center',
        cursor: selected ? 'move' : 'pointer',
        userSelect: 'none',
        containerType: 'size',
      } as React.CSSProperties}
      onMouseDown={onBodyMouseDown}
    >
      {!trans && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: bgColor }} />
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          gap: '4cqh',
          pointerEvents: 'none',
          padding: '0 4%',
        } as React.CSSProperties}
      >
        <div
          ref={titleFit.textRef}
          style={{
            color: textFill,
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontWeight: 300,
            fontSize: `${(hasSubtitle || hasDetail) ? 28 : 36}cqh`,
            letterSpacing: isVeryLong ? '0.1em' : isLong ? '0.16em' : '0.22em',
            whiteSpace: 'nowrap',
            ...titleFit.scaleStyle,
          }}
        >
          {block.title.trim().toUpperCase()}
        </div>
        {hasSubtitle && (
          <div
            ref={subtitleFit.textRef}
            style={{
              color: textFill,
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 400,
              fontSize: '14cqh',
              letterSpacing: '0.22em',
              whiteSpace: 'nowrap',
              ...subtitleFit.scaleStyle,
            }}
          >
            {block.subtitle.trim().toUpperCase()}
          </div>
        )}
        {hasDetail && (
          <div
            ref={detailFit.textRef}
            style={{
              color: textFill,
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 400,
              fontSize: '11cqh',
              letterSpacing: '0.14em',
              whiteSpace: 'nowrap',
              ...detailFit.scaleStyle,
            }}
          >
            {block.detail.trim().toUpperCase()}
          </div>
        )}
      </div>

      {/* Selection chrome — only visible when selected */}
      {selected && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            outline: '1.5px dashed rgba(80,80,80,0.45)',
            outlineOffset: '-1px',
            pointerEvents: 'none',
          }} />

          {([
            ['tl', { top: -5, left: -5, cursor: 'nw-resize' }],
            ['tr', { top: -5, right: -5, cursor: 'ne-resize' }],
            ['bl', { bottom: -5, left: -5, cursor: 'sw-resize' }],
            ['br', { bottom: -5, right: -5, cursor: 'se-resize' }],
          ] as const).map(([handle, pos]) => (
            <div
              key={handle}
              style={{
                position: 'absolute', width: 10, height: 10,
                backgroundColor: 'white', border: '1.5px solid #333',
                borderRadius: 2, ...pos,
              }}
              onMouseDown={(e) => onHandleMouseDown(handle, e)}
            />
          ))}

          <div
            style={{ position: 'absolute', left: '50%', top: -30, transform: 'translateX(-50%)', cursor: 'grab' }}
            onMouseDown={(e) => onHandleMouseDown('rotate', e)}
          >
            <div style={{
              position: 'absolute', left: '50%', bottom: 0,
              width: 1, height: 18,
              backgroundColor: 'rgba(50,50,50,0.5)',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              backgroundColor: 'white', border: '1.5px solid #333',
              position: 'relative', zIndex: 1,
            }} />
          </div>
        </>
      )}
    </div>
  );
}
