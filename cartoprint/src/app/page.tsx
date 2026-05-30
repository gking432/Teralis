'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import {
  getFeaturedCatalogPrint,
  getStateCatalogPrints,
  type CatalogPrint,
} from '@/lib/catalog/prints';

const ThumbnailMap = dynamic(
  () => import('@/components/Storefront/ThumbnailMap').then((m) => m.ThumbnailMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[#07122a]/10" /> }
);

export default function StorefrontPage() {
  const featuredPrint = getFeaturedCatalogPrint();
  const statePrints = getStateCatalogPrints();
  const [query, setQuery] = useState('');

  const filteredPrints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return statePrints;

    return statePrints.filter((print) =>
      [print.name, print.slug, print.slug === 'district-of-columbia' ? 'dc' : '', print.defaultSubtitle, print.establishedYear]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [query, statePrints]);

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-text">
      <section className="relative overflow-hidden border-b border-[#d9cfbf] bg-[#f6efe1]">
        <div className="absolute inset-0 opacity-[0.28]">
          <div className="absolute left-[-8vw] top-[-12vw] h-[34vw] w-[34vw] rounded-full bg-[#d8c3a4]" />
          <div className="absolute right-[-12vw] top-12 h-[38vw] w-[38vw] rounded-full border border-[#b9a789]" />
          <div className="absolute bottom-[-18vw] left-[42vw] h-[30vw] w-[30vw] rounded-full bg-white" />
        </div>

        <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10 lg:px-14">
          <div className="font-display text-[26px] font-light uppercase tracking-[3px]">
            TERRA<span className="font-semibold">LIS</span>
          </div>
          <Link
            href="/customize"
            className="border border-text px-4 py-2 text-[11px] uppercase tracking-[1.4px] transition-colors hover:bg-text hover:text-white"
          >
            Make Your Own
          </Link>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-8 md:px-10 lg:grid-cols-[1fr_520px] lg:px-14 lg:pb-24 lg:pt-16">
          <div className="flex flex-col justify-center">
            <div className="mb-5 text-[11px] font-medium uppercase tracking-[2px] text-text-muted">
              Custom map prints, ready to personalize
            </div>
            <h1 className="font-display text-[56px] font-light leading-[0.95] tracking-[-2px] md:text-[82px]">
              Select a print.
              <br />
              Make it yours.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-text-muted">
              Start from a polished United States or state map, then adjust colors, labels, crop,
              titles, and print design in the editor. Or open a blank custom map and build from scratch.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#select-print"
                className="bg-text px-6 py-4 text-center text-[12px] font-medium uppercase tracking-[1.6px] text-white transition-opacity hover:opacity-85"
              >
                Select a Print
              </a>
              <Link
                href="/customize"
                className="border border-text px-6 py-4 text-center text-[12px] font-medium uppercase tracking-[1.6px] transition-colors hover:bg-white"
              >
                Make Your Own
              </Link>
            </div>
          </div>

          <FeaturedPrintCard print={featuredPrint} />
        </div>
      </section>

      <section id="select-print" className="mx-auto max-w-7xl px-6 py-14 md:px-10 lg:px-14 lg:py-20">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-text-muted">
              Catalog Prints
            </div>
            <h2 className="font-display text-4xl font-light md:text-5xl">Choose a starting map</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-text-muted">
              Every catalog print opens in the same editor, so users can keep it simple or go deep
              with colors, labels, titles, and crop.
            </p>
          </div>

          <label className="block w-full md:w-[340px]">
            <span className="mb-2 block text-[11px] uppercase tracking-[1.5px] text-text-muted">
              Find a State
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Wisconsin, Texas, DC..."
              className="w-full border border-[#d7ccba] bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-text-light focus:border-text"
            />
          </label>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <PrintCard print={featuredPrint} featured />
          <div className="border border-[#d7ccba] bg-white/60 p-6">
            <div className="mb-3 text-[11px] uppercase tracking-[1.5px] text-text-muted">
              Full Custom
            </div>
            <h3 className="font-display text-3xl font-light">Make your own map</h3>
            <p className="mt-3 text-sm leading-7 text-text-muted">
              For city crops, exact neighborhoods, counties, regions, or anything outside the preset catalog.
            </p>
            <Link
              href="/customize"
              className="mt-6 inline-flex border border-text px-5 py-3 text-[11px] uppercase tracking-[1.4px] transition-colors hover:bg-text hover:text-white"
            >
              Open Custom Builder
            </Link>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between text-[11px] uppercase tracking-[1.5px] text-text-muted">
          <span>State Prints</span>
          <span>{filteredPrints.length} available</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredPrints.map((print) => (
            <PrintCard key={print.slug} print={print} />
          ))}
        </div>

        {filteredPrints.length === 0 && (
          <div className="border border-[#d7ccba] bg-white p-8 text-sm text-text-muted">
            No catalog prints matched that search. Use Make Your Own to build any region manually.
          </div>
        )}
      </section>
    </main>
  );
}

function FeaturedPrintCard({ print }: { print: CatalogPrint }) {
  return (
    <Link
      href={`/customize?print=${print.slug}`}
      className="group relative min-h-[420px] overflow-hidden border border-[#cfc1aa] bg-[#fbfaf6] p-7 shadow-[0_30px_80px_rgba(67,48,29,0.14)] transition-transform hover:-translate-y-1"
    >
      <div className="absolute inset-7 border border-[#d8cbb7]" />
      <div className="absolute inset-x-12 top-16 h-px bg-[#c5b69d]" />
      <div className="absolute inset-y-14 left-20 w-px bg-[#d8cbb7]" />
      <div className="absolute inset-y-10 right-24 w-px bg-[#ded4c3]" />
      <div className="absolute bottom-20 left-12 right-12 h-px bg-[#d0c0a8]" />
      <div className="absolute left-[22%] top-[28%] h-[130px] w-[210px] rounded-[55%] bg-[#07122a]" />
      <div className="absolute right-[18%] top-[38%] h-[110px] w-[150px] rounded-[50%] border-[18px] border-[#07122a]" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[1.6px] text-text-muted">
            Featured Print
          </div>
          <h2 className="font-display text-5xl font-light leading-none">{print.name}</h2>
          <p className="mt-4 max-w-sm text-sm leading-7 text-text-muted">
            A ready-to-customize national map with state lines, cities, roads, water, colors, and title options.
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-[#d8cbb7] pt-5">
          <span className="text-[11px] uppercase tracking-[1.5px] text-text-muted">
            EST. {print.establishedYear}
          </span>
          <span className="text-[11px] uppercase tracking-[1.5px] transition-transform group-hover:translate-x-1">
            Customize
          </span>
        </div>
      </div>
    </Link>
  );
}

function PrintCard({ print, featured = false }: { print: CatalogPrint; featured?: boolean }) {
  return (
    <Link
      href={`/customize?print=${print.slug}`}
      className={`group block w-full border border-[#d7ccba] bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-text hover:shadow-[0_18px_50px_rgba(67,48,29,0.1)] ${
        featured ? 'min-h-[220px]' : ''
      }`}
    >
      <ThumbnailMap
        slug={print.slug}
        bbox={print.bbox}
        center={print.center}
        kind={print.kind}
        title={print.defaultTitle}
        subtitle={print.defaultSubtitle}
        detail={print.establishedYear ? `EST. ${print.establishedYear}` : ''}
        className="mb-4 w-full overflow-hidden"
      />
      <div className="mb-2 text-[10px] uppercase tracking-[1.4px] text-text-muted">
        {print.kind === 'country' ? 'National Print' : 'State Print'}
      </div>
      <h3 className="font-display text-2xl font-light">{print.name}</h3>
      {print.slogan && (
        <p className="mt-1 text-[11px] leading-5 text-text-muted">{print.slogan}</p>
      )}
      <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[1.4px] text-text-muted">
        <span>{print.establishedYear ? `EST. ${print.establishedYear}` : 'Customizable'}</span>
        <span className="text-text transition-transform group-hover:translate-x-1">Customize →</span>
      </div>
    </Link>
  );
}
