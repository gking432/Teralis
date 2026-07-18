'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
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
    <main className="studio-paper-grid min-h-screen text-text">
      <StudioHeader step={1} backHref="/" backLabel="Search" context={decodeURIComponent(placeName)} tone="paper" />

      <section className="mx-auto grid min-h-[calc(100vh-70px)] max-w-[1380px] grid-cols-1 gap-12 px-6 py-12 md:px-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-20 lg:px-16 lg:py-16">
        <div className="max-w-xl">
          <div className="studio-kicker">01 · Select a format</div>
          <h1 className="mt-6 font-display text-[52px] font-light leading-[0.92] tracking-[-0.035em] md:text-[72px]">
            Give {decodeURIComponent(placeName)} <span className="italic text-[#65716a]">a shape.</span>
          </h1>
          <p className="mt-7 max-w-md text-[14px] leading-7 text-text-muted">
            Start with the frame in mind. Every format is composed at print resolution, and you can tune the cartography on the next screen.
          </p>
          <div className="mt-9 flex gap-8 border-t border-[#14201d]/15 pt-5 text-[9px] uppercase leading-5 tracking-[0.18em] text-[#65716a]">
            <span>Archival proportions<br />Print-ready artwork</span>
            <span>Live composition<br />Change anytime</span>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {ORIENTATIONS.map((o) => (
            <Link
              key={o.value}
              href={hrefFor(o.value)}
              className="group relative flex min-h-[390px] flex-col justify-between overflow-hidden border border-[#14201d]/15 bg-[#fbfaf6] p-5 text-left shadow-[0_12px_35px_rgba(20,32,29,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#173f35] hover:shadow-[0_24px_60px_rgba(20,32,29,0.14)]"
            >
              <div className="flex items-start justify-between">
                <span className="text-[9px] uppercase tracking-[0.18em] text-[#77817b]">0{ORIENTATIONS.indexOf(o) + 1}</span>
                <span className="translate-x-1 text-lg text-[#c66b4e] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">↗</span>
              </div>
              <div className="flex h-[230px] items-center justify-center py-4">
                <div
                  className="relative max-h-[215px] max-w-[175px] overflow-hidden border-[7px] border-white bg-[#e5ebe5] shadow-[0_15px_35px_rgba(20,32,29,0.18)] transition-transform duration-500 group-hover:scale-[1.03]"
                  style={{ aspectRatio: o.ratio, width: o.value === 'portrait' ? '138px' : o.value === 'landscape' ? '178px' : '164px' }}
                >
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 220 220" preserveAspectRatio="none">
                    <g fill="none" stroke="#173f35" strokeWidth="1" opacity=".48">
                      <path d="M-20 62C30 18 53 88 105 45s86-6 111 26 50 5 70-14" />
                      <path d="M-20 79C31 35 56 105 108 62s88-5 113 27 49 5 70-15" />
                      <path d="M-20 97C31 52 59 123 111 79s90-5 115 27 48 7 70-14" />
                      <path d="M-20 116C31 69 62 141 114 96s91-6 116 26 47 9 70-12" />
                      <path d="M8 204c37-38 71-20 89-63s63-62 93-23 57 19 88-5" />
                    </g>
                    <path d="M18 196c31-45 25-81 69-101s43-57 92-70" fill="none" stroke="#c66b4e" strokeWidth="3" />
                  </svg>
                  <div className="absolute bottom-2 left-2 right-2 border-t border-[#173f35]/50 pt-1 text-center text-[5px] uppercase tracking-[0.22em] text-[#173f35]">
                    {decodeURIComponent(placeName)}
                  </div>
                </div>
              </div>
              <div className="border-t border-[#14201d]/12 pt-4">
                <span className="font-display text-[30px] font-light text-[#14201d]">{o.label}</span>
                <span className="mt-1 block text-[10px] leading-4 text-[#77817b]">{o.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
