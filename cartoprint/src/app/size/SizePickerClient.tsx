'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { getCatalogPrint } from '@/lib/catalog/prints';
import { placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { isValidOrientation, ORIENTATION_RATIO, type Orientation } from '@/lib/print/printSnapshot';
import {
  SIZE_CATALOG, SIZE_LABELS, FRAME_OPTIONS,
  getSizePrice, formatPrice, getMockupUrl, MAT_UPCHARGE,
  SESSION_PREVIEW_KEY,
  type SizeLabel, type FrameOption,
} from '@/lib/print/sizeCatalog';
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
  const [scene, setScene] = useState<0 | 1>(0);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_PREVIEW_KEY);
      if (stored) setPreviewUrl(stored);
    } catch {}
  }, []);

  // Reset mat + scene when frame changes
  function handleFrameChange(f: FrameOption) {
    setFrame(f);
    if (f === 'none') setMat(false);
    setScene(0);
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
  const mockupUrl   = getMockupUrl(frame, orientation, mat, scene);
  const isFramed    = frame !== 'none';
  // Bbox of the print area inside the mockup (normalised 0–1)
  const mockupArea  = mockupUrl ? MOCKUP_AREAS[mockupUrl.split('/').pop()!] : null;

  const backParams = new URLSearchParams(searchParams.toString());
  const backUrl    = `/customize?${backParams.toString()}`;

  return (
    <div className="min-h-screen bg-[#ece7dd]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ddd6c8] bg-[#f4f0e8] px-6 py-4">
        <Link
          href={backUrl}
          className="text-[11px] uppercase tracking-[1.8px] text-[#555] transition-colors hover:text-[#111]"
        >
          ← Back
        </Link>
        <div className="text-[11px] uppercase tracking-[2px] text-[#999]">
          Step 3 of 3 · Size &amp; Frame ·{' '}
          <span className="text-[#555]">{print.name}</span>
        </div>
        <div className="w-[80px]" />
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-col gap-10 px-6 py-8 lg:flex-row lg:items-start lg:py-14">

        {/* ── Left: preview ── */}
        <div className="flex flex-1 flex-col items-center lg:sticky lg:top-10 lg:self-start">
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
                    onClick={() => setScene(s)}
                    aria-label={`Scene ${s + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      scene === s ? 'w-6 bg-[#333]' : 'w-1.5 bg-[#bbb] hover:bg-[#888]'
                    }`}
                  />
                ))}
              </div>

              <p className="mt-3 text-center text-[10px] uppercase tracking-[1.4px] text-[#aaa]">
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
              <p className="mt-3 text-center text-[10px] uppercase tracking-[1.4px] text-[#aaa]">
                Unframed · {selected.dimensionStr}
              </p>
            </div>
          )}
        </div>

        {/* ── Right: options ── */}
        <div className="w-full lg:max-w-[360px] flex flex-col gap-7">

          {/* Print title */}
          <div>
            <h1 className="font-display text-3xl font-light leading-tight">{print.name}</h1>
            {print.defaultSubtitle && (
              <p className="mt-1 text-sm text-[#888]">{print.defaultSubtitle}</p>
            )}
            <p className="mt-1 text-[10px] uppercase tracking-[1.4px] text-[#aaa]">
              {orientation} · fine art print
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
                        ? 'border-[#111] bg-[#f4f0e8] shadow-[inset_0_0_0_1px_#111]'
                        : 'border-[#d8d1c4] bg-white hover:border-[#999]'
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
                        ? 'border-[#111] bg-[#f4f0e8] shadow-[inset_0_0_0_1px_#111]'
                        : 'border-[#d8d1c4] bg-white hover:border-[#999]'
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
              <div className="flex overflow-hidden rounded border border-[#d8d1c4]">
                {[false, true].map((m) => (
                  <button
                    key={String(m)}
                    onClick={() => { setMat(m); setScene(0); }}
                    className={`flex-1 py-2.5 text-[10px] uppercase tracking-[1.2px] transition-all ${
                      m ? 'border-l border-[#d8d1c4]' : ''
                    } ${
                      mat === m
                        ? 'bg-[#111] text-white'
                        : 'bg-white text-[#777] hover:bg-[#f4f0e8]'
                    }`}
                  >
                    {m ? `Snow White +${formatPrice(MAT_UPCHARGE)}` : 'None'}
                  </button>
                ))}
              </div>
            </PanelSection>
          )}

          {/* Price */}
          <div className="border-t border-[#ddd6c8] pt-6">
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

          {/* CTA */}
          <button
            className="w-full bg-[#07122a] py-4 text-[11px] font-medium uppercase tracking-[2.5px] text-white transition-opacity hover:opacity-80"
            onClick={() => {
              // Placeholder — Stripe checkout can be wired up after the demo.
              alert('Demo only — checkout is not connected yet.');
            }}
          >
            Demo Checkout Coming Soon
          </button>
          <p className="text-center text-[9px] uppercase tracking-[1.2px] text-[#bbb]">
            Ordering disabled · final checkout comes later
          </p>

        </div>
      </div>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[2px] text-[#777]">{title}</div>
      {children}
    </div>
  );
}
