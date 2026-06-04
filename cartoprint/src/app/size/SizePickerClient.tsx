'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getCatalogPrint } from '@/lib/catalog/prints';
import { placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { isValidOrientation, ORIENTATION_RATIO, type Orientation } from '@/lib/print/printSnapshot';
import {
  SIZE_CATALOG, SIZE_LABELS, FRAME_OPTIONS,
  getSizePrice, formatPrice,
  SESSION_PREVIEW_KEY,
  type SizeLabel, type FrameOption,
} from '@/lib/print/sizeCatalog';

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

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_PREVIEW_KEY);
      if (stored) setPreviewUrl(stored);
    } catch {}
  }, []);

  if (!print) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#ece7dd]">
        <p className="text-sm text-[#999]">
          No print selected.{' '}
          <Link href="/" className="underline hover:text-[#111]">
            Start over
          </Link>
        </p>
      </div>
    );
  }

  const sizes = SIZE_CATALOG[orientation];
  const selected = sizes[size];
  const activeFrame = FRAME_OPTIONS.find((f) => f.value === frame)!;
  const total = getSizePrice(size, frame);
  const hasFrame = frame !== 'none';

  const backParams = new URLSearchParams(searchParams.toString());
  const backUrl = `/customize?${backParams.toString()}`;

  // CSS border thickness scales with preview width — roughly 3.5% on each side
  const frameBorderPx = 22;

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
          Step 3 of 3 · Size &amp; Frame · <span className="text-[#555]">{print.name}</span>
        </div>
        <div className="w-[80px]" />
      </div>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-8 lg:flex-row lg:items-start lg:py-14">

        {/* Left: preview with simulated frame */}
        <div className="flex flex-1 flex-col items-center justify-start lg:sticky lg:top-10 lg:self-start">
          <div
            className="transition-all duration-200"
            style={
              hasFrame
                ? {
                    padding: frameBorderPx,
                    backgroundColor: activeFrame.borderColor,
                    boxShadow: `inset 0 0 0 3px ${activeFrame.insetColor}, 0 30px_90px_rgba(0,0,0,0.28)`.replace(/_/g, ' '),
                  }
                : { boxShadow: '0 30px 90px rgba(0,0,0,0.28)' }
            }
          >
            <div
              className="relative overflow-hidden"
              style={{
                width: orientation === 'landscape' ? 'min(520px, 80vw)' : 'min(340px, 80vw)',
                height:
                  orientation === 'landscape'
                    ? `calc(min(520px, 80vw) * ${printRatio.toFixed(4)})`
                    : `calc(min(340px, 80vw) * ${printRatio.toFixed(4)})`,
              }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`${print.name} map print preview`}
                  className="absolute inset-0 h-full w-full object-fill"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#07122a]/8">
                  <span className="text-[10px] uppercase tracking-[1.4px] text-[#999]">
                    Go back to generate preview
                  </span>
                </div>
              )}
            </div>
          </div>

          {hasFrame && (
            <p className="mt-4 text-center text-[10px] uppercase tracking-[1.2px] text-[#aaa]">
              {activeFrame.label} frame · {selected.dimensionStr} print
            </p>
          )}
          {!hasFrame && (
            <p className="mt-4 text-center text-[10px] uppercase tracking-[1.2px] text-[#aaa]">
              Unframed · {selected.dimensionStr} print
            </p>
          )}
        </div>

        {/* Right: options panel */}
        <div className="w-full lg:max-w-[360px] flex flex-col gap-7">

          {/* Print name */}
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
                const opt = sizes[s];
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
                    onClick={() => setFrame(f.value)}
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
                                'repeating-linear-gradient(45deg, #ccc 0, #ccc 1px, #fff 0, #fff 50%) 0/6px 6px',
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

          {/* Price summary */}
          <div className="border-t border-[#ddd6c8] pt-6">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[1.6px] text-[#888]">Print Total</span>
              <span className="font-display text-3xl font-light">{formatPrice(total)}</span>
            </div>
            {hasFrame && (
              <div className="mt-1 flex items-baseline justify-between text-[10px] text-[#aaa]">
                <span>Includes {activeFrame.label.toLowerCase()} frame</span>
              </div>
            )}
            <p className="mt-1.5 text-right text-[9px] uppercase tracking-[1px] text-[#bbb]">
              + shipping · calculated at checkout
            </p>
          </div>

          {/* CTA */}
          <button
            className="w-full bg-[#07122a] py-4 text-[11px] font-medium uppercase tracking-[2.5px] text-white transition-opacity hover:opacity-80"
            onClick={() => {
              // Placeholder — Stripe checkout wired up in a later step
              alert('Checkout coming soon — Stripe integration in progress.');
            }}
          >
            Proceed to Checkout
          </button>
          <p className="text-center text-[9px] uppercase tracking-[1.2px] text-[#bbb]">
            Secure checkout · Printed &amp; ships in 3–5 days
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
