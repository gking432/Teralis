'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  getFeaturedCatalogPrint,
  getStateCatalogPrints,
  type CatalogPrint,
} from '@/lib/catalog/prints';
import { LocationSearch } from '@/components/Storefront/LocationSearch';

const ThumbnailMap = dynamic(
  () => import('@/components/Storefront/ThumbnailMap').then((m) => m.ThumbnailMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[#07122a]/10" /> }
);

const POPULAR_CITIES = [
  'Chicago', 'New York', 'Los Angeles', 'Austin', 'Nashville',
  'Boston', 'Portland', 'Denver', 'Seattle', 'Miami',
];

export default function StorefrontPage() {
  const featuredPrint = getFeaturedCatalogPrint();
  const statePrints = getStateCatalogPrints();

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
            Custom Builder
          </Link>
        </header>

        <div className="relative z-10 mx-auto max-w-3xl px-6 pb-20 pt-10 text-center md:px-10 lg:pb-28 lg:pt-16">
          <div className="mb-5 text-[11px] font-medium uppercase tracking-[2px] text-text-muted">
            Fine-art map prints of any place
          </div>
          <h1 className="font-display text-[52px] font-light leading-[0.95] tracking-[-1.5px] md:text-[78px]">
            Where do you call home?
          </h1>
          <p className="mt-7 text-lg leading-8 text-text-muted">
            Type a state, city, or town. We&rsquo;ll show you a print, ready to customize and order.
          </p>

          <div className="mt-9">
            <LocationSearch />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] text-text-muted">
            <span className="uppercase tracking-[1.4px] text-[10px]">Popular:</span>
            {POPULAR_CITIES.map((city) => (
              <Link
                key={city}
                href={`/customize?q=${encodeURIComponent(city)}`}
                className="underline-offset-4 transition-colors hover:text-text hover:underline"
              >
                {city}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="browse-states" className="mx-auto max-w-7xl px-6 py-14 md:px-10 lg:px-14 lg:py-20">
        <div className="mb-8 flex flex-col gap-4">
          <div className="text-[11px] font-medium uppercase tracking-[2px] text-text-muted">
            Or browse by state
          </div>
          <h2 className="font-display text-3xl font-light md:text-4xl">All 50 states & DC</h2>
          <p className="max-w-2xl text-sm leading-7 text-text-muted">
            Each state print is ready to order or customize — adjust colors, towns, roads,
            and titles in the editor.
          </p>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <FeaturedPrintCard print={featuredPrint} />
          <div className="border border-[#d7ccba] bg-white/60 p-6">
            <div className="mb-3 text-[11px] uppercase tracking-[1.5px] text-text-muted">
              Don&rsquo;t see it?
            </div>
            <h3 className="font-display text-3xl font-light">Search any place</h3>
            <p className="mt-3 text-sm leading-7 text-text-muted">
              Madison, Brooklyn, Lake Tahoe, the Outer Banks — we can render a print for
              anywhere on the map.
            </p>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => document.querySelector<HTMLInputElement>('input[type="text"]')?.focus(), 400);
              }}
              className="mt-6 inline-flex border border-text px-5 py-3 text-[11px] uppercase tracking-[1.4px] transition-colors hover:bg-text hover:text-white"
            >
              Use the Search
            </a>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between text-[11px] uppercase tracking-[1.5px] text-text-muted">
          <span>State Prints</span>
          <span>{statePrints.length} available</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statePrints.map((print) => (
            <PrintCard key={print.slug} print={print} />
          ))}
        </div>
      </section>
    </main>
  );
}

function FeaturedPrintCard({ print }: { print: CatalogPrint }) {
  return (
    <Link
      href={`/customize?print=${print.slug}`}
      className="group relative min-h-[300px] overflow-hidden border border-[#cfc1aa] bg-[#fbfaf6] p-7 shadow-[0_30px_80px_rgba(67,48,29,0.14)] transition-transform hover:-translate-y-1"
    >
      <div className="absolute inset-7 border border-[#d8cbb7]" />
      <div className="absolute left-[22%] top-[28%] h-[130px] w-[210px] rounded-[55%] bg-[#07122a]" />
      <div className="absolute right-[18%] top-[38%] h-[110px] w-[150px] rounded-[50%] border-[18px] border-[#07122a]" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[1.6px] text-text-muted">
            Featured Print
          </div>
          <h2 className="font-display text-5xl font-light leading-none">{print.name}</h2>
          <p className="mt-4 max-w-sm text-sm leading-7 text-text-muted">
            The national map — state lines, capitals, and a fully customizable design.
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-[#d8cbb7] pt-5">
          <span className="text-[11px] uppercase tracking-[1.5px] text-text-muted">
            EST. {print.establishedYear}
          </span>
          <span className="text-[11px] uppercase tracking-[1.5px] transition-transform group-hover:translate-x-1">
            Customize →
          </span>
        </div>
      </div>
    </Link>
  );
}

function PrintCard({ print }: { print: CatalogPrint }) {
  return (
    <Link
      href={`/customize?print=${print.slug}`}
      className="group block w-full border border-[#d7ccba] bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-text hover:shadow-[0_18px_50px_rgba(67,48,29,0.1)]"
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
