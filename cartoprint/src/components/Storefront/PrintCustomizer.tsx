'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { COLOR_SCHEMES, sameColorSettings, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import type { TitleBlockSettings } from '@/lib/print/titleLayouts';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import {
  colorCacheKey,
  getPreviewCacheKey,
  ORIENTATION_RATIO,
  PREVIEW_SNAPSHOT_CACHE,
  renderPrintSnapshot,
  type Orientation,
} from '@/lib/print/printSnapshot';
import { SESSION_CUSTOMIZATION_KEY, SESSION_PREVIEW_KEY } from '@/lib/print/sizeCatalog';
import type { PrintDetailSettings } from '@/lib/print/printRender';
import {
  createPrintScene,
  panViewportByPixels,
  readStoredScene,
  sceneCacheTag,
  storeScene,
  transformViewport,
  viewportForCityFraming,
  type CityFramingId,
  type PrintScene,
} from '@/lib/print/scene';

interface PrintCustomizerProps {
  print: CatalogPrint;
  orientation?: Orientation;
}

const CITY_FRAMES: Array<{ id: CityFramingId; title: string; description: string }> = [
  { id: 'city', title: 'City', description: 'Entire city boundary' },
  { id: 'central', title: 'Central', description: 'Downtown + neighborhoods' },
  { id: 'downtown', title: 'Downtown', description: 'A tighter urban core' },
  { id: 'close-up', title: 'Close-up', description: 'Maximum street detail' },
];

function createCityFirstScene(print: CatalogPrint, orientation: Orientation): PrintScene {
  const scene = createPrintScene(print, orientation, 'city-detail');
  return {
    ...scene,
    framing: 'downtown',
    viewport: viewportForCityFraming({ bbox: print.bbox, center: print.center }, print.center, 'downtown'),
    detail: {
      places: print.kind === 'city' ? 'none' : 'less',
      roads: print.kind === 'country' ? 'less' : print.kind === 'state' ? 'neutral' : 'more',
      border: 'none',
      rivers: true,
      counties: false,
      states: false,
      labels: {
        cities: false,
        towns: false,
        roads: false,
        water: false,
        rivers: false,
      },
    },
    title: {
      ...scene.title,
      enabled: false,
      layout: 'compact-bottom',
      style: 'standard',
    },
  };
}

export function PrintCustomizer({ print, orientation = 'portrait' }: PrintCustomizerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scene, setScene] = useState<PrintScene>(() => createCityFirstScene(print, orientation));
  const [restored, setRestored] = useState(false);
  const [geometry, setGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [boundaryReady, setBoundaryReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cropDragRef = useRef<{ x: number; y: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = readStoredScene(print);
    if (stored) setScene(stored);
    setRestored(true);
  }, [print]);

  useEffect(() => {
    if (restored) storeScene(scene);
  }, [scene, restored]);

  useEffect(() => {
    let cancelled = false;
    setBoundaryReady(false);
    if (print.kind === 'city') {
      // City prints use the searched bounding box directly and do not apply an
      // isolation mask, so boundary lookup would only delay the first render.
      setGeometry(null);
      setBoundaryReady(true);
      return;
    }
    const cached = getCachedBoundary(print.slug)?.geometry;
    if (cached) {
      setGeometry(cached);
      setBoundaryReady(true);
      return;
    }

    fetchBoundary(print.slug, print.center, print.kind)
      .then((record) => {
        if (!cancelled) setGeometry(record?.geometry ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBoundaryReady(true);
      });

    return () => { cancelled = true; };
  }, [print.slug, print.center, print.kind]);

  const colors = scene.colors;
  const detail = scene.detail;
  const titleBlock = scene.title;
  const currentOrientation = scene.orientation;
  const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';
  const printRatio = ORIENTATION_RATIO[currentOrientation];
  const canContinue = Boolean(previewUrl) && !loading && !renderError;
  const activePalette = COLOR_SCHEMES.find((scheme) => sameColorSettings(scheme.colors, colors))?.value ?? 'custom';
  const originalViewport = { bbox: print.bbox, center: print.center };
  const framingLabel = CITY_FRAMES.find((frame) => frame.id === scene.framing)?.title ?? 'Custom';
  const previewLayoutKey = `screen1200:${sceneCacheTag(scene)}:${titleBlock.enabled ? 'title' : 'map'}:${titleBlock.title}:${titleBlock.subtitle}:${titleBlock.detail}:${titleBlock.layout}`;

  useEffect(() => {
    if (!boundaryReady) return;
    const cacheKey = getPreviewCacheKey(print.slug, colorCacheKey(colors), previewLayoutKey, detail);
    const cached = PREVIEW_SNAPSHOT_CACHE.get(cacheKey);
    if (cached) {
      setPreviewUrl(cached);
      setLoading(false);
      setRenderError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRenderError(null);

    renderPrintSnapshot(
      print.slug,
      scene.viewport.bbox,
      scene.viewport.center,
      kind,
      colors,
      {
        enabled: titleBlock.enabled,
        title: titleBlock.title,
        subtitle: titleBlock.subtitle,
        detail: titleBlock.detail,
        layout: titleBlock.layout,
        inverted: false,
        style: titleBlock.style,
        glassTextColor: colors.land || '#ffffff',
      },
      geometry,
      controller.signal,
      detail,
      1200,
      currentOrientation,
    ).then((url) => {
      if (controller.signal.aborted) return;
      PREVIEW_SNAPSHOT_CACHE.set(cacheKey, url);
      setPreviewUrl(url);
      setLoading(false);
    }).catch((error) => {
      if (error?.message === 'aborted') return;
      console.warn('City preview failed', error);
      setRenderError('The preview could not finish rendering.');
      setLoading(false);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryReady, colors, currentOrientation, detail, geometry, previewLayoutKey, print.slug, renderAttempt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function updateScene(updater: (current: PrintScene) => PrintScene) {
    setScene((current) => ({ ...updater(current), updatedAt: Date.now() }));
  }

  function setColors(next: PreviewColorSettings | ((current: PreviewColorSettings) => PreviewColorSettings)) {
    updateScene((current) => ({
      ...current,
      colors: typeof next === 'function' ? next(current.colors) : { ...next },
    }));
  }

  function setDetail(next: PrintDetailSettings | ((current: PrintDetailSettings) => PrintDetailSettings)) {
    updateScene((current) => ({
      ...current,
      detail: typeof next === 'function' ? next(current.detail) : next,
    }));
  }

  function setTitle(next: TitleBlockSettings | ((current: TitleBlockSettings) => TitleBlockSettings)) {
    updateScene((current) => ({
      ...current,
      title: typeof next === 'function' ? next(current.title) : next,
    }));
  }

  function setStreetDetail(value: 'main' | 'all') {
    setDetail((current) => ({ ...current, roads: value === 'all' ? 'more' : 'neutral' }));
  }

  function setFraming(framing: CityFramingId) {
    updateScene((current) => ({
      ...current,
      framing,
      viewport: viewportForCityFraming(originalViewport, print.center, framing),
    }));
  }

  function toggleLabel(label: keyof PrintDetailSettings['labels']) {
    setDetail((current) => ({
      ...current,
      labels: { ...current.labels, [label]: !current.labels[label] },
    }));
  }

  function setColor(channel: 'land' | 'water' | 'roads', value: string) {
    setColors((current) => ({
      land: current.land,
      water: current.water,
      roads: current.roads,
      [channel]: value,
    }));
  }

  function moveViewport(operation: Parameters<typeof transformViewport>[1]) {
    updateScene((current) => ({
      ...current,
      framing: operation === 'reset' ? 'downtown' : 'custom',
      viewport: operation === 'reset'
        ? viewportForCityFraming(originalViewport, print.center, 'downtown')
        : transformViewport(current.viewport, operation),
    }));
  }

  function onCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { x: event.clientX, y: event.clientY };
    setDragOffset({ x: 0, y: 0 });
  }

  function onCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = cropDragRef.current;
    if (!start) return;
    setDragOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
  }

  function onCropPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = cropDragRef.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    cropDragRef.current = null;
    setDragOffset({ x: 0, y: 0 });
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    updateScene((current) => ({
      ...current,
      framing: 'custom',
      viewport: panViewportByPixels(current.viewport, dx, dy, rect.width, rect.height),
    }));
  }

  async function handleDownload() {
    if (!boundaryReady || downloading) return;
    setDownloading(true);
    try {
      const url = await renderPrintSnapshot(
        print.slug,
        scene.viewport.bbox,
        scene.viewport.center,
        kind,
        colors,
        {
          enabled: titleBlock.enabled,
          title: titleBlock.title,
          subtitle: titleBlock.subtitle,
          detail: titleBlock.detail,
          layout: titleBlock.layout,
          inverted: false,
          style: titleBlock.style,
          glassTextColor: colors.land || '#ffffff',
        },
        geometry,
        undefined,
        detail,
        3600,
        currentOrientation,
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${print.slug}-city-map-${currentOrientation}.png`;
      anchor.click();
    } catch (error) {
      console.warn('Download failed', error);
    } finally {
      setDownloading(false);
    }
  }

  function handleNext() {
    try {
      if (previewUrl) sessionStorage.setItem(SESSION_PREVIEW_KEY, previewUrl);
      storeScene(scene);
      sessionStorage.setItem(SESSION_CUSTOMIZATION_KEY, JSON.stringify({
        slug: print.slug,
        orientation: currentOrientation,
        colors,
        titleBlock,
        detail,
      }));
    } catch {}

    const params = new URLSearchParams(searchParams.toString());
    params.delete('style');
    params.set('o', currentOrientation);
    router.push(`/size?${params.toString()}`);
  }

  const previewWidth = currentOrientation === 'landscape'
    ? 'min(780px, 91vw)'
    : currentOrientation === 'square'
      ? 'min(620px, 91vw)'
      : 'min(520px, 91vw)';

  return (
    <div className="studio-topography min-h-screen bg-[#14201d] text-[#14201d]">
      <StudioHeader step={1} backHref="/" backLabel="New city" context={print.name} />

      <div className="mx-auto flex max-w-[1520px] flex-col gap-7 px-4 py-5 md:px-8 lg:px-10 lg:py-8 min-[1260px]:flex-row min-[1260px]:items-start min-[1260px]:gap-10">
        <main className="relative flex min-h-[calc(100vh-135px)] flex-1 flex-col items-center justify-center rounded-sm border border-white/10 bg-white/[0.035] px-3 py-14 lg:px-8 min-[1260px]:sticky min-[1260px]:top-5">
          <div className="absolute left-5 top-5 flex items-center gap-3 text-[8px] uppercase tracking-[0.22em] text-white/40">
            <span>Live print</span>
            <span className="h-px w-6 bg-[#c66b4e]" />
            <span>{framingLabel} · {detail.roads === 'more' ? 'More streets' : 'Main roads'}</span>
          </div>
          <div className="absolute right-5 top-5 hidden text-right text-[8px] uppercase leading-4 tracking-[0.18em] text-white/28 sm:block">
            {scene.viewport.center[1].toFixed(4)}° N<br />{Math.abs(scene.viewport.center[0]).toFixed(4)}° W
          </div>

          <div
            className="relative overflow-hidden bg-white ring-1 ring-black/10 shadow-[0_35px_90px_rgba(0,0,0,0.48)]"
            style={{
              width: previewWidth,
              height: `calc(${previewWidth} * ${printRatio.toFixed(4)})`,
            }}
          >
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`${print.name} detailed city map print`}
                className="absolute inset-0 h-full w-full object-fill"
                style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
              />
            )}
            {!previewUrl && <div className="absolute inset-0 bg-[#f7f4eb]" />}

            <div
              className="absolute inset-0 z-20 touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
              aria-label="Drag map to adjust print area"
            />

            {loading && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/72 backdrop-blur-[1px]" aria-live="polite">
                <div className="text-center">
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[#173f35]/20 border-t-[#173f35]" />
                  <div className="mt-4 text-[9px] uppercase tracking-[0.18em] text-[#173f35]/65">Drawing your city</div>
                </div>
              </div>
            )}

            {renderError && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#f7f4eb] px-8 text-center">
                <div>
                  <p className="text-sm text-[#68726c]">{renderError}</p>
                  <button onClick={() => setRenderAttempt((attempt) => attempt + 1)} className="mt-4 border border-[#173f35] px-4 py-2 text-[9px] uppercase tracking-[0.15em]">Try again</button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <MapButton label="Zoom out" onClick={() => moveViewport('zoom-out')}>−</MapButton>
            <MapButton label="Zoom in" onClick={() => moveViewport('zoom-in')}>+</MapButton>
            <MapButton label="Reset to recommended downtown view" onClick={() => moveViewport('reset')}>Reset</MapButton>
          </div>
          <p className="mt-3 text-center text-[8px] uppercase tracking-[0.17em] text-white/42">
            Pick a view, then drag or zoom to fine-tune it
          </p>
        </main>

        <aside className="studio-panel w-full p-5 sm:p-7 min-[1260px]:w-[420px] min-[1260px]:flex-none">
          <div className="studio-kicker">Your city map</div>
          <h1 className="mt-4 font-display text-[46px] font-light leading-[0.9] tracking-[-0.03em]">{print.name}</h1>
          {print.defaultSubtitle && <p className="mt-3 text-[11px] leading-5 text-[#77817b]">{print.defaultSubtitle}</p>}
          <p className="mt-4 border-l-2 border-[#c66b4e] pl-3 text-[10px] leading-5 text-[#68726c]">
            Start with a balanced city view, then go wider or move closer with one click.
          </p>

          <div className="mt-7 flex flex-col gap-6">
            <PanelSection title="Map Area">
              <div className="grid grid-cols-2 gap-2">
                {CITY_FRAMES.map((frame) => (
                  <ChoiceCard
                    key={frame.id}
                    active={scene.framing === frame.id}
                    title={frame.title}
                    description={frame.description}
                    onClick={() => setFraming(frame.id)}
                  />
                ))}
              </div>
              {scene.framing === 'custom' && (
                <p className="mt-3 text-[9px] leading-4 text-[#68726c]">Custom view. Choose a preset above to recenter the map.</p>
              )}
            </PanelSection>

            <PanelSection title="Street Detail">
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  active={detail.roads !== 'more'}
                  title="Main roads"
                  description="A cleaner, quieter map"
                  onClick={() => setStreetDetail('main')}
                />
                <ChoiceCard
                  active={detail.roads === 'more'}
                  title="More streets"
                  description="A denser road network"
                  onClick={() => setStreetDetail('all')}
                />
              </div>
              <p className="mt-3 text-[9px] leading-4 text-[#999]">Buildings, airports, rail lines, arrows, and points of interest are always removed.</p>
            </PanelSection>

            <PanelSection title="Labels & Water">
              <div className="divide-y divide-[#e0ddd4] border-y border-[#e0ddd4]">
                <ToggleRow label="Street names" active={detail.labels.roads} onClick={() => toggleLabel('roads')} />
                <ToggleRow label="Lake names" active={detail.labels.water} onClick={() => toggleLabel('water')} />
                <ToggleRow label="Rivers" active={detail.rivers} onClick={() => setDetail((current) => ({ ...current, rivers: !current.rivers }))} />
                <ToggleRow label="River names" active={detail.labels.rivers} onClick={() => toggleLabel('rivers')} />
              </div>
            </PanelSection>

            <PanelSection title="Color">
              <div className="grid grid-cols-2 gap-2">
                {COLOR_SCHEMES.filter((scheme) => scheme.value !== 'map-default').map((scheme) => (
                  <button
                    key={scheme.value}
                    type="button"
                    onClick={() => setColors(scheme.colors)}
                    className={`flex items-center gap-3 border p-2.5 text-left transition-colors ${activePalette === scheme.value ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                  >
                    <ColorSwatch colors={scheme.colors} />
                    <span className="text-[9px] uppercase tracking-[0.13em]">{scheme.label}</span>
                  </button>
                ))}
              </div>
              <details className="mt-3 border-t border-[#e0ddd4] pt-3">
                <summary className="cursor-pointer text-[9px] uppercase tracking-[0.14em] text-[#68726c]">Choose custom colors</summary>
                <div className="mt-3 grid gap-2">
                  <ColorField label="Land" value={colors.land} onChange={(value) => setColor('land', value)} />
                  <ColorField label="Water" value={colors.water} onChange={(value) => setColor('water', value)} />
                  <ColorField label="Streets" value={colors.roads} onChange={(value) => setColor('roads', value)} />
                </div>
              </details>
            </PanelSection>

            <PanelSection title="Title">
              <ToggleRow
                label="Add a title to the print"
                active={titleBlock.enabled}
                onClick={() => setTitle((current) => ({ ...current, enabled: !current.enabled }))}
              />
              {titleBlock.enabled && (
                <div className="mt-3 grid gap-2">
                  <TextField label="Title" value={titleBlock.title} onChange={(title) => setTitle((current) => ({ ...current, title }))} />
                  <TextField label="Subtitle" value={titleBlock.subtitle} onChange={(subtitle) => setTitle((current) => ({ ...current, subtitle }))} />
                  <TextField label="Small line" value={titleBlock.detail} onChange={(titleDetail) => setTitle((current) => ({ ...current, detail: titleDetail }))} />
                </div>
              )}
            </PanelSection>

            <PanelSection title="Shape">
              <div className="grid grid-cols-3 gap-2">
                {(['portrait', 'landscape', 'square'] as Orientation[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateScene((current) => ({ ...current, orientation: option }))}
                    className={`flex min-h-[76px] flex-col items-center justify-center border px-2 py-3 transition-colors ${currentOrientation === option ? 'border-[#173f35] bg-[#eef1ed]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                  >
                    <span className={`mb-2 block border border-current ${option === 'portrait' ? 'h-7 w-[18px]' : option === 'landscape' ? 'h-[18px] w-7' : 'h-6 w-6'}`} />
                    <span className="text-[8px] uppercase tracking-[0.12em]">{option}</span>
                  </button>
                ))}
              </div>
            </PanelSection>

            <div className="border-t border-[#14201d]/15 pt-5">
              <button
                type="button"
                onClick={handleNext}
                disabled={!canContinue}
                className="w-full bg-[#173f35] py-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {canContinue ? 'Choose Print & Frame →' : 'Drawing Your Map…'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!boundaryReady || downloading}
                className="mt-2 w-full border border-[#c9cec8] py-3 text-[9px] uppercase tracking-[0.15em] text-[#68726c] hover:border-[#173f35] hover:text-[#173f35] disabled:opacity-40"
              >
                {downloading ? 'Generating Artwork…' : 'Download Artwork'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="min-w-10 border border-white/15 bg-white/[0.06] px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/70 hover:border-white/40 hover:bg-white/[0.12] hover:text-white"
    >
      {children}
    </button>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="studio-control-section">
      <h2 className="studio-control-title">{title}</h2>
      {children}
    </section>
  );
}

function ChoiceCard({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[92px] border p-3 text-left transition-colors ${active ? 'border-[#173f35] bg-[#173f35] text-white' : 'border-[#d8d9d3] bg-white text-[#14201d] hover:border-[#849587]'}`}
    >
      <span className="block text-[10px] uppercase tracking-[0.13em]">{title}</span>
      <span className="mt-2 block text-[9px] leading-4 opacity-60">{description}</span>
    </button>
  );
}

function ToggleRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="flex w-full items-center justify-between gap-4 py-3 text-left">
      <span className="text-[10px] text-[#44504b]">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${active ? 'bg-[#173f35]' : 'bg-[#d4d7d2]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${active ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function ColorSwatch({ colors }: { colors: PreviewColorSettings }) {
  return (
    <span className="relative block h-8 w-8 flex-none overflow-hidden rounded-full border border-[#14201d]/15" style={{ backgroundColor: colors.land }}>
      <span className="absolute bottom-0 left-0 h-1/2 w-full" style={{ backgroundColor: colors.water }} />
      <span className="absolute left-1/2 top-0 h-full w-px rotate-45" style={{ backgroundColor: colors.roads }} />
    </span>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between border border-[#d8d9d3] bg-white px-3 py-2">
      <span>
        <span className="block text-[10px] text-[#44504b]">{label}</span>
        <span className="block font-mono text-[9px] uppercase text-[#999]">{value}</span>
      </span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-11 cursor-pointer border border-[#d8d9d3] bg-white p-0.5" />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[82px_1fr] items-center border border-[#d8d9d3] bg-white">
      <span className="px-3 text-[8px] uppercase tracking-[0.14em] text-[#77817b]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 border-l border-[#d8d9d3] bg-transparent px-3 py-2.5 text-[11px] outline-none focus:bg-[#eef1ed]"
      />
    </label>
  );
}
