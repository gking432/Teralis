'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import type { CatalogPrint } from '@/lib/catalog/prints';
import {
  COLOR_SCHEMES,
  getPrintInkColor,
  sameColorSettings,
  type PreviewColorSettings,
} from '@/lib/print/colorSchemes';
import {
  TITLE_LAYOUTS,
  type PreviewTitleLayout,
  type TitleBlockSettings,
} from '@/lib/print/titleLayouts';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import {
  bakeTitleBlock,
  colorCacheKey,
  getPreviewCacheKey,
  ORIENTATION_RATIO,
  PREVIEW_SNAPSHOT_CACHE,
  renderPrintSnapshot,
  type Orientation,
} from '@/lib/print/printSnapshot';
import { SESSION_CUSTOMIZATION_KEY, SESSION_PREVIEW_KEY } from '@/lib/print/sizeCatalog';
import type { BorderWeight, Density, PrintDetailSettings } from '@/lib/print/printRender';
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

const STREET_LEVELS: Array<{ value: Density; title: string; description: string }> = [
  { value: 'less', title: 'Less', description: 'Major routes' },
  { value: 'neutral', title: 'Balanced', description: 'Main streets' },
  { value: 'more', title: 'More', description: 'Full road network' },
];

const BORDER_LEVELS: Array<{ value: BorderWeight; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Medium' },
  { value: 'thick', label: 'Wide' },
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
      border: 'thin',
      rivers: true,
      counties: false,
      states: false,
      labels: {
        cities: false,
        towns: false,
        roads: true,
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
  const [finishing, setFinishing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cropDragRef = useRef<{ x: number; y: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

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
  const streetLevelLabel = STREET_LEVELS.find((level) => level.value === detail.roads)?.title ?? 'Custom';
  const isFreeformTitle = titleBlock.enabled && titleBlock.layout === 'freeform';
  const titleCacheTag = isFreeformTitle
    ? 'freeform-map'
    : `${titleBlock.enabled ? 'title' : 'map'}:${titleBlock.title}:${titleBlock.subtitle}:${titleBlock.detail}:${titleBlock.layout}:${titleBlock.style}`;
  const previewLayoutKey = `screen1200:${sceneCacheTag(scene)}:${titleCacheTag}`;

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

  function setStreetDetail(value: Density) {
    setDetail((current) => ({ ...current, roads: value }));
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

  async function composeFreeformTitle(mapUrl: string, width: number): Promise<string> {
    if (!isFreeformTitle) return mapUrl;

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = mapUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * printRatio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare title artwork');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    await document.fonts.ready;
    bakeTitleBlock(context, titleBlock, colors, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  async function handleDownload() {
    if (!boundaryReady || downloading) return;
    setDownloading(true);
    try {
      const mapUrl = await renderPrintSnapshot(
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
      const url = await composeFreeformTitle(mapUrl, 3600);
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

  async function handleNext() {
    if (!previewUrl || finishing) return;
    setFinishing(true);
    try {
      const exactPreview = await composeFreeformTitle(previewUrl, 1200);
      sessionStorage.setItem(SESSION_PREVIEW_KEY, exactPreview);
      storeScene(scene);
      sessionStorage.setItem(SESSION_CUSTOMIZATION_KEY, JSON.stringify({
        slug: print.slug,
        orientation: currentOrientation,
        colors,
        titleBlock,
        detail,
      }));

      const params = new URLSearchParams(searchParams.toString());
      params.delete('style');
      params.set('o', currentOrientation);
      router.push(`/size?${params.toString()}`);
    } catch (error) {
      console.warn('Unable to prepare exact print preview', error);
      setFinishing(false);
    }
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
            <span>{framingLabel} · {streetLevelLabel} streets</span>
          </div>
          <div className="absolute right-5 top-5 hidden text-right text-[8px] uppercase leading-4 tracking-[0.18em] text-white/28 sm:block">
            {scene.viewport.center[1].toFixed(4)}° N<br />{Math.abs(scene.viewport.center[0]).toFixed(4)}° W
          </div>

          <div
            ref={previewContainerRef}
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

            {isFreeformTitle && (
              <DraggableTitle
                block={titleBlock}
                onChange={setTitle}
                containerRef={previewContainerRef}
                colors={colors}
              />
            )}

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
              <div className="grid grid-cols-3 gap-2">
                {STREET_LEVELS.map((level) => (
                  <CompactChoice
                    key={level.value}
                    active={detail.roads === level.value}
                    title={level.title}
                    description={level.description}
                    onClick={() => setStreetDetail(level.value)}
                  />
                ))}
              </div>
              <p className="mt-3 text-[9px] leading-4 text-[#999]">More restores the full residential network. Buildings, airports, rail lines, arrows, and points of interest stay removed.</p>
            </PanelSection>

            <PanelSection title="Labels">
              <div className="divide-y divide-[#e0ddd4] border-y border-[#e0ddd4]">
                <ToggleRow label="Street names" active={detail.labels.roads} onClick={() => toggleLabel('roads')} />
                <ToggleRow label="Lake names" active={detail.labels.water} onClick={() => toggleLabel('water')} />
                <ToggleRow label="Rivers" active={detail.rivers} onClick={() => setDetail((current) => ({ ...current, rivers: !current.rivers }))} />
                <ToggleRow label="River names" active={detail.labels.rivers} onClick={() => toggleLabel('rivers')} />
              </div>
            </PanelSection>

            <PanelSection title="Print Border">
              <SegmentedControl
                options={BORDER_LEVELS}
                value={detail.border}
                onChange={(border) => setDetail((current) => ({ ...current, border }))}
              />
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
                <>
                  <div className="mt-3 grid gap-2">
                    <TextField label="Title" value={titleBlock.title} onChange={(title) => setTitle((current) => ({ ...current, title }))} />
                    <TextField label="Subtitle" value={titleBlock.subtitle} onChange={(subtitle) => setTitle((current) => ({ ...current, subtitle }))} />
                    <TextField label="Small line" value={titleBlock.detail} onChange={(titleDetail) => setTitle((current) => ({ ...current, detail: titleDetail }))} />
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-[8px] uppercase tracking-[0.16em] text-[#77817b]">Title location</div>
                    <div className="grid grid-cols-2 gap-2">
                      {TITLE_LAYOUTS.map((layout) => (
                        <TitleLayoutChoice
                          key={layout.value}
                          layout={layout.value}
                          label={layout.label}
                          description={layout.desc}
                          active={titleBlock.layout === layout.value}
                          onClick={() => setTitle((current) => ({ ...current, layout: layout.value }))}
                        />
                      ))}
                    </div>
                  </div>
                  {isFreeformTitle && (
                    <p className="mt-3 border-l-2 border-[#c66b4e] pl-3 text-[9px] leading-4 text-[#68726c]">
                      Drag the title on the artwork. Use the corner handles to resize it and the round handle to rotate it.
                    </p>
                  )}
                </>
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
                disabled={!canContinue || finishing}
                className="w-full bg-[#173f35] py-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {finishing ? 'Preparing Exact Preview…' : canContinue ? 'Choose Print & Frame →' : 'Drawing Your Map…'}
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

function CompactChoice({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[76px] border px-2 py-3 text-center transition-colors ${active ? 'border-[#173f35] bg-[#173f35] text-white' : 'border-[#d8d9d3] bg-white text-[#14201d] hover:border-[#849587]'}`}
    >
      <span className="block text-[9px] uppercase tracking-[0.12em]">{title}</span>
      <span className="mt-1.5 block text-[8px] leading-3 opacity-60">{description}</span>
    </button>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid overflow-hidden border border-[#d8d9d3]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-3 text-[8px] uppercase tracking-[0.11em] transition-colors ${index ? 'border-l border-[#d8d9d3]' : ''} ${value === option.value ? 'bg-[#173f35] text-white' : 'bg-white text-[#68726c] hover:bg-[#eef1ed]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TitleLayoutChoice({
  layout,
  label,
  description,
  active,
  onClick,
}: {
  layout: PreviewTitleLayout;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[84px] items-center gap-3 border p-2.5 text-left transition-colors ${active ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
    >
      <TitleLayoutIcon layout={layout} />
      <span className="min-w-0">
        <span className="block text-[8px] uppercase tracking-[0.1em] text-[#26332f]">{label}</span>
        <span className="mt-1 block text-[8px] leading-3 text-[#8a918d]">{description}</span>
      </span>
    </button>
  );
}

function TitleLayoutIcon({ layout }: { layout: PreviewTitleLayout }) {
  return (
    <span className="relative block h-12 w-9 flex-none overflow-hidden border border-[#bfc5bf] bg-[#f8f6ef]">
      <span className="absolute inset-1 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(20,32,29,0.13)_3px,rgba(20,32,29,0.13)_4px)]" />
      {layout === 'classic-bottom' && <span className="absolute inset-x-0 bottom-0 h-3.5 border-t border-[#173f35] bg-white" />}
      {layout === 'compact-bottom' && <span className="absolute inset-x-1 bottom-1 h-2 border-t border-[#173f35] bg-white" />}
      {layout === 'top-left' && <span className="absolute left-1 top-1 h-2.5 w-5 border-l-2 border-[#173f35] bg-white" />}
      {layout === 'side-rail' && <span className="absolute bottom-1 left-1 top-1 w-2 border-r border-[#173f35] bg-white" />}
      {layout === 'minimal-corner' && <span className="absolute bottom-1 right-1 h-2 w-4 border-t border-[#173f35] bg-white" />}
      {layout === 'freeform' && <span className="absolute left-2 top-4 h-2.5 w-5 border border-dashed border-[#c66b4e] bg-white" />}
    </span>
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

function useFitText(dependencies: unknown[]): {
  textRef: RefObject<HTMLDivElement>;
  scaleStyle: CSSProperties;
} {
  const textRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const element = textRef.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;

    function measure() {
      if (!element || !parent) return;
      const next = element.scrollWidth > parent.clientWidth && element.scrollWidth > 0
        ? parent.clientWidth / element.scrollWidth
        : 1;
      setScale((current) => Math.abs(current - next) > 0.001 ? next : current);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return {
    textRef,
    scaleStyle: { transform: `scale(${scale})`, transformOrigin: 'center' },
  };
}

type TitleDragHandle = 'body' | 'tl' | 'tr' | 'bl' | 'br' | 'rotate';

function DraggableTitle({
  block,
  onChange,
  containerRef,
  colors,
}: {
  block: TitleBlockSettings;
  onChange: (block: TitleBlockSettings) => void;
  containerRef: RefObject<HTMLDivElement>;
  colors: PreviewColorSettings;
}) {
  const [selected, setSelected] = useState(true);
  const titleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: TitleDragHandle;
    startX: number;
    startY: number;
    original: TitleBlockSettings;
  } | null>(null);

  useEffect(() => {
    function deselect(event: MouseEvent) {
      if (titleRef.current && !titleRef.current.contains(event.target as Node)) setSelected(false);
    }
    document.addEventListener('mousedown', deselect);
    return () => document.removeEventListener('mousedown', deselect);
  }, []);

  function normalizedPoint(event: MouseEvent | ReactMouseEvent): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function beginBodyDrag(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!selected) {
      setSelected(true);
      return;
    }
    const point = normalizedPoint(event);
    dragRef.current = { handle: 'body', startX: point.x, startY: point.y, original: { ...block } };
  }

  function beginHandleDrag(handle: Exclude<TitleDragHandle, 'body'>, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const point = normalizedPoint(event);
    dragRef.current = { handle, startX: point.x, startY: point.y, original: { ...block } };
  }

  useEffect(() => {
    function move(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const point = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      const original = drag.original;

      if (drag.handle === 'body') {
        onChange({
          ...original,
          x: clamp(original.x + dx, 0, 1 - original.w),
          y: clamp(original.y + dy, 0, 1 - original.h),
        });
        return;
      }

      if (drag.handle === 'rotate') {
        const centerX = original.x + original.w / 2;
        const centerY = original.y + original.h / 2;
        const startAngle = Math.atan2(drag.startY - centerY, drag.startX - centerX);
        const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
        onChange({ ...original, rotation: original.rotation + (currentAngle - startAngle) * (180 / Math.PI) });
        return;
      }

      const ratio = original.w / original.h;
      const scale = drag.handle === 'br'
        ? 1 + (dx / original.w + dy / original.h) / 2
        : drag.handle === 'tl'
          ? 1 + (-dx / original.w - dy / original.h) / 2
          : drag.handle === 'tr'
            ? 1 + (dx / original.w - dy / original.h) / 2
            : 1 + (-dx / original.w + dy / original.h) / 2;
      const width = clamp(original.w * scale, 0.18, 0.96);
      const height = width / ratio;
      let x = original.x;
      let y = original.y;
      if (drag.handle === 'tl') {
        x = original.x + original.w - width;
        y = original.y + original.h - height;
      } else if (drag.handle === 'tr') {
        y = original.y + original.h - height;
      } else if (drag.handle === 'bl') {
        x = original.x + original.w - width;
      }
      onChange({
        ...original,
        x: clamp(x, 0, 1 - width),
        y: clamp(y, 0, 1 - height),
        w: width,
        h: height,
      });
    }

    function end() {
      dragRef.current = null;
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
  }, [block, containerRef, onChange]);

  const ink = getPrintInkColor(colors);
  const land = colors.land || '#ffffff';
  const translucent = block.style === 'translucent';
  const glassColor = block.glassFill === 'ink' ? ink : land;
  const background = block.style === 'inverted' ? ink : land;
  const textColor = translucent
    ? block.glassFill === 'ink' ? land : ink
    : block.style === 'inverted' ? land : ink;
  const hasSubtitle = Boolean(block.subtitle.trim());
  const hasDetail = Boolean(block.detail.trim());
  const longTitle = block.title.length > 10;
  const veryLongTitle = block.title.length > 16;
  const titleFit = useFitText([block.title, hasSubtitle, hasDetail, block.w, block.h]);
  const subtitleFit = useFitText([block.subtitle, hasDetail, block.w, block.h]);
  const detailFit = useFitText([block.detail, block.w, block.h]);

  return (
    <div
      ref={titleRef}
      onMouseDown={beginBodyDrag}
      style={{
        position: 'absolute',
        zIndex: 25,
        left: `${block.x * 100}%`,
        top: `${block.y * 100}%`,
        width: `${block.w * 100}%`,
        height: `${block.h * 100}%`,
        transform: `rotate(${block.rotation}deg)`,
        transformOrigin: 'center',
        cursor: selected ? 'move' : 'pointer',
        userSelect: 'none',
        containerType: 'size',
      } as CSSProperties}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: translucent ? glassColor : background, opacity: translucent ? 0.58 : 1 }}
      />
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-[4%]"
        style={{ gap: '4cqh' }}
      >
        <div
          ref={titleFit.textRef}
          style={{
            color: textColor,
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: `${hasSubtitle || hasDetail ? 28 : 36}cqh`,
            fontWeight: 300,
            letterSpacing: veryLongTitle ? '0.1em' : longTitle ? '0.16em' : '0.22em',
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
              color: textColor,
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '14cqh',
              fontWeight: 400,
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
              color: textColor,
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '11cqh',
              fontWeight: 400,
              letterSpacing: '0.14em',
              whiteSpace: 'nowrap',
              ...detailFit.scaleStyle,
            }}
          >
            {block.detail.trim().toUpperCase()}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="pointer-events-none absolute inset-0 border border-dashed border-[#333]/55" />
          {([
            ['tl', { top: -5, left: -5, cursor: 'nw-resize' }],
            ['tr', { top: -5, right: -5, cursor: 'ne-resize' }],
            ['bl', { bottom: -5, left: -5, cursor: 'sw-resize' }],
            ['br', { bottom: -5, right: -5, cursor: 'se-resize' }],
          ] as const).map(([handle, position]) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize title ${handle}`}
              onMouseDown={(event) => beginHandleDrag(handle, event)}
              className="absolute h-2.5 w-2.5 rounded-[2px] border border-[#333] bg-white"
              style={position}
            />
          ))}
          <button
            type="button"
            aria-label="Rotate title"
            onMouseDown={(event) => beginHandleDrag('rotate', event)}
            className="absolute -top-8 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-[#333] bg-white before:absolute before:bottom-full before:left-1/2 before:h-5 before:w-px before:-translate-x-1/2 before:bg-[#333]/45"
          />
        </>
      )}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
