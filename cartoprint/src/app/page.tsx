'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { CityArtworkImage } from '@/components/Storefront/CityArtwork';
import { getCityCatalogPrints, getStateCatalogPrints } from '@/lib/catalog/prints';
import { trackDemoEvent } from '@/lib/demoAnalytics';

const CITIES = getCityCatalogPrints();
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
            Start with a finished city map, a state Street Atlas, or a Topographic edition. Change the color, wording, and personal markers only if you want to.
          </p>

          <div className="mt-8 max-w-2xl">
            <LocationSearch placeholder="Search for a city or town" />
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#dce2dd]/58">
              <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-[#c66b4e]">Popular</span>
              <Link href="/maps/wisconsin" className="border-b border-transparent pb-0.5 font-medium text-[#e1b39e] transition-colors hover:border-[#e1b39e]">
                Wisconsin collection
              </Link>
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
            <span className="border-x border-white/12 px-4">2. Make it yours</span>
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
              label="Madison street map"
              alt="Madison, Wisconsin detailed street map print"
              className="aspect-[3/4] w-full"
            />
            <div className="absolute -bottom-4 left-1/2 flex min-h-10 -translate-x-1/2 items-center whitespace-nowrap border border-[#14201d]/20 bg-[#f7f4eb] px-5 text-[8px] uppercase tracking-[0.18em] text-[#14201d] shadow-lg">
              Explore Madison →
            </div>
          </div>
          <div className="absolute right-[2%] top-[18%] -z-10 hidden h-[470px] w-[350px] -rotate-[4deg] border border-white/12 bg-[#22342f] lg:block" />
        </Link>
      </section>

      <section className="border-y border-white/10 bg-[#e9e1d3] text-[#14201d]">
        <Link href="/maps/wisconsin" className="group mx-auto grid max-w-[1500px] gap-8 px-5 py-12 sm:px-7 md:px-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:px-16 lg:py-20">
          <div className="max-w-xl">
            <div className="text-[9px] uppercase tracking-[0.22em] text-[#a45c45]">The state collection</div>
            <h2 className="mt-5 font-display text-[clamp(3.7rem,6vw,6.5rem)] font-light leading-[0.82] tracking-[-0.04em]">Two ways to<br />read Wisconsin.</h2>
            <p className="mt-6 max-w-lg text-[13px] leading-6 text-[#53605a]">
              Choose the land itself—elevation, rivers, lakes, and open water—or the human network of roads, cities, and town names.
            </p>
            <span className="mt-7 inline-flex min-h-12 items-center border border-[#173f35] bg-[#173f35] px-6 text-[9px] font-medium uppercase tracking-[0.19em] text-white transition-colors group-hover:bg-[#c66b4e]">
              Explore Wisconsin →
            </span>
          </div>
          <div className="grid min-h-[390px] gap-3 sm:min-h-[470px] sm:grid-cols-2">
            <div className="relative overflow-hidden border border-[#14201d]/15 bg-[#173f35] p-7 text-[#f7f4eb] sm:p-9">
              <div className="text-[8px] uppercase tracking-[0.2em] text-white/50">Edition 01</div>
              <div className="absolute inset-x-0 top-1/4 grid gap-5 opacity-25" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((line) => <span key={line} className="block h-px -rotate-3 bg-white" />)}
              </div>
              <div className="relative mt-24 font-condensed text-4xl uppercase tracking-[0.08em]">Topographic</div>
              <p className="relative mt-3 text-[11px] leading-5 text-white/65">Elevation · rivers · lakes · water</p>
            </div>
            <div className="relative overflow-hidden border border-[#14201d]/15 bg-[#f8f3e9] p-7 sm:p-9">
              <div className="text-[8px] uppercase tracking-[0.2em] text-[#758079]">Edition 02</div>
              <div className="absolute inset-8 top-20 opacity-25" aria-hidden="true">
                <span className="absolute left-1/2 h-full w-px rotate-12 bg-[#243f37]" />
                <span className="absolute top-1/2 h-px w-full -rotate-12 bg-[#243f37]" />
                <span className="absolute left-1/4 h-full w-px -rotate-6 bg-[#243f37]" />
                <span className="absolute top-1/3 h-px w-full rotate-6 bg-[#243f37]" />
              </div>
              <div className="relative mt-24 font-display text-4xl">Street Atlas</div>
              <p className="relative mt-3 text-[11px] leading-5 text-[#53605a]">Roads · cities · town names</p>
            </div>
          </div>
        </Link>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-[1500px] px-5 py-12 sm:px-7 md:px-10 lg:px-16 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="studio-kicker">The state collection</div>
              <h2 className="mt-4 font-display text-4xl font-light leading-none md:text-5xl">Every state, already composed.</h2>
            </div>
            <p className="max-w-sm text-[12px] leading-6 text-white/50">
              Topographic and Street Atlas editions for all fifty states, built from the same production cartography used in the editor and final print.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2.5">
            {STATES.map((state) => (
              <Link
                key={state.slug}
                href={`/maps/${state.slug}`}
                className="text-[13px] text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                {state.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0f1917]/55">
        <div className="mx-auto max-w-[1320px] px-5 py-12 sm:px-7 md:px-10 lg:py-20">
          <div className="max-w-2xl">
            <div className="studio-kicker">Ready-made starting points</div>
            <h2 className="mt-4 font-display text-4xl font-light leading-none md:text-6xl">See your city before you design it.</h2>
            <p className="mt-5 text-[13px] leading-6 text-white/55">These pages are real products, not templates. Each one starts with its own streets, water, title, and framing.</p>
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
