'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { getCatalogPrint } from '@/lib/catalog/prints';
import { placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { isValidOrientation, ORIENTATION_RATIO, type Orientation } from '@/lib/print/orientation';
import {
  SIZE_CATALOG, SIZE_LABELS, FRAME_OPTIONS,
  getSizePrice, formatPrice, getMockupUrl, MAT_UPCHARGE,
  SESSION_PREVIEW_KEY, SESSION_FINISH_KEY,
  type SizeLabel, type FrameOption,
} from '@/lib/print/sizeCatalog';
import { readStoredScene, type PrintScene } from '@/lib/print/scene';
import { MOCKUP_AREAS } from '@/lib/print/mockupAreas.generated';

export function SizePickerClient() {
  const searchParams = useSearchParams();

  const catalogSlug  = searchParams.get('print');
  const catalogPrint = getCatalogPrint(catalogSlug);
  const placePrint   = !catalogPrint
    ? placeFromSearchParams(new URLSearchParams(searchParams.toString()))
    : null;
  const print = catalogPrint ?? placePrint;

  const orientationParam = searchParams.get('o');
  const orientation: Orientation = isValidOrientation(orientationParam) ? orientationParam : 'portrait';
  const printRatio = ORIENTATION_RATIO[orientation];

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [size,  setSize]  = useState<SizeLabel>('medium');
  const [frame, setFrame] = useState<FrameOption>('none');
  const [mat,   setMat]   = useState(false);
  const [wallScene, setWallScene] = useState<0 | 1>(0);
  const [printScene, setPrintScene] = useState<PrintScene | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [demoOrder, setDemoOrder] = useState<{ orderId: string; status: string } | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_PREVIEW_KEY);
      if (stored) setPreviewUrl(stored);
      const storedScene = readStoredScene(print ?? undefined);
      if (storedScene) setPrintScene(storedScene);
      const finishRaw = sessionStorage.getItem(SESSION_FINISH_KEY);
      if (finishRaw) {
        const finish = JSON.parse(finishRaw) as { slug?: string; size?: SizeLabel; frame?: FrameOption; mat?: boolean };
        if (finish.slug === print?.slug) {
          if (finish.size && SIZE_LABELS.includes(finish.size)) setSize(finish.size);
          if (finish.frame && FRAME_OPTIONS.some((option) => option.value === finish.frame)) setFrame(finish.frame);
          if (typeof finish.mat === 'boolean') setMat(finish.mat);
        }
      }
    } catch {}
  // The slug is stable even when a custom-place object is reconstructed from
  // URL parameters during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print?.slug]);

  useEffect(() => {
    if (!print) return;
    try {
      sessionStorage.setItem(SESSION_FINISH_KEY, JSON.stringify({ slug: print.slug, size, frame, mat }));
    } catch {}
  }, [print, size, frame, mat]);

  // Reset mat + scene when frame changes
  function handleFrameChange(f: FrameOption) {
    setFrame(f);
    if (f === 'none') setMat(false);
    setWallScene(0);
  }

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

  const sizes       = SIZE_CATALOG[orientation];
  const selected    = sizes[size];
  const activeFrame = FRAME_OPTIONS.find((f) => f.value === frame)!;
  const total       = getSizePrice(size, frame, mat);
  const mockupUrl   = getMockupUrl(frame, orientation, mat, wallScene);
  const isFramed    = frame !== 'none';
  // Bbox of the print area inside the mockup (normalised 0–1)
  const mockupArea  = mockupUrl ? MOCKUP_AREAS[mockupUrl.split('/').pop()!] : null;

  const backParams = new URLSearchParams(searchParams.toString());
  const backUrl    = `/customize?${backParams.toString()}`;

  async function handleCreateDemoOrder() {
    if (!printScene || ordering) return;
    setOrdering(true);
    setOrderError(null);
    try {
      const response = await fetch('/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scene: printScene,
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
      if (!response.ok) throw new Error(result.error || 'Unable to create the demo order.');
      setDemoOrder({ orderId: result.orderId, status: result.status });
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Unable to create the demo order.');
    } finally {
      setOrdering(false);
    }
  }

  return (
    <div className="studio-topography min-h-screen bg-[#14201d] text-[#14201d]">
      <StudioHeader step={2} backHref={backUrl} backLabel="Edit map" context={print.name} />

      <div className="mx-auto flex max-w-[1480px] flex-col gap-8 px-4 py-6 md:px-8 lg:px-10 lg:py-10 min-[1380px]:flex-row min-[1380px]:items-start min-[1380px]:gap-12">

        {/* ── Left: preview ── */}
        <div className="relative flex min-h-[calc(100vh-150px)] flex-1 flex-col items-center justify-center rounded-sm border border-white/10 bg-white/[0.035] px-3 py-10 lg:px-8 min-[1380px]:sticky min-[1380px]:top-6 min-[1380px]:self-start">
          <div className="absolute left-5 top-5 text-[8px] uppercase tracking-[0.22em] text-white/35">
            Wall preview · {selected.dimensionStr}
          </div>
          {isFramed && mockupUrl ? (
            /* Wall lifestyle mockup */
            <div className="relative w-full max-w-[680px]">
              <div className="relative overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
                {/* User's actual map preview, positioned behind the
                    transparent print-area cutout in the mockup PNG. */}
                {previewUrl && mockupArea && (
                  <img
                    src={previewUrl}
                    alt=""
                    aria-hidden
                    className="absolute object-fill"
                    style={{
                      left:   `${mockupArea.x * 100}%`,
                      top:    `${mockupArea.y * 100}%`,
                      width:  `${mockupArea.w * 100}%`,
                      height: `${mockupArea.h * 100}%`,
                    }}
                  />
                )}
                {!previewUrl && mockupArea && (
                  <div
                    className="absolute flex flex-col items-center justify-center bg-[#f7f2e8] px-4 text-center"
                    style={{
                      left:   `${mockupArea.x * 100}%`,
                      top:    `${mockupArea.y * 100}%`,
                      width:  `${mockupArea.w * 100}%`,
                      height: `${mockupArea.h * 100}%`,
                    }}
                  >
                    <div className="font-display text-xl font-light text-[#07122a]">{print.name}</div>
                    <p className="mt-3 max-w-[180px] text-[10px] leading-4 text-[#888]">
                      Generate the artwork preview in Step 2 to place it inside this frame.
                    </p>
                  </div>
                )}
                <Image
                  src={mockupUrl}
                  alt={`${print.name} — ${activeFrame.label} frame${mat ? ' with mat' : ''}`}
                  width={1200}
                  height={900}
                  className="relative h-auto w-full object-cover transition-opacity duration-300"
                  priority
                />
              </div>

              {/* Scene switcher */}
              <div className="mt-4 flex items-center justify-center gap-2">
                {([0, 1] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setWallScene(s)}
                    aria-label={`Scene ${s + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      wallScene === s ? 'w-6 bg-[#333]' : 'w-1.5 bg-[#bbb] hover:bg-[#888]'
                    }`}
                  />
                ))}
              </div>

              <p className="mt-3 text-center text-[9px] uppercase tracking-[0.15em] text-white/45">
                {activeFrame.label} frame{mat ? ' · Snow White mat' : ''} · {selected.dimensionStr}
              </p>
            </div>
          ) : (
            /* Flat map preview (unframed) */
            <div className="flex flex-col items-center">
              <div
                className="relative overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.28)]"
                style={{
                  width: orientation === 'landscape' ? 'min(520px, 85vw)' : 'min(340px, 85vw)',
                  height:
                    orientation === 'landscape'
                      ? `calc(min(520px, 85vw) * ${printRatio.toFixed(4)})`
                      : `calc(min(340px, 85vw) * ${printRatio.toFixed(4)})`,
                }}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`${print.name} map print`}
                    className="absolute inset-0 h-full w-full object-fill"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f7f2e8] px-8 text-center">
                    <div className="font-display text-2xl font-light text-[#07122a]">{print.name}</div>
                    {print.defaultSubtitle && (
                      <div className="mt-1 text-xs uppercase tracking-[2px] text-[#07122a]/45">
                        {print.defaultSubtitle}
                      </div>
                    )}
                    <p className="mt-5 max-w-[220px] text-xs leading-5 text-[#888]">
                      Your generated artwork preview will appear here after Step 2.
                    </p>
                    <Link
                      href={backUrl}
                      className="mt-5 border border-[#07122a] px-4 py-2 text-[10px] uppercase tracking-[1.4px] text-[#07122a] transition-colors hover:bg-[#07122a] hover:text-white"
                    >
                      Generate Preview
                    </Link>
                  </div>
                )}
              </div>
              <p className="mt-3 text-center text-[9px] uppercase tracking-[0.15em] text-white/45">
                Unframed · {selected.dimensionStr}
              </p>
            </div>
          )}
        </div>

        {/* ── Right: options ── */}
        <aside className="studio-panel flex w-full flex-col gap-6 p-5 sm:p-7 min-[1380px]:w-[410px] min-[1380px]:flex-none">

          {/* Print title */}
          <div>
            <div className="studio-kicker">Finish the piece</div>
            <h1 className="mt-4 font-display text-[42px] font-light leading-[0.95] tracking-[-0.02em]">{print.name}</h1>
            {print.defaultSubtitle && (
              <p className="mt-1 text-sm text-[#888]">{print.defaultSubtitle}</p>
            )}
            <p className="mt-3 text-[9px] uppercase tracking-[0.17em] text-[#77817b]">
              {orientation} format · archival art print
            </p>
          </div>

          {/* Size */}
          <PanelSection title="Size">
            <div className="grid grid-cols-2 gap-2">
              {SIZE_LABELS.map((s) => {
                const opt    = sizes[s];
                const active = size === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`flex flex-col items-start gap-0.5 border p-3 text-left transition-all ${
                      active
                        ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]'
                        : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
                    }`}
                  >
                    <span className="text-[11px] font-medium uppercase tracking-[1.4px]">
                      {opt.displayLabel}
                    </span>
                    <span className="text-[10px] text-[#999]">{opt.dimensionStr}</span>
                  </button>
                );
              })}
            </div>
          </PanelSection>

          {/* Frame */}
          <PanelSection title="Frame">
            <div className="grid grid-cols-2 gap-2">
              {FRAME_OPTIONS.map((f) => {
                const active = frame === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => handleFrameChange(f.value)}
                    className={`flex items-center gap-3 border p-3 text-left transition-all ${
                      active
                        ? 'border-[#173f35] bg-[#eef1ed] shadow-[inset_0_0_0_1px_#173f35]'
                        : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
                    }`}
                  >
                    <span
                      className="inline-block h-5 w-5 flex-shrink-0 rounded-full border border-[#ccc]"
                      style={
                        f.value === 'none'
                          ? {
                              background:
                                'repeating-linear-gradient(45deg,#ccc 0,#ccc 1px,#fff 0,#fff 50%) 0/6px 6px',
                            }
                          : { backgroundColor: f.swatchColor }
                      }
                    />
                    <span className="text-[11px] font-medium uppercase tracking-[1.4px]">
                      {f.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </PanelSection>

          {/* Mat — only when framed */}
          {isFramed && (
            <PanelSection title="Mat">
              <div className="flex overflow-hidden rounded-sm border border-[#d8d9d3]">
                {[false, true].map((m) => (
                  <button
                    key={String(m)}
                    onClick={() => { setMat(m); setWallScene(0); }}
                    className={`flex-1 py-2.5 text-[10px] uppercase tracking-[1.2px] transition-all ${
                      m ? 'border-l border-[#d8d9d3]' : ''
                    } ${
                      mat === m
                        ? 'bg-[#173f35] text-white'
                        : 'bg-white text-[#66706a] hover:bg-[#eef1ed]'
                    }`}
                  >
                    {m ? `Snow White +${formatPrice(MAT_UPCHARGE)}` : 'None'}
                  </button>
                ))}
              </div>
            </PanelSection>
          )}

          {/* Price */}
          <div className="border-t border-[#14201d]/15 pt-6">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[1.6px] text-[#888]">Demo Total</span>
              <span className="font-display text-3xl font-light">{formatPrice(total)}</span>
            </div>
            {isFramed && (
              <p className="mt-1 text-right text-[10px] text-[#aaa]">
                Includes {activeFrame.label.toLowerCase()} frame
                {mat ? ' · snow white mat' : ''}
              </p>
            )}
            <p className="mt-1.5 text-right text-[9px] uppercase tracking-[1px] text-[#bbb]">
              No payment collected in this demo
            </p>
          </div>

          {demoOrder ? (
            <div className="border border-[#173f35] bg-[#eef1ed] p-5 text-center">
              <div className="text-[8px] uppercase tracking-[0.2em] text-[#c66b4e]">Demo order created</div>
              <div className="mt-2 font-display text-3xl font-light text-[#173f35]">{demoOrder.orderId}</div>
              <p className="mt-2 text-[10px] leading-5 text-[#68726c]">The artwork scene, crop, size, and finish were handed to the order endpoint successfully. No payment was collected.</p>
              <Link href="/" className="mt-4 inline-block text-[9px] uppercase tracking-[0.16em] underline underline-offset-4">Create another print</Link>
            </div>
          ) : (
            <>
              <button
                className="w-full bg-[#173f35] py-4 text-[10px] font-medium uppercase tracking-[0.21em] text-white transition-colors hover:bg-[#c66b4e] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={handleCreateDemoOrder}
                disabled={!printScene || ordering}
              >
                {ordering ? 'Creating Demo Order…' : printScene ? 'Create Demo Order' : 'Artwork Scene Missing'}
              </button>
              {orderError && <p role="alert" className="text-center text-[10px] leading-5 text-[#a14f3c]">{orderError}</p>}
              <p className="text-center text-[9px] uppercase tracking-[1.2px] text-[#bbb]">Demo handoff only · no payment or fulfillment</p>
            </>
          )}

        </aside>
      </div>
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
