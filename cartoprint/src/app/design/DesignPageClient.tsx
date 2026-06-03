'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Orientation } from '@/lib/print/printSnapshot';

const ORIENTATIONS: { value: Orientation; label: string; desc: string; ratio: string }[] = [
  { value: 'portrait', label: 'Portrait', desc: 'Taller than wide · classic poster shape', ratio: '3/4' },
  { value: 'landscape', label: 'Landscape', desc: 'Wider than tall · wide-format frames', ratio: '4/3' },
  { value: 'square', label: 'Square', desc: 'Equal sides · great for canvas', ratio: '1/1' },
];

export function DesignPageClient() {
  const searchParams = useSearchParams();

  function hrefFor(o: Orientation): string {
    const next = new URLSearchParams(searchParams.toString());
    next.set('o', o);
    return `/customize?${next.toString()}`;
  }

  // Use whichever identifier was passed in so we can title the page.
  const placeName =
    searchParams.get('place') ||
    searchParams.get('q') ||
    searchParams.get('print') ||
    'your place';

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-text">
      <div className="flex items-center justify-between border-b border-[#ddd6c8] bg-[#f4f0e8] px-6 py-4">
        <Link href="/" className="text-[11px] uppercase tracking-[1.8px] text-[#555] transition-colors hover:text-[#111]">
          ← Back to Search
        </Link>
        <div className="text-[11px] uppercase tracking-[2px] text-[#999]">Step 1 of 3 · Orientation</div>
        <div className="w-[120px]" />
      </div>

      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-text-muted">
          Designing a print of
        </div>
        <h1 className="font-display text-[44px] font-light leading-[1.05] tracking-[-0.5px] md:text-[56px]">
          {decodeURIComponent(placeName)}
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-text-muted">
          Choose the shape of your print first. You can change colors, title, and details on the next step.
        </p>

        <div className="mt-12 grid w-full grid-cols-1 gap-5 sm:grid-cols-3">
          {ORIENTATIONS.map((o) => (
            <Link
              key={o.value}
              href={hrefFor(o.value)}
              className="group flex flex-col items-center gap-5 border border-[#d8d1c4] bg-white p-6 text-left transition-all hover:border-[#111] hover:shadow-[0_18px_48px_rgba(0,0,0,0.10)]"
            >
              <div
                className="relative w-full max-w-[180px] border border-[#bbb] bg-[#f4f0e8] transition-colors group-hover:border-[#111]"
                style={{ aspectRatio: o.ratio }}
              >
                <div className="absolute inset-3 border border-dashed border-[#bbb] group-hover:border-[#666]" />
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-[12px] uppercase tracking-[1.6px] text-[#222]">{o.label}</span>
                <span className="text-[11px] leading-snug text-[#888]">{o.desc}</span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-[11px] uppercase tracking-[1.6px] text-text-muted">
          Step 2 will let you customize colors · Step 3 picks size and frame
        </p>
      </section>
    </main>
  );
}
