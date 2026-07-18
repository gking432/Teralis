'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  type TitleBlockSettings,
  type TitleStyle,
} from '@/lib/print/titleLayouts';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderPrintSnapshot, PREVIEW_SNAPSHOT_CACHE, getPreviewCacheKey, colorCacheKey, bakeTitleBlock, ORIENTATION_RATIO, type Orientation } from '@/lib/print/printSnapshot';
import { SESSION_PREVIEW_KEY, SESSION_CUSTOMIZATION_KEY } from '@/lib/print/sizeCatalog';
import { type PrintDetailSettings, type Density, type BorderWeight } from '@/lib/print/printRender';
import { COMPOSITION_PRESETS, DETAIL_LEVELS, applyCompositionPreset, getCompositionPreset } from '@/lib/print/presets';
import {
  createPrintScene,
  panViewportByPixels,
  readStoredScene,
  sceneCacheTag,
  storeScene,
  transformViewport,
  type CompositionPresetId,
  type PrintScene,
} from '@/lib/print/scene';

interface PrintCustomizerProps {
  print: CatalogPrint;
  orientation?: Orientation;
}

type StudioTab = 'map' | 'color' | 'type' | 'finish';

const STUDIO_TABS: { value: StudioTab; label: string; number: string }[] = [
  { value: 'map', label: 'Map', number: '01' },
  { value: 'color', label: 'Color', number: '02' },
  { value: 'type', label: 'Type', number: '03' },
  { value: 'finish', label: 'Finish', number: '04' },
];

export function PrintCustomizer({ print, orientation = 'portrait' }: PrintCustomizerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPreset = getCompositionPreset(searchParams.get('style'));
  const [scene, setScene] = useState<PrintScene>(() =>
    applyCompositionPreset(createPrintScene(print, orientation, requestedPreset.id), requestedPreset.id)
  );
  const [activeTab, setActiveTab] = useState<StudioTab>('map');
  const [downloading, setDownloading] = useState(false);
  const [restored, setRestored] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const cropDragRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<PrintScene[]>([]);
  const redoStackRef = useRef<PrintScene[]>([]);

  // Restore the exact scene when returning from finish. Choosing another
  // composition from Step 1 intentionally starts a fresh scene.
  useEffect(() => {
    const stored = readStoredScene(print);
    if (stored && stored.composition === requestedPreset.id) setScene(stored);
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restored) storeScene(scene);
  }, [scene, restored]);

  const colors = scene.colors;
  const titleBlock = scene.title;
  const detail = scene.detail;
  const currentOrientation = scene.orientation;

  function updateScene(updater: (current: PrintScene) => PrintScene) {
    setScene((current) => {
      undoStackRef.current = [...undoStackRef.current.slice(-29), current];
      redoStackRef.current = [];
      return { ...updater(current), updatedAt: Date.now() };
    });
  }

  function undo() {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    setScene((current) => {
      redoStackRef.current.push(current);
      return previous;
    });
  }

  function redo() {
    const next = redoStackRef.current.pop();
    if (!next) return;
    setScene((current) => {
      undoStackRef.current.push(current);
      return next;
    });
  }

  function setColors(next: PreviewColorSettings | ((current: PreviewColorSettings) => PreviewColorSettings)) {
    updateScene((current) => ({
      ...current,
      colors: typeof next === 'function' ? next(current.colors) : next,
    }));
  }

  function setTitleBlock(next: TitleBlockSettings | ((current: TitleBlockSettings) => TitleBlockSettings)) {
    updateScene((current) => ({
      ...current,
      title: typeof next === 'function' ? next(current.title) : next,
    }));
  }

  function setDetail(next: PrintDetailSettings | ((current: PrintDetailSettings) => PrintDetailSettings)) {
    updateScene((current) => ({
      ...current,
      detail: typeof next === 'function' ? next(current.detail) : next,
    }));
  }

  // Start identically on the server and client. Pulling the module cache inside
  // the state initializer caused the status text to differ during hydration.
  const [geometry, setGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const kind = print.kind === 'country' ? 'country' : print.kind === 'state' ? 'state' : 'city';
  const isCountry = kind === 'country';
  const activePreset = COLOR_SCHEMES.find((s) => sameColorSettings(s.colors, colors))?.value ?? 'custom';
  const isFreeform = titleBlock.layout === 'freeform';
  const canContinue = Boolean(previewUrl) && !loading;
  // Print height/width ratio comes from orientation alone. The title footer
  // (if any) is carved out of the canvas — the canvas itself never grows.
  const printRatio = ORIENTATION_RATIO[currentOrientation];
  const originalViewport = { bbox: print.bbox, center: print.center };

  useEffect(() => {
    if (geometry) return;
    const cached = getCachedBoundary(print.slug)?.geometry;
    if (cached) {
      setGeometry(cached);
      return;
    }
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
  const previewLayoutKey = `${sceneCacheTag(scene)}:${isFreeform ? 'freeform' : `${titleBlock.layout}:${titleBlock.style}${glassTag}:${titleBlock.enabled ? 'on' : 'off'}`}:${titleBlock.title}:${titleBlock.subtitle}:${titleBlock.detail}`;

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
      print.slug, scene.viewport.bbox, scene.viewport.center, kind,
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
      currentOrientation,
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
  }, [print.slug, colors, detail, geometry, previewLayoutKey, titleBlock.enabled, currentOrientation]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleDownload() {
    if (!geometry || downloading) return;
    setDownloading(true);
    try {
      const DOWNLOAD_W = 3600;
      const DOWNLOAD_H = Math.round(DOWNLOAD_W * printRatio);
      const mapUrl = await renderPrintSnapshot(
        print.slug, scene.viewport.bbox, scene.viewport.center, kind,
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
        undefined, detail, DOWNLOAD_W, currentOrientation,
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
      a.download = `${print.slug}-map-print-${currentOrientation}.png`;
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
      storeScene(scene);
      sessionStorage.setItem(SESSION_CUSTOMIZATION_KEY, JSON.stringify({ slug: print.slug, orientation: currentOrientation, colors, titleBlock, detail }));
    } catch {}
    const params = new URLSearchParams(searchParams.toString());
    params.set('o', currentOrientation);
    params.set('style', scene.composition);
    router.push(`/size?${params.toString()}`);
  }

  function setColor(channel: 'land' | 'water' | 'roads', value: string) {
    setColors((c) => ({ land: c.land, water: c.water, roads: c.roads, [channel]: value }));
  }

  function chooseComposition(id: CompositionPresetId) {
    updateScene((current) => applyCompositionPreset(current, id));
  }

  function setDetailLevel(value: Density) {
    setDetail((current) => ({
      ...current,
      places: kind === 'city' ? 'none' : value,
      roads: kind === 'state' && value === 'more' ? 'neutral' : value,
    }));
  }

  function toggleLabel(label: keyof PrintDetailSettings['labels']) {
    setDetail((current) => ({
      ...current,
      labels: { ...current.labels, [label]: !current.labels[label] },
    }));
  }

  function moveViewport(operation: Parameters<typeof transformViewport>[1]) {
    updateScene((current) => ({
      ...current,
      viewport: transformViewport(current.viewport, operation, originalViewport),
    }));
  }

  function onCropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { x: event.clientX, y: event.clientY };
    setDragOffset({ x: 0, y: 0 });
  }

  function onCropPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = cropDragRef.current;
    if (!start) return;
    setDragOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
  }

  function onCropPointerUp(event: React.PointerEvent<HTMLDivElement>) {
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
      viewport: panViewportByPixels(current.viewport, dx, dy, rect.width, rect.height),
    }));
  }

  return (
    <div className="studio-topography min-h-screen bg-[#14201d] text-[#14201d]">
      <StudioHeader
        step={2}
        backHref={`/design?${searchParams.toString()}`}
        backLabel="Design"
        context={print.name}
      />

      <div className="mx-auto flex max-w-[1540px] flex-col gap-7 px-4 py-5 md:px-8 lg:px-10 lg:py-8 min-[1320px]:flex-row min-[1320px]:items-start min-[1320px]:gap-10">
        <main className="relative flex min-h-[calc(100vh-135px)] flex-1 flex-col items-center justify-center rounded-sm border border-white/10 bg-white/[0.035] px-3 py-16 lg:px-8 min-[1320px]:sticky min-[1320px]:top-5 min-[1320px]:self-start">
          <div className="absolute left-5 top-5 flex items-center gap-3 text-[8px] uppercase tracking-[0.22em] text-white/40">
            <span>Live artwork</span>
            <span className="h-px w-6 bg-[#c66b4e]" />
            <span>{getCompositionPreset(scene.composition).name}</span>
          </div>
          <div className="absolute right-5 top-5 hidden text-right text-[8px] uppercase leading-4 tracking-[0.18em] text-white/30 sm:block">
            {scene.viewport.center[1].toFixed(3)}° N<br />{Math.abs(scene.viewport.center[0]).toFixed(3)}° W
          </div>
          <div
            ref={previewContainerRef}
            className="relative overflow-hidden bg-white ring-1 ring-black/10 shadow-[0_35px_90px_rgba(0,0,0,0.48)]"
            style={{
              width: currentOrientation === 'landscape' ? 'min(760px, 90vw)' : currentOrientation === 'square' ? 'min(610px, 90vw)' : 'min(520px, 90vw)',
              height: currentOrientation === 'landscape'
                ? `calc(min(760px, 90vw) * ${printRatio.toFixed(4)})`
                : currentOrientation === 'square'
                  ? `calc(min(610px, 90vw) * ${printRatio.toFixed(4)})`
                  : `calc(min(520px, 90vw) * ${printRatio.toFixed(4)})`,
            }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt={`${print.name} customizable map print`}
                className="absolute inset-0 h-full w-full object-fill"
                style={{
                  transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                  transition: cropDragRef.current ? 'none' : 'transform 180ms ease-out',
                }}
              />
            )}
            {!previewUrl && <div className="absolute inset-0 bg-[#07122a]/8" />}
            {loading && previewUrl && (
              <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/25" />
            )}
            {loading && !previewUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#07122a]/20 border-t-[#07122a]" />
                <div className="mt-5 text-[10px] uppercase tracking-[1.6px] text-[#07122a]/70">
                  Rendering your print preview
                </div>
                <p className="mt-2 max-w-[260px] text-xs leading-5 text-[#07122a]/45">
                  We are drawing the streets, water, border, and title exactly as they will appear in the demo artwork.
                </p>
              </div>
            )}
            {activeTab === 'map' && (
              <div
                className="absolute inset-0 z-20 touch-none cursor-grab active:cursor-grabbing"
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                onPointerCancel={onCropPointerUp}
                aria-label="Drag artwork to adjust crop"
              >
                <div className="pointer-events-none absolute inset-3 border border-dashed border-white/65 shadow-[0_0_0_999px_rgba(20,32,29,0.07)]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2">
                  <span className="absolute left-1/2 top-0 h-full w-px bg-white/70" />
                  <span className="absolute left-0 top-1/2 h-px w-full bg-white/70" />
                </div>
              </div>
            )}
            {activeTab === 'type' && isFreeform && titleBlock.enabled && (
              <DraggableTitle
                block={titleBlock}
                onChange={setTitleBlock}
                containerRef={previewContainerRef}
                colors={colors}
              />
            )}
          </div>
          {activeTab === 'map' && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <CropButton label="Zoom out" onClick={() => moveViewport('zoom-out')}>−</CropButton>
              <CropButton label="Zoom in" onClick={() => moveViewport('zoom-in')}>+</CropButton>
              <CropButton label="Undo" onClick={undo}>Undo</CropButton>
              <CropButton label="Redo" onClick={redo}>Redo</CropButton>
              <CropButton label="Reset crop" onClick={() => moveViewport('reset')}>Reset crop</CropButton>
            </div>
          )}
          <p className="mt-4 text-center text-[9px] uppercase tracking-[0.17em] text-white/55">
            {!geometry ? 'Finding map boundary…' : loading ? 'Loading preview…' : activeTab === 'map' ? 'Drag the artwork to crop · use − / + to zoom' : isFreeform && activeTab === 'type' ? 'Drag the title directly on the artwork' : 'Every change updates the artwork live'}
          </p>
          <p className="mt-1 text-center text-[8px] uppercase tracking-[0.16em] text-white/25">
            {currentOrientation} · print ratio {(1 / printRatio).toFixed(2)} : 1.00
          </p>
        </main>

        <aside className="studio-panel w-full overflow-hidden min-[1320px]:w-[440px] min-[1320px]:flex-none">
          <div className="px-5 pb-5 pt-6 sm:px-7">
          <div className="studio-kicker">
            {isCountry ? 'National study' : print.kind === 'state' ? 'State study' : 'City study'}
          </div>
          <h1 className="mt-3 font-display text-[42px] font-light leading-[0.95] tracking-[-0.025em]">Build your {print.name} print</h1>
          <div className="mt-3 flex items-center gap-3 text-[9px] uppercase tracking-[0.18em] text-[#77817b]">
            <span>{getCompositionPreset(scene.composition).name}</span>
            <span className="h-1 w-1 rounded-full bg-[#c66b4e]" />
            <span>{currentOrientation}</span>
          </div>
          </div>

          <div className="grid grid-cols-4 border-y border-[#d8d9d3] bg-[#f4f2eb]">
            {STUDIO_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                aria-current={activeTab === tab.value ? 'step' : undefined}
                className={`border-r border-[#d8d9d3] px-2 py-3 text-left last:border-r-0 ${activeTab === tab.value ? 'bg-[#173f35] text-white' : 'text-[#68726c] hover:bg-white'}`}
              >
                <span className="block text-[7px] tracking-[0.18em] opacity-55">{tab.number}</span>
                <span className="mt-1 block text-[9px] uppercase tracking-[0.14em]">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7">
            {activeTab === 'map' && (
              <>
                <Section title="Composition">
                  <div className="grid grid-cols-2 gap-2">
                    {COMPOSITION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => chooseComposition(preset.id)}
                        className={`min-h-[86px] border p-3 text-left transition-all ${scene.composition === preset.id ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                      >
                        <span className="block text-[10px] font-medium uppercase tracking-[0.13em]">{preset.shortName}</span>
                        <span className="mt-1.5 block text-[9px] leading-4 text-[#8a918d]">{preset.description}</span>
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title="Map Detail">
                  <div className="grid grid-cols-2 gap-2">
                    {DETAIL_LEVELS.map((level) => {
                      const currentLevel = kind === 'city' ? detail.roads : detail.places;
                      return (
                        <button
                          key={level.value}
                          onClick={() => setDetailLevel(level.value)}
                          className={`border px-3 py-2.5 text-left ${currentLevel === level.value ? 'border-[#173f35] bg-[#173f35] text-white' : 'border-[#d8d9d3] bg-white text-[#59645e] hover:border-[#849587]'}`}
                        >
                          <span className="block text-[9px] uppercase tracking-[0.13em]">{level.label}</span>
                          <span className="mt-1 block text-[8px] opacity-60">{level.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Map Features">
                  <p className="mb-3 text-[10px] leading-4 text-[#8a918d]">Map features stay visible. Turn their printed names on only when they help the composition.</p>
                  <div className="flex flex-wrap gap-2">
                    {kind !== 'city' && <ToggleChip label="City names" active={detail.labels.cities} onClick={() => toggleLabel('cities')} />}
                    {kind !== 'city' && <ToggleChip label="Town names" active={detail.labels.towns} onClick={() => toggleLabel('towns')} />}
                    <ToggleChip label="Street names" active={detail.labels.roads} onClick={() => toggleLabel('roads')} />
                    <ToggleChip label="Lake names" active={detail.labels.water} onClick={() => toggleLabel('water')} />
                    <ToggleChip label="River names" active={detail.labels.rivers} onClick={() => toggleLabel('rivers')} />
                    <ToggleChip label="Rivers" active={detail.rivers} onClick={() => setDetail((d) => ({ ...d, rivers: !d.rivers }))} />
                    {kind === 'state' && <ToggleChip label="County lines" active={detail.counties} onClick={() => setDetail((d) => ({ ...d, counties: !d.counties }))} />}
                    {kind === 'country' && <ToggleChip label="State lines" active={detail.states} onClick={() => setDetail((d) => ({ ...d, states: !d.states }))} />}
                  </div>
                  {kind === 'city' && (
                    <details className="mt-4 border-t border-[#e0ddd4] pt-3">
                      <summary className="cursor-pointer text-[9px] uppercase tracking-[0.14em] text-[#68726c]">Advanced details</summary>
                      <div className="mt-4">
                        <SegRow<BorderWeight>
                          label="City boundary"
                          options={[
                            { value: 'none', label: 'None' },
                            { value: 'thin', label: 'Thin' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'thick', label: 'Bold' },
                          ]}
                          value={detail.border}
                          onChange={(border) => setDetail((d) => ({ ...d, border }))}
                        />
                      </div>
                    </details>
                  )}
                </Section>
              </>
            )}

            {activeTab === 'color' && (
              <>
                <Section title="Palette">
                  <p className="mb-4 text-[10px] leading-4 text-[#8a918d]">Start with a studio palette, then tune any surface independently.</p>
              <div className="grid grid-cols-3 gap-2">
                {COLOR_SCHEMES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setColors(s.colors)}
                    className={`flex flex-col items-start gap-2 border p-2.5 text-left transition-all ${
                      activePreset === s.value ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
                    }`}
                  >
                    <ColorSwatch colors={s.colors} />
                    <span className="text-[10px] uppercase tracking-[1.4px] leading-none">{s.label}</span>
                  </button>
                ))}
              </div>
                </Section>
                <Section title="Custom Color">
                  <div className="flex flex-col gap-2">
                    <ColorField label="Land" value={colors.land} onChange={(v) => setColor('land', v)} />
                    <ColorField label="Water" value={colors.water} onChange={(v) => setColor('water', v)} />
                    <ColorField label="Roads & Type" value={colors.roads} onChange={(v) => setColor('roads', v)} />
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-[#999]">{activePreset === 'custom' ? 'Your custom palette is active.' : 'Selecting a custom color creates your own palette.'}</p>
                </Section>
              </>
            )}

            {activeTab === 'type' && (
              <>
                <Section title="Title Treatment">
                  <SegRow
                label="Add a title"
                options={[
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
                value={titleBlock.enabled ? 'on' : 'off'}
                onChange={(v) => setTitleBlock((b) => ({ ...b, enabled: v === 'on' }))}
              />
              {titleBlock.enabled && (
                <div className="mb-5 grid gap-2 border-t border-[#e0ddd4] pt-4">
                  <TextField label="Title" value={titleBlock.title} placeholder={print.defaultTitle} onChange={(title) => setTitleBlock((b) => ({ ...b, title }))} />
                  <TextField label="Subtitle" value={titleBlock.subtitle} placeholder="Optional" onChange={(subtitle) => setTitleBlock((b) => ({ ...b, subtitle }))} />
                  <TextField label="Small line" value={titleBlock.detail} placeholder="Coordinates or established date" onChange={(detailValue) => setTitleBlock((b) => ({ ...b, detail: detailValue }))} />
                </div>
              )}
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
                          ? 'border-[#173f35] bg-[#eef1ed]'
                          : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
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
                            ? 'border-[#173f35] bg-[#eef1ed]'
                            : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
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
                  Drag the title directly on the artwork. Use its handles to resize or rotate it.
                </p>
              )}
                </Section>
              </>
            )}

            {activeTab === 'finish' && (
              <>
                <Section title="Orientation">
                  <div className="grid grid-cols-3 gap-2">
                    {(['portrait', 'landscape', 'square'] as Orientation[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => updateScene((current) => ({ ...current, orientation: option }))}
                        className={`flex min-h-[86px] flex-col items-center justify-center border px-2 py-3 ${currentOrientation === option ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                      >
                        <span className={`mb-3 block border border-current ${option === 'portrait' ? 'h-8 w-5' : option === 'landscape' ? 'h-5 w-8' : 'h-7 w-7'}`} />
                        <span className="text-[8px] uppercase tracking-[0.13em]">{option}</span>
                      </button>
                    ))}
                  </div>
                </Section>
                <Section title="Artwork Summary">
                  <dl className="divide-y divide-[#e0ddd4] border-y border-[#e0ddd4] text-[10px]">
                    <SummaryRow label="Place" value={print.name} />
                    <SummaryRow label="Composition" value={getCompositionPreset(scene.composition).name} />
                    <SummaryRow label="Detail" value={DETAIL_LEVELS.find((item) => item.value === (kind === 'city' ? detail.roads : detail.places))?.label ?? 'Custom'} />
                    <SummaryRow label="Title" value={titleBlock.enabled ? titleBlock.title || 'Untitled' : 'None'} />
                  </dl>
                  <p className="mt-3 text-[10px] leading-4 text-[#8a918d]">The next step places this exact artwork into real print proportions and frame mockups.</p>
                </Section>
              </>
            )}

            <div className="flex flex-col gap-3 border-t border-[#ddd6c8] pt-5">
              {activeTab !== 'finish' ? (
                <button
                  onClick={() => setActiveTab(activeTab === 'map' ? 'color' : activeTab === 'color' ? 'type' : 'finish')}
                  className="w-full bg-[#173f35] py-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:bg-[#c66b4e]"
                >
                  Next: {activeTab === 'map' ? 'Color' : activeTab === 'color' ? 'Type' : 'Finish'} →
                </button>
              ) : (
              <button
                onClick={handleNext}
                disabled={!canContinue}
                className="w-full bg-[#173f35] py-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:bg-[#c66b4e] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {canContinue ? 'Choose Size & Frame →' : 'Loading Preview…'}
              </button>
              )}
              {!canContinue && (
                <p className="text-center text-[10px] leading-5 text-[#999]">
                  Size and frame unlock as soon as the artwork is ready.
                </p>
              )}
              <button
                onClick={handleDownload}
                disabled={!geometry || downloading}
                className="flex w-full items-center justify-center gap-2 border border-[#c9cec8] py-3.5 text-[9px] uppercase tracking-[0.16em] text-[#59645e] transition-colors hover:border-[#173f35] hover:text-[#173f35] disabled:opacity-40"
              >
                {downloading ? (
                  <><div className="h-3 w-3 animate-spin rounded-full border border-[#555] border-t-transparent" /> Generating…</>
                ) : (
                  'Download Demo Artwork'
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CropButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="min-w-10 border border-white/15 bg-white/[0.06] px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/70 transition-colors hover:border-white/40 hover:bg-white/[0.12] hover:text-white"
    >
      {children}
    </button>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`border px-3 py-2 text-[9px] uppercase tracking-[0.12em] transition-all ${active ? 'border-[#173f35] bg-[#173f35] text-white' : 'border-[#d8d9d3] bg-white text-[#68726c] hover:border-[#849587]'}`}
    >
      <span className="mr-1.5">{active ? 'On' : 'Off'}</span>{label}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="uppercase tracking-[0.13em] text-[#8a918d]">{label}</dt>
      <dd className="text-right font-medium text-[#26332f]">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="studio-control-section">
      <div className="studio-control-title">{title}</div>
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
      <div className="flex w-full overflow-hidden rounded-sm border border-[#d8d9d3]">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2.5 text-[9px] uppercase tracking-[0.13em] transition-all ${i > 0 ? 'border-l border-[#d8d9d3]' : ''} ${
              value === opt.value ? 'bg-[#173f35] text-white' : 'bg-white text-[#66706a] hover:bg-[#eef1ed]'
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
    <label className="flex items-center justify-between gap-3 border border-[#d8d9d3] bg-white px-3 py-2.5">
      <span>
        <span className="block text-[11px] text-[#444]">{label}</span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase text-[#aaa]">{value}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer border border-[#d8d9d3] bg-white p-0.5"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[84px_1fr] items-center border border-[#d8d9d3] bg-white">
      <span className="px-3 text-[8px] uppercase tracking-[0.15em] text-[#77817b]">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 border-l border-[#d8d9d3] bg-transparent px-3 py-2.5 text-[11px] text-[#14201d] outline-none placeholder:text-[#a3aaa5] focus:bg-[#eef1ed]"
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
  // Glass: glassColor is the frosted background tint; text always contrasts against it.
  // glassFill='land' → light frosted bg → dark (ink) text
  // glassFill='ink'  → dark frosted bg  → light (land) text
  const textFill = trans
    ? (block.glassFill === 'ink' ? land : ink)
    : (block.style === 'standard' ? ink : land);
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
      {/* Solid background for standard/inverted; frosted-glass tint for translucent */}
      {!trans && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: bgColor }} />
      )}
      {trans && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: glassColor, opacity: 0.55 }} />
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
