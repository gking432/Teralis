'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { getCatalogPrint } from '@/lib/catalog/prints';
import { placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { trackDemoEvent } from '@/lib/demoAnalytics';
import { getLayout } from '@/lib/print/layouts';
import { isValidOrientation, ORIENTATION_RATIO, type Orientation } from '@/lib/print/orientation';
import { getPalette } from '@/lib/print/palettes';
import {
  SIZE_CATALOG,
  SIZE_LABELS,
  FRAME_OPTIONS,
  getSizePrice,
  formatPrice,
  MAT_UPCHARGE,
  SESSION_FINISH_KEY,
  type SizeLabel,
  type FrameOption,
} from '@/lib/print/sizeCatalog';
import {
  normalizeScene,
  readStoredScene,
  storeScene,
  type PrintScene,
} from '@/lib/print/scene';
import { readProof, storeProof } from '@/lib/print/proof';
import { renderScene } from '@/lib/print/renderScene';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';

type FinishStep = 'size' | 'frame' | 'mat' | 'review';

const FINISH_STEPS: Array<{ id: FinishStep; short: string; title: string }> = [
  { id: 'size', short: 'Size', title: 'Choose the scale' },
  { id: 'frame', short: 'Frame', title: 'Choose the finish' },
  { id: 'mat', short: 'Mat', title: 'Choose the spacing' },
  { id: 'review', short: 'Review', title: 'Review your print' },
];

const STUDIO_SCENES = [
  {
    id: 'oak',
    name: 'Soft daylight',
    description: 'Warm oak studio',
    src: '/mockups/studio/scandinavian-oak.webp',
    x: 52,
    y: 39,
  },
  {
    id: 'loft',
    name: 'Gallery loft',
    description: 'Walnut and concrete',
    src: '/mockups/studio/urban-walnut.webp',
    x: 51,
    y: 39,
  },
  {
    id: 'sage',
    name: 'Quiet reading room',
    description: 'Sage and travertine',
    src: '/mockups/studio/sage-travertine.webp',
    x: 50,
    y: 40,
  },
] as const;

export function SizePickerClient() {
  const searchParams = useSearchParams();
  const catalogSlug = searchParams.get('print');
  const catalogPrint = getCatalogPrint(catalogSlug);
  const placePrint = !catalogPrint
    ? placeFromSearchParams(new URLSearchParams(searchParams.toString()))
    : null;
  const print = catalogPrint ?? placePrint;
  const orientationParam = searchParams.get('o');
  const orientation: Orientation = isValidOrientation(orientationParam) ? orientationParam : 'portrait';
  const printRatio = ORIENTATION_RATIO[orientation];

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [size, setSize] = useState<SizeLabel>('medium');
  const [frame, setFrame] = useState<FrameOption>('none');
  const [mat, setMat] = useState(false);
  const [wallScene, setWallScene] = useState(0);
  const [finishStep, setFinishStep] = useState<FinishStep>('size');
  const [furthestStep, setFurthestStep] = useState(0);
  const [printScene, setPrintScene] = useState<PrintScene | null>(null);
  const [proofStatus, setProofStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [proofAttempt, setProofAttempt] = useState(0);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [demoOrder, setDemoOrder] = useState<{ orderId: string; status: string } | null>(null);

  useEffect(() => {
    try {
      const storedScene = readStoredScene(print ?? undefined);
      if (storedScene) {
        setPrintScene(storedScene);
        setPreviewUrl(readProof(storedScene));
        if (SIZE_LABELS.includes(storedScene.size)) setSize(storedScene.size);
      }
      const finishRaw = sessionStorage.getItem(SESSION_FINISH_KEY);
      if (finishRaw) {
        const finish = JSON.parse(finishRaw) as {
          slug?: string;
          size?: SizeLabel;
          frame?: FrameOption;
          mat?: boolean;
        };
        if (finish.slug === print?.slug) {
          if (finish.size && SIZE_LABELS.includes(finish.size)) setSize(finish.size);
          if (finish.frame && FRAME_OPTIONS.some((option) => option.value === finish.frame)) {
            setFrame(finish.frame);
          }
          if (typeof finish.mat === 'boolean') setMat(finish.mat);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print?.slug]);

  useEffect(() => {
    if (!print?.slug) return;
    trackDemoEvent('finish_viewed', { place: print.slug, orientation });
  }, [print?.slug, orientation]);

  useEffect(() => {
    if (!print?.slug) return;
    trackDemoEvent('finish_step_viewed', { step: finishStep, place: print.slug });
  }, [finishStep, print?.slug]);

  useEffect(() => {
    if (!printScene || printScene.size === size) return;
    const resized = normalizeScene({ ...printScene, size, updatedAt: Date.now() });
    setPreviewUrl(null);
    setProofStatus('loading');
    setPrintScene(resized);
    storeScene(resized);
  }, [size, printScene]);

  useEffect(() => {
    if (!printScene || printScene.size !== size) return;
    const cached = readProof(printScene);
    if (cached) {
      setPreviewUrl(cached);
      setProofStatus('ready');
      return;
    }

    const controller = new AbortController();
    setPreviewUrl(null);
    setProofStatus('loading');

    async function generateProof(scene: PrintScene) {
      let geometry: GeoJSON.Geometry | null = null;
      if (scene.place.kind !== 'city') {
        geometry = getCachedBoundary(scene.place.slug)?.geometry ?? null;
        if (!geometry) {
          geometry = (await fetchBoundary(
            scene.place.slug,
            scene.place.center,
            scene.place.kind,
          ))?.geometry ?? null;
        }
      }

      const dataUrl = await renderScene(scene, geometry, { width: 1200, signal: controller.signal });
      if (controller.signal.aborted) return;
      storeProof(scene, dataUrl);
      setPreviewUrl(dataUrl);
      setProofStatus('ready');
    }

    generateProof(printScene).catch((error) => {
      if (controller.signal.aborted) return;
      console.warn('Could not regenerate the print proof', error);
      setProofStatus('error');
    });

    return () => controller.abort();
  }, [printScene, size, proofAttempt]);

  useEffect(() => {
    if (!print) return;
    try {
      sessionStorage.setItem(SESSION_FINISH_KEY, JSON.stringify({ slug: print.slug, size, frame, mat }));
    } catch {}
  }, [print, size, frame, mat]);

  if (!print) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#ece7dd]">
        <p className="text-sm text-[#999]">
          No print selected.{' '}
          <Link href="/" className="underline hover:text-[#111]">Start over</Link>
        </p>
      </div>
    );
  }

  const sizes = SIZE_CATALOG[orientation];
  const selected = sizes[size];
  const activeFrame = FRAME_OPTIONS.find((option) => option.value === frame)!;
  const total = getSizePrice(size, frame, mat);
  const isFramed = frame !== 'none';
  const activeStepIndex = FINISH_STEPS.findIndex((step) => step.id === finishStep);
  const activeStep = FINISH_STEPS[activeStepIndex];
  const palette = printScene ? getPalette(printScene.paletteId) : null;
  const layout = printScene ? getLayout(printScene.layoutId) : null;
  const backParams = new URLSearchParams(searchParams.toString());
  const backUrl = `/customize?${backParams.toString()}`;

  function handleSizeChange(nextSize: SizeLabel) {
    setSize(nextSize);
    trackDemoEvent('finish_size_selected', { size: nextSize, place: print!.slug });
    if (nextSize === size && proofStatus === 'error') {
      setProofAttempt((attempt) => attempt + 1);
    }
  }

  function handleFrameChange(nextFrame: FrameOption) {
    setFrame(nextFrame);
    if (nextFrame === 'none') setMat(false);
    setWallScene(0);
    trackDemoEvent('finish_frame_selected', { frame: nextFrame, place: print!.slug });
  }

  function handleMatChange(nextMat: boolean) {
    setMat(nextMat);
    setWallScene(0);
    trackDemoEvent('finish_mat_selected', { mat: nextMat, place: print!.slug });
  }

  function goToStep(index: number) {
    if (index < 0 || index >= FINISH_STEPS.length || index > furthestStep) return;
    setFinishStep(FINISH_STEPS[index].id);
  }

  function goNext() {
    const nextIndex = Math.min(activeStepIndex + 1, FINISH_STEPS.length - 1);
    setFurthestStep((current) => Math.max(current, nextIndex));
    setFinishStep(FINISH_STEPS[nextIndex].id);
    if (nextIndex === FINISH_STEPS.length - 1) {
      trackDemoEvent('finish_reviewed', { place: print!.slug, size, frame, mat, total });
    }
  }

  function skipCurrentStep() {
    if (finishStep === 'frame') handleFrameChange('none');
    if (finishStep === 'mat') handleMatChange(false);
    goNext();
  }

  async function handleCreateOrder() {
    if (!printScene || printScene.size !== size || proofStatus !== 'ready' || ordering) return;
    setOrdering(true);
    setOrderError(null);
    try {
      const response = await fetch('/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: printScene,
          proof: previewUrl,
          printConfig: {
            size,
            dimensions: selected.dimensionStr,
            frame,
            mat,
            orientation,
            sku: selected.prodigiSku,
            total,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to begin checkout.');
      if (typeof result.checkoutUrl === 'string') {
        trackDemoEvent('checkout_started', { place: print!.slug, size, frame, mat, total });
        window.location.assign(result.checkoutUrl);
        return;
      }
      setDemoOrder({ orderId: result.orderId, status: result.status });
      trackDemoEvent('demo_order_created', { place: print!.slug, size, frame, mat, total });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create the demo order.';
      setOrderError(message);
      trackDemoEvent('demo_order_failed', { place: print!.slug, reason: message });
    } finally {
      setOrdering(false);
    }
  }

  if (print.kind === 'state') {
    return (
      <div className="studio-topography min-h-screen bg-[#14201d] text-[#14201d]">
        <StudioHeader step={2} backHref={backUrl} backLabel="Edit map" context={print.name} />
        <main className="mx-auto grid max-w-[1500px] gap-5 px-3 py-4 sm:px-5 md:gap-8 md:px-8 md:py-7 min-[1120px]:grid-cols-[minmax(0,1fr)_430px] min-[1380px]:px-10">
          <section className={`relative flex min-h-[470px] items-center justify-center overflow-hidden border px-3 py-12 sm:min-h-[650px] sm:px-7 min-[1120px]:sticky min-[1120px]:top-5 min-[1120px]:min-h-[calc(100vh-130px)] ${isFramed ? 'border-white/10 bg-white/[0.035]' : 'border-[#dedbd2] bg-white'}`} aria-label="Exact artwork preview">
            <div className={`absolute left-4 top-4 z-10 text-[8px] uppercase tracking-[0.22em] sm:left-5 sm:top-5 ${isFramed ? 'text-white/50' : 'text-[#69736e]'}`}>
              Exact print proof · {selected.dimensionStr}
            </div>
            {isFramed ? (
              <RoomMockup previewUrl={previewUrl} printName={print.name} orientation={orientation} frame={frame} mat={mat} sceneIndex={wallScene} />
            ) : (
              <FlatProof previewUrl={previewUrl} printName={print.name} printRatio={printRatio} orientation={orientation} />
            )}
            {proofStatus === 'loading' && <div aria-live="polite" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-4 py-2 text-[10px] text-white backdrop-blur">Preparing your exact artwork…</div>}
            {proofStatus === 'error' && <button type="button" onClick={() => setProofAttempt((attempt) => attempt + 1)} className="absolute bottom-4 left-1/2 z-20 min-h-11 -translate-x-1/2 bg-[#391d18] px-4 py-2 text-[10px] text-[#efb4aa] underline underline-offset-2">The proof failed. Try again.</button>}
          </section>

          <aside className="studio-panel self-start min-[1120px]:sticky min-[1120px]:top-5">
            <div className="border-b border-[#14201d]/12 px-6 py-7">
              <div className="studio-kicker">One last choice</div>
              <h1 className="mt-3 font-display text-[42px] font-light leading-none">Finish your {print.name}</h1>
              <p className="mt-3 text-[11px] leading-5 text-[#707a74]">Everything is on one page. The preview updates to show the exact artwork and finish you are ordering.</p>
            </div>

            <div className="space-y-7 px-6 py-6">
              <div>
                <div className="studio-control-title">Size</div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {SIZE_LABELS.map((option) => (
                    <button key={option} type="button" onClick={() => handleSizeChange(option)} aria-pressed={size === option} className={`min-h-[58px] border px-1.5 text-center transition-colors ${size === option ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}>
                      <span className="block text-[8px] font-medium uppercase tracking-[0.1em]">{sizes[option].displayLabel}</span>
                      <span className="mt-1 block text-[8px] text-[#8a918d]">{sizes[option].dimensionStr.replace('"', '')}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="studio-control-title">Finish</div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {FRAME_OPTIONS.map((option) => (
                    <button key={option.value} type="button" onClick={() => handleFrameChange(option.value)} aria-pressed={frame === option.value} className={`min-h-[68px] border p-2 text-center transition-colors ${frame === option.value ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}>
                      <span className="mx-auto block h-6 w-6 border border-black/15" style={option.value === 'none' ? { background: '#fff' } : option.value === 'wood' ? { background: 'linear-gradient(115deg,#6f431f,#a97743,#70431f)' } : { background: option.swatchColor }} />
                      <span className="mt-2 block text-[8px] font-medium uppercase tracking-[0.09em]">{option.label}</span>
                    </button>
                  ))}
                </div>
                {isFramed && (
                  <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-between border border-[#d8d9d3] bg-white px-4 text-[9px] uppercase tracking-[0.12em]">
                    <span>Add snow white mat <span className="text-[#818a85]">+{formatPrice(MAT_UPCHARGE)}</span></span>
                    <input type="checkbox" checked={mat} onChange={(event) => handleMatChange(event.target.checked)} className="h-4 w-4 accent-[#173f35]" />
                  </label>
                )}
              </div>

              <div className="border-y border-[#14201d]/12 py-4">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[#7a847e]"><span>{selected.dimensionStr} · {activeFrame.label}{mat ? ' · matted' : ''}</span><span>Ships ready</span></div>
                <div className="mt-3 flex items-end justify-between"><span className="text-[9px] uppercase tracking-[0.17em] text-[#8a918d]">Total</span><span className="font-display text-5xl font-light">{formatPrice(total)}</span></div>
              </div>

              {demoOrder ? (
                <div className="border border-[#173f35] bg-[#e9eee9] p-5 text-center" aria-live="polite"><div className="text-[8px] uppercase tracking-[0.2em] text-[#c66b4e]">Order-ready demo created</div><div className="mt-2 font-display text-2xl">{demoOrder.orderId}</div><p className="mt-2 text-[10px] leading-5 text-[#68726c]">No payment was collected because fulfillment credentials are not configured.</p></div>
              ) : (
                <>
                  <button type="button" onClick={handleCreateOrder} disabled={!printScene || proofStatus !== 'ready' || ordering} className="min-h-14 w-full bg-[#173f35] px-5 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:cursor-not-allowed disabled:opacity-45">
                    {ordering ? 'Opening secure checkout…' : proofStatus === 'ready' ? 'Continue to secure checkout' : 'Preparing artwork…'}
                  </button>
                  {orderError && <p role="alert" className="text-center text-[10px] leading-5 text-[#a14f3c]">{orderError}</p>}
                  <p className="text-center text-[8px] uppercase tracking-[0.14em] text-[#9aa09b]">Secure payment when commerce is connected</p>
                </>
              )}
              <Link href={backUrl} className="flex min-h-11 items-center justify-center text-[9px] uppercase tracking-[0.15em] text-[#637069] underline underline-offset-4">Keep personalizing</Link>
            </div>
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="studio-topography min-h-screen bg-[#14201d] text-[#14201d]">
      <StudioHeader step={2} backHref={backUrl} backLabel="Edit map" context={print.name} />

      <main className="mx-auto flex max-w-[1500px] flex-col gap-5 px-3 py-4 sm:px-5 md:gap-8 md:px-8 md:py-7 min-[1180px]:flex-row min-[1180px]:items-start min-[1180px]:gap-10 min-[1380px]:px-10">
        <section
          className={`relative flex min-h-[420px] flex-1 flex-col items-center justify-center overflow-hidden border px-3 py-12 sm:min-h-[560px] sm:px-7 min-[1180px]:sticky min-[1180px]:top-5 min-[1180px]:min-h-[calc(100vh-130px)] min-[1180px]:self-start ${
            isFramed ? 'border-white/10 bg-white/[0.035]' : 'border-[#dedbd2] bg-white'
          }`}
          aria-label="Exact artwork preview"
        >
          <div className={`absolute left-4 top-4 z-10 text-[8px] uppercase tracking-[0.22em] sm:left-5 sm:top-5 ${isFramed ? 'text-white/50' : 'text-[#69736e]'}`}>
            {isFramed ? STUDIO_SCENES[wallScene].name : 'Print proof'} · {selected.dimensionStr}
          </div>

          {isFramed ? (
            <RoomMockup
              previewUrl={previewUrl}
              printName={print.name}
              orientation={orientation}
              frame={frame}
              mat={mat}
              sceneIndex={wallScene}
            />
          ) : (
            <FlatProof
              previewUrl={previewUrl}
              printName={print.name}
              printRatio={printRatio}
              orientation={orientation}
            />
          )}

          {isFramed && (
            <div className="mt-5 w-full max-w-[760px]">
              <div className="studio-scene-strip flex touch-pan-x snap-x snap-mandatory gap-2 overflow-x-auto pb-2" aria-label="Room scenes">
                {STUDIO_SCENES.map((scene, index) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => {
                      setWallScene(index);
                      trackDemoEvent('finish_scene_selected', { scene: scene.id, frame, place: print.slug });
                    }}
                    aria-pressed={wallScene === index}
                    className={`group flex min-h-12 min-w-[150px] flex-1 snap-start items-center gap-2 border p-1.5 text-left transition-colors ${
                      wallScene === index ? 'border-white bg-white/10' : 'border-white/20 hover:border-white/55'
                    }`}
                  >
                    <span className="relative h-10 w-14 shrink-0 overflow-hidden bg-[#ddd]">
                      <Image src={scene.src} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                    <span>
                      <span className="block text-[9px] uppercase tracking-[0.12em] text-white">{scene.name}</span>
                      <span className="mt-0.5 block text-[8px] text-white/45">{scene.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className={`mt-3 text-center text-[8px] uppercase tracking-[0.16em] ${isFramed ? 'text-white/45' : 'text-[#69736e]'}`}>
            {isFramed ? `${activeFrame.label} frame${mat ? ' · snow white mat' : ''}` : 'Unframed archival print'}
          </p>

          {proofStatus === 'loading' && (
            <div aria-live="polite" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-4 py-2 text-[10px] text-white backdrop-blur">
              Optimizing artwork for {selected.dimensionStr}…
            </div>
          )}
          {proofStatus === 'error' && (
            <button
              type="button"
              onClick={() => setProofAttempt((attempt) => attempt + 1)}
              className="absolute bottom-4 left-1/2 z-20 min-h-11 -translate-x-1/2 bg-[#391d18] px-4 py-2 text-center text-[10px] text-[#efb4aa] underline underline-offset-2"
            >
              The print proof failed. Try again.
            </button>
          )}
        </section>

        <aside className="studio-panel flex w-full flex-col min-[1180px]:w-[420px] min-[1180px]:shrink-0">
          <div className="border-b border-[#14201d]/12 px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
            <div className="studio-kicker">Finish the piece</div>
            <div className="mt-4 flex items-start justify-between gap-5">
              <div>
                <h1 className="font-display text-[38px] font-light leading-[0.95] tracking-[-0.02em] sm:text-[42px]">{activeStep.title}</h1>
                <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-[#77817b]">{print.name} · {orientation}</p>
              </div>
              <span className="pt-1 text-[9px] uppercase tracking-[0.18em] text-[#9aa09b]">{activeStepIndex + 1}/4</span>
            </div>
          </div>

          <nav className="grid grid-cols-4 border-b border-[#14201d]/12" aria-label="Finish steps">
            {FINISH_STEPS.map((step, index) => {
              const available = index <= furthestStep;
              const active = step.id === finishStep;
              const complete = index < activeStepIndex || index < furthestStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(index)}
                  disabled={!available}
                  aria-current={active ? 'step' : undefined}
                  className={`min-h-14 border-r border-[#14201d]/10 px-1 text-[8px] uppercase tracking-[0.11em] last:border-r-0 ${
                    active
                      ? 'bg-[#173f35] text-white'
                      : available
                        ? 'bg-[#f7f5ef] text-[#173f35] hover:bg-[#e9ece7]'
                        : 'cursor-not-allowed bg-[#f7f5ef] text-[#b7bab6]'
                  }`}
                >
                  <span className="mx-auto mb-1 flex h-4 w-4 items-center justify-center rounded-full border border-current text-[7px]">
                    {complete && !active ? '✓' : index + 1}
                  </span>
                  {step.short}
                </button>
              );
            })}
          </nav>

          <div className="min-h-[320px] flex-1 px-5 py-6 sm:px-7">
            {finishStep === 'size' && (
              <SizeStep sizes={sizes} size={size} onChange={handleSizeChange} />
            )}
            {finishStep === 'frame' && (
              <FrameStep frame={frame} onChange={handleFrameChange} />
            )}
            {finishStep === 'mat' && (
              <MatStep isFramed={isFramed} mat={mat} onChange={handleMatChange} />
            )}
            {finishStep === 'review' && (
              <ReviewStep
                printName={print.name}
                orientation={orientation}
                dimensions={selected.dimensionStr}
                frameLabel={activeFrame.label}
                mat={mat}
                paletteName={palette?.name ?? 'Custom'}
                layoutName={layout?.name ?? 'Custom'}
                total={total}
                proofStatus={proofStatus}
                hasScene={Boolean(printScene)}
                ordering={ordering}
                orderError={orderError}
                demoOrder={demoOrder}
                onOrder={handleCreateOrder}
              />
            )}
          </div>

          {!demoOrder && finishStep !== 'review' && (
            <div className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-[#14201d]/12 bg-[#f7f5ef]/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-7">
              {activeStepIndex > 0 ? (
                <button type="button" onClick={() => goToStep(activeStepIndex - 1)} className="min-h-12 px-2 text-[9px] uppercase tracking-[0.15em] text-[#637069] underline-offset-4 hover:underline">
                  Back
                </button>
              ) : (
                <Link href={backUrl} className="flex min-h-12 items-center px-2 text-[9px] uppercase tracking-[0.15em] text-[#637069] underline-offset-4 hover:underline">
                  Edit map
                </Link>
              )}
              {finishStep !== 'size' && (
                <button type="button" onClick={skipCurrentStep} className="ml-auto min-h-12 px-3 text-[9px] uppercase tracking-[0.15em] text-[#637069] underline-offset-4 hover:underline">
                  Skip
                </button>
              )}
              <button type="button" onClick={goNext} className={`${finishStep === 'size' ? 'ml-auto' : ''} min-h-12 flex-1 bg-[#173f35] px-5 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e]`}>
                Next
              </button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function FlatProof({
  previewUrl,
  printName,
  printRatio,
  orientation,
}: {
  previewUrl: string | null;
  printName: string;
  printRatio: number;
  orientation: Orientation;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      <div
        className="relative max-h-[66vh] overflow-hidden bg-[#f7f2e8] shadow-[0_24px_70px_rgba(0,0,0,0.2)]"
        style={{
          width: orientation === 'landscape' ? 'min(680px, 88vw)' : orientation === 'square' ? 'min(500px, 80vw)' : 'min(400px, 72vw)',
          aspectRatio: `${1 / printRatio}`,
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={`${printName} map print`} className="absolute inset-0 h-full w-full object-fill" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[10px] uppercase tracking-[0.16em] text-[#777]">
            Preparing exact artwork
          </div>
        )}
      </div>
    </div>
  );
}

function RoomMockup({
  previewUrl,
  printName,
  orientation,
  frame,
  mat,
  sceneIndex,
}: {
  previewUrl: string | null;
  printName: string;
  orientation: Orientation;
  frame: FrameOption;
  mat: boolean;
  sceneIndex: number;
}) {
  const scene = STUDIO_SCENES[sceneIndex] ?? STUDIO_SCENES[0];
  const width = orientation === 'landscape' ? 43 : orientation === 'square' ? 33 : 28;
  const frameBackground = frame === 'black'
    ? '#171715'
    : frame === 'white'
      ? '#f0eee8'
      : 'linear-gradient(115deg, #6f431f 0%, #a97743 28%, #70431f 55%, #9a6836 78%, #5c351a 100%)';

  return (
    <div className="relative aspect-[3/2] w-full max-w-[820px] overflow-hidden bg-[#d7d1c7] shadow-[0_24px_75px_rgba(0,0,0,0.3)]" data-testid="studio-room-mockup">
      <Image src={scene.src} alt={`${printName} shown in the ${scene.name.toLowerCase()} room`} fill priority sizes="(min-width: 1180px) 820px, 94vw" className="object-cover" />
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${scene.x}%`,
          top: `${scene.y}%`,
          width: `${width}%`,
          aspectRatio: orientation === 'portrait' ? '3 / 4' : orientation === 'landscape' ? '4 / 3' : '1 / 1',
          filter: 'drop-shadow(0 12px 12px rgba(20, 18, 14, 0.32))',
        }}
        data-testid="studio-room-artwork"
      >
        <div
          className="h-full w-full p-[2.7%]"
          style={{ background: frameBackground, borderRadius: 0 }}
        >
          <div
            className={`h-full w-full bg-[#f8f7f2] ${mat ? 'p-[9%]' : 'p-0'}`}
            style={{
              borderRadius: 0,
              boxShadow: 'inset 0 0 0 1px rgba(20,20,18,0.12)',
            }}
          >
            <div className="relative h-full w-full overflow-hidden bg-[#f7f2e8]" style={{ borderRadius: 0 }}>
              {previewUrl ? (
                <img src={previewUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-fill" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[5px] uppercase tracking-[0.15em] text-[#777]">Preparing artwork</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SizeStep({
  sizes,
  size,
  onChange,
}: {
  sizes: typeof SIZE_CATALOG[Orientation];
  size: SizeLabel;
  onChange: (size: SizeLabel) => void;
}) {
  return (
    <PanelSection title="Four proportions, one exact artwork">
      <p className="mb-5 text-[11px] leading-5 text-[#727a75]">Larger prints are rendered with more street detail so the artwork stays crisp rather than simply being enlarged.</p>
      <div className="grid grid-cols-2 gap-2">
        {SIZE_LABELS.map((option) => {
          const selected = size === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={selected}
              className={`flex min-h-[76px] flex-col items-start justify-center border p-3 text-left transition-all ${selected ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.15em]">{sizes[option].displayLabel}</span>
              <span className="mt-1 text-[10px] text-[#8a918d]">{sizes[option].dimensionStr}</span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

function FrameStep({ frame, onChange }: { frame: FrameOption; onChange: (frame: FrameOption) => void }) {
  return (
    <PanelSection title="Ready to hang, or paper only">
      <p className="mb-5 text-[11px] leading-5 text-[#727a75]">Every framed option uses square corners and a restrained profile so the map remains the focal point.</p>
      <div className="grid grid-cols-2 gap-2">
        {FRAME_OPTIONS.map((option) => {
          const selected = frame === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`flex min-h-[76px] items-center gap-3 border p-3 text-left transition-all ${selected ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
            >
              <span
                className="h-8 w-8 shrink-0 border border-black/15"
                style={option.value === 'none' ? { background: '#fff' } : option.value === 'wood' ? { background: 'linear-gradient(115deg,#6f431f,#a97743,#70431f)' } : { background: option.swatchColor }}
              />
              <span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em]">{option.label}</span>
                <span className="mt-1 block text-[9px] text-[#8a918d]">{option.value === 'none' ? 'Paper only' : 'Gallery profile'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

function MatStep({
  isFramed,
  mat,
  onChange,
}: {
  isFramed: boolean;
  mat: boolean;
  onChange: (mat: boolean) => void;
}) {
  if (!isFramed) {
    return (
      <PanelSection title="No mat needed">
        <div className="border border-[#d8d9d3] bg-white p-6">
          <div className="mb-5 aspect-[4/3] border border-[#ddd] bg-[#f5f2ea] p-7">
            <div className="h-full w-full bg-[#53616f]" />
          </div>
          <p className="text-[11px] leading-5 text-[#727a75]">You chose an unframed print, so the artwork will run to the edge of the paper. Continue to review or go back to add a frame.</p>
        </div>
      </PanelSection>
    );
  }

  return (
    <PanelSection title="Let the artwork breathe">
      <p className="mb-5 text-[11px] leading-5 text-[#727a75]">A snow-white mat creates a calm margin around detailed city linework. Both choices are print-safe.</p>
      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((option) => (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={mat === option}
            className={`min-h-[112px] border p-3 text-left transition-all ${mat === option ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
          >
            <span className={`mx-auto mb-3 block aspect-[4/3] w-16 border-[5px] border-[#242422] ${option ? 'bg-white p-2' : 'bg-[#53616f]'}`}>
              {option && <span className="block h-full w-full bg-[#53616f]" />}
            </span>
            <span className="block text-center text-[9px] font-medium uppercase tracking-[0.13em]">{option ? `Snow white +${formatPrice(MAT_UPCHARGE)}` : 'No mat'}</span>
          </button>
        ))}
      </div>
    </PanelSection>
  );
}

function ReviewStep({
  printName,
  orientation,
  dimensions,
  frameLabel,
  mat,
  paletteName,
  layoutName,
  total,
  proofStatus,
  hasScene,
  ordering,
  orderError,
  demoOrder,
  onOrder,
}: {
  printName: string;
  orientation: Orientation;
  dimensions: string;
  frameLabel: string;
  mat: boolean;
  paletteName: string;
  layoutName: string;
  total: number;
  proofStatus: 'loading' | 'ready' | 'error';
  hasScene: boolean;
  ordering: boolean;
  orderError: string | null;
  demoOrder: { orderId: string; status: string } | null;
  onOrder: () => void;
}) {
  if (demoOrder) {
    return (
      <div className="border border-[#173f35] bg-[#e9eee9] p-6 text-center" aria-live="polite">
        <div className="text-[8px] uppercase tracking-[0.2em] text-[#c66b4e]">Demo order created</div>
        <div className="mt-3 font-display text-3xl font-light text-[#173f35]">{demoOrder.orderId}</div>
        <p className="mt-3 text-[10px] leading-5 text-[#68726c]">The exact artwork, size, frame, and mat were handed to the demo order endpoint. No payment was collected.</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center text-[9px] uppercase tracking-[0.16em] underline underline-offset-4">Create another print</Link>
      </div>
    );
  }

  const rows = [
    ['Artwork', printName],
    ['Format', `${dimensions} · ${orientation}`],
    ['Finish', `${frameLabel}${mat ? ' · snow white mat' : ''}`],
    ['Color', paletteName],
    ['Composition', layoutName],
  ];

  return (
    <div>
      <p className="mb-5 text-[11px] leading-5 text-[#727a75]">This is the exact artwork and finish configuration that would move into checkout. Nothing here can change the crop or styling by accident.</p>
      <dl className="border-y border-[#14201d]/12">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[92px_1fr] gap-3 border-b border-[#14201d]/10 py-3 last:border-b-0">
            <dt className="text-[8px] uppercase tracking-[0.16em] text-[#8a918d]">{label}</dt>
            <dd className="text-right text-[10px] font-medium uppercase tracking-[0.09em] text-[#26342f]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.17em] text-[#8a918d]">Demo total</span>
        <span className="font-display text-4xl font-light">{formatPrice(total)}</span>
      </div>
      <button
        type="button"
        onClick={onOrder}
        disabled={!hasScene || proofStatus !== 'ready' || ordering}
        className="mt-5 min-h-14 w-full bg-[#173f35] px-5 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {ordering ? 'Creating demo order…' : proofStatus === 'loading' ? 'Optimizing artwork…' : proofStatus === 'error' ? 'Proof unavailable' : hasScene ? 'Complete demo order' : 'Artwork scene missing'}
      </button>
      {orderError && <p role="alert" className="mt-3 text-center text-[10px] leading-5 text-[#a14f3c]">{orderError}</p>}
      <p className="mt-3 text-center text-[8px] uppercase tracking-[0.14em] text-[#a3a8a4]">Demo only · no payment or fulfillment</p>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="studio-control-section">
      <div className="studio-control-title">{title}</div>
      {children}
    </div>
  );
}
