'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { CityArtworkImage } from '@/components/Storefront/CityArtwork';
import { getCityCatalogPrints, getFeaturedCityPrints, getStateCatalogPrints } from '@/lib/catalog/prints';
import { trackDemoEvent } from '@/lib/demoAnalytics';

// The homepage shows a handful; the catalog carries every major city and the
// rest are reached by search. Advertising points at individual city pages.
const CITIES = getFeaturedCityPrints(12);
const CITY_COUNT = getCityCatalogPrints().length;
const STATES = getStateCatalogPrints();
const FEATURED_CITY = CITIES[0];

export default function StorefrontPage() {
  useEffect(() => { trackDemoEvent('home_viewed'); }, []);

  return (
    <main className="studio-topography min-h-screen overflow-x-hidden bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />

      <section className="relative mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-10 px-5 py-10 sm:px-7 md:px-10 lg:min-h-[calc(100vh-70px)] lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)] lg:gap-20 lg:px-16 lg:py-14">
        <div className="pointer-events-none absolute -left-40 bottom-[-280px] h-[620px] w-[620px] rounded-full bg-[#29443c]/45 blur-3xl" aria-hidden />

        <div className="relative z-10 max-w-2xl">
          <div className="studio-kicker">Custom city &amp; state map prints</div>
          <h1 className="mt-7 font-display text-[clamp(4rem,7.6vw,8rem)] font-light leading-[0.79] tracking-[-0.045em]">
            Every place.
            <span className="block italic text-[#cbd4cc]">Your story.</span>
          </h1>
          <p className="mt-8 max-w-xl text-[15px] font-light leading-7 text-[#dce2dd]/72 md:text-[17px]">
            Start with a finished city map, a state Street Atlas, or a Topographic edition. Adjust the color, title, or composition only if you want to.
          </p>

          <div className="mt-8 max-w-2xl">
            <LocationSearch placeholder="Search for a city or town" />
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#dce2dd]/58">
              <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-[#c66b4e]">Popular</span>
              {CITIES.map((city) => (
                <Link
                  key={city.slug}
                  href={`/maps/${city.slug}`}
                  className="border-b border-transparent pb-0.5 transition-colors hover:border-[#dce2dd]/50 hover:text-[#f7f4eb]"
                >
                  {city.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-9 hidden max-w-xl grid-cols-3 border-y border-white/12 py-4 text-[8px] uppercase leading-4 tracking-[0.17em] text-white/45 sm:grid">
            <span>1. Pick a place</span>
            <span className="border-x border-white/12 px-4">2. Adjust the print</span>
            <span className="pl-4">3. See it framed</span>
          </div>
        </div>

        <Link
          href={`/maps/${FEATURED_CITY.slug}`}
          className="group relative flex min-h-[470px] items-center justify-center sm:min-h-[650px]"
          aria-label={`View the ${FEATURED_CITY.name} map print`}
        >
          <div className="absolute left-[3%] top-[7%] hidden text-[8px] uppercase tracking-[0.22em] text-white/30 sm:block">
            Actual rendered artwork
          </div>
          <div className="relative w-[min(82vw,458px)] rotate-[1deg] bg-[#fbfaf6] p-3 shadow-[0_48px_110px_rgba(0,0,0,0.42)] transition-transform duration-500 group-hover:rotate-0 group-hover:scale-[1.015] sm:p-5">
            <CityArtworkImage
              src={`/thumbnails/${FEATURED_CITY.slug}.png`}
              status="ready"
              label={`${FEATURED_CITY.name} street map`}
              alt={`${FEATURED_CITY.name} detailed street map print`}
              className="aspect-[3/4] w-full"
            />
            <div className="absolute -bottom-4 left-1/2 flex min-h-10 -translate-x-1/2 items-center whitespace-nowrap border border-[#14201d]/20 bg-[#f7f4eb] px-5 text-[8px] uppercase tracking-[0.18em] text-[#14201d] shadow-lg">
              Explore {FEATURED_CITY.name} →
            </div>
          </div>
          <div className="absolute right-[2%] top-[18%] -z-10 hidden h-[470px] w-[350px] -rotate-[4deg] border border-white/12 bg-[#22342f] lg:block" />
        </Link>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-[1500px] px-5 py-10 sm:px-7 md:px-10 lg:px-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[12px] text-white/45">
              Also available: state maps in topographic and street editions.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {STATES.slice(0, 8).map((state) => (
                <Link
                  key={state.slug}
                  href={`/maps/${state.slug}`}
                  className="text-[12px] text-white/50 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  {state.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0f1917]/55">
        <div className="mx-auto max-w-[1320px] px-5 py-12 sm:px-7 md:px-10 lg:py-20">
          <div className="max-w-2xl">
            <div className="studio-kicker">Ready-made starting points</div>
            <h2 className="mt-4 font-display text-4xl font-light leading-none md:text-6xl">See your city before you design it.</h2>
            <p className="mt-5 text-[13px] leading-6 text-white/55">Real products, not templates — every available street, in the colour you choose. {CITY_COUNT} cities have their own page, and anywhere else is one search away.</p>
          </div>
          <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {CITIES.map((city, index) => (
              <Link
                key={city.slug}
                href={`/maps/${city.slug}`}
                className="group flex min-h-[180px] flex-col justify-between border border-white/12 bg-white/[0.035] p-4 transition-all hover:-translate-y-1 hover:bg-white/[0.08]"
              >
                <div className="flex items-center justify-between text-[8px] uppercase tracking-[0.16em] text-white/32">
                  <span>City {String(index + 1).padStart(2, '0')}</span>
                  <span>↗</span>
                </div>
                <div>
                  <div className="font-display text-3xl font-light group-hover:text-[#dce6df]">{city.name}</div>
                  <div className="mt-2 text-[8px] uppercase tracking-[0.17em] text-white/42">{city.defaultSubtitle}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
