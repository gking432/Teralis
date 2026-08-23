'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { CityArtworkImage } from '@/components/Storefront/CityArtwork';
import { getCityCatalogPrints } from '@/lib/catalog/prints';
import { trackDemoEvent } from '@/lib/demoAnalytics';

const CITIES = getCityCatalogPrints();
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
            Start with a finished city map or an illustrated state atlas. Change the color, wording, landmarks, and little details only if you want to.
          </p>

          <div className="mt-8 max-w-2xl">
            <LocationSearch placeholder="Search for a city or town" />
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#dce2dd]/58">
              <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-[#c66b4e]">Popular</span>
              <Link href="/maps/wisconsin/doodle" className="border-b border-transparent pb-0.5 font-medium text-[#e1b39e] transition-colors hover:border-[#e1b39e]">
                Wisconsin Doodle Atlas
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
        <Link href="/maps/wisconsin/doodle" className="group mx-auto grid max-w-[1500px] gap-8 px-5 py-12 sm:px-7 md:px-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:px-16 lg:py-20">
          <div className="max-w-xl">
            <div className="text-[9px] uppercase tracking-[0.22em] text-[#a45c45]">New · illustrated state edition</div>
            <h2 className="mt-5 font-hand text-[clamp(4rem,7vw,7rem)] font-semibold leading-[0.8] tracking-[-0.045em]">Wisconsin,<br />drawn like a story.</h2>
            <p className="mt-6 max-w-lg text-[13px] leading-6 text-[#53605a]">
              Northwoods trees, Driftless hills, Great Lakes lettering, cities, landmarks, and the places only you know. Buy the finished atlas or move every personal detail yourself.
            </p>
            <span className="mt-7 inline-flex min-h-12 items-center border border-[#173f35] bg-[#173f35] px-6 text-[9px] font-medium uppercase tracking-[0.19em] text-white transition-colors group-hover:bg-[#c66b4e]">
              Explore the Doodle Atlas →
            </span>
          </div>
          <div className="relative min-h-[390px] overflow-hidden border border-[#14201d]/15 bg-[#f8f3e9] p-6 sm:min-h-[470px] sm:p-10">
            <div className="absolute left-[9%] top-[11%] font-hand text-4xl -rotate-6 text-[#365044]">Up North</div>
            <div className="absolute right-[7%] top-[9%] text-[8px] uppercase tracking-[0.2em] text-[#68736e]">Doodle Atlas No. 01</div>
            <svg viewBox="0 0 520 420" className="absolute inset-x-[10%] bottom-[4%] h-[78%] w-[80%] overflow-visible" aria-hidden="true">
              <path d="M171 17 231 13 258 31 301 34 334 54 338 88 366 109 372 143 395 172 381 207 398 241 375 268 363 303 331 321 313 351 275 344 249 371 218 349 187 357 170 326 140 313 146 278 125 254 139 221 123 191 143 162 137 128 157 99 151 64Z" fill="#eee4d2" stroke="#27473d" strokeWidth="4" strokeLinejoin="round" />
              <path d="M175 100c18-17 29-12 38 4m-45 11c20-16 35-11 44 5m-37 10c18-15 28-9 37 5M180 89l-17 39m43-39-13 48" fill="none" stroke="#315a47" strokeWidth="4" strokeLinecap="round" />
              <path d="m168 258 24-26 22 27 21-18 28 33m-109 0 31-33 23 27" fill="none" stroke="#a65d47" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m254 208 4 11 12 1-9 8 3 12-10-7-10 7 3-12-9-8 12-1Z" fill="#c26749" stroke="#65392e" strokeWidth="2" />
              <path d="M337 96c22 34 26 75 20 113M342 82c17 26 30 41 46 56" fill="none" stroke="#5c8090" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
              <text x="271" y="302" fill="#243f37" fontSize="19" fontFamily="var(--font-hand), cursive" transform="rotate(-5 271 302)">Where We Met</text>
              <text x="221" y="407" fill="#68736e" fontSize="12" letterSpacing="3">WISCONSIN</text>
            </svg>
            <div className="absolute bottom-5 right-6 text-[9px] uppercase tracking-[0.16em] text-[#758079]">Drag · label · remember</div>
          </div>
        </Link>
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
