'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { getFeaturedCatalogPrint, getStateCatalogPrints } from '@/lib/catalog/prints';

const POPULAR_CITIES = [
  'Chicago', 'New York', 'Los Angeles', 'Austin', 'Nashville',
  'Boston', 'Portland', 'Denver', 'Seattle', 'Miami',
];

const CONTOUR_PATHS = [
  'M-20 94C79 8 133 159 244 69S414 42 462 109 555 134 610 74',
  'M-22 123C76 37 140 187 250 96S421 68 469 136 556 160 614 102',
  'M-25 153C72 66 147 216 257 124S428 94 476 163 558 189 618 132',
  'M-28 184C68 95 154 244 264 151S436 121 484 190 561 218 622 162',
  'M-31 217C64 125 161 273 272 179S444 148 492 217 564 247 626 192',
  'M55 381C129 306 199 342 233 260S364 143 423 222 535 257 594 211',
  'M31 412C115 331 199 370 233 285S368 162 432 244 548 280 611 229',
];

export default function StorefrontPage() {
  const [catalogQuery, setCatalogQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const featuredPrint = getFeaturedCatalogPrint();
  const states = getStateCatalogPrints();
  const filteredStates = states.filter((print) => print.name.toLowerCase().includes(catalogQuery.trim().toLowerCase()));
  const visibleStates = catalogQuery || showAll ? filteredStates : filteredStates.slice(0, 12);

  return (
    <main className="min-h-screen bg-[#14201d] text-[#f7f4eb]">
      <section className="studio-topography relative min-h-screen overflow-hidden">
        <StudioHeader />

        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -right-40 top-12 h-[620px] w-[620px] rounded-full border border-white/10" />
          <div className="absolute -right-20 top-32 h-[460px] w-[460px] rounded-full border border-white/10" />
          <div className="absolute bottom-[-240px] left-[22%] h-[500px] w-[500px] rounded-full bg-[#29443c]/40 blur-3xl" />
        </div>

        <div className="relative mx-auto grid min-h-[calc(100vh-70px)] max-w-[1500px] grid-cols-1 items-center gap-12 px-6 py-14 md:px-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)] lg:gap-20 lg:px-16 lg:py-16">
          <div className="relative z-10 max-w-3xl">
            <div className="studio-kicker">Topographic print studio</div>
            <h1 className="mt-7 font-display text-[clamp(4rem,8.2vw,8.5rem)] font-light leading-[0.78] tracking-[-0.045em]">
              Your place,
              <span className="block pl-[0.42em] italic text-[#cbd4cc]">drawn to keep.</span>
            </h1>
            <p className="mt-10 max-w-xl text-[15px] font-light leading-7 text-[#dce2dd]/68 md:text-[17px]">
              Turn any city, state, or hometown into a considered piece of cartographic art. Choose the place; then tune every road, color, and label.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#collection" className="bg-[#f7f4eb] px-6 py-3.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[#14201d] transition-colors hover:bg-[#c66b4e] hover:text-white">
                Select a print
              </a>
              <a href="#studio-search" className="border border-white/25 px-6 py-3.5 text-[9px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:border-white/60 hover:bg-white/10">
                Make your own
              </a>
            </div>

            <div id="studio-search" className="mt-7 max-w-2xl scroll-mt-24">
              <LocationSearch placeholder="Search a city, state, or town" />
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#dce2dd]/52">
                <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-[#c66b4e]">Try</span>
                {POPULAR_CITIES.slice(0, 6).map((city) => (
                  <Link
                    key={city}
                    href={`/design?q=${encodeURIComponent(city)}`}
                    className="border-b border-transparent pb-0.5 transition-colors hover:border-[#dce2dd]/50 hover:text-[#f7f4eb]"
                  >
                    {city}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="relative hidden min-h-[610px] items-center justify-center lg:flex" aria-hidden>
            <div className="absolute left-[2%] top-[10%] text-[9px] uppercase tracking-[0.24em] text-white/35">
              43.0731° N · 89.4012° W
            </div>
            <div className="absolute bottom-[8%] right-[3%] text-right text-[9px] uppercase leading-5 tracking-[0.22em] text-white/35">
              Elevation study 01<br />Contour interval 20m
            </div>

            <div className="relative h-[560px] w-[410px] rotate-[2.5deg] bg-[#f8f6ef] p-5 shadow-[0_45px_100px_rgba(0,0,0,0.38)]">
              <div className="relative h-[440px] overflow-hidden bg-[#e9ede8]">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 620 440" fill="none">
                  <g stroke="#173f35" strokeWidth="1.2" opacity="0.5">
                    {CONTOUR_PATHS.map((path) => <path key={path} d={path} />)}
                  </g>
                  <path d="M70 410C114 349 105 303 172 269s52-110 128-127c76-16 108 17 155-30 46-46 80-53 132-37" stroke="#173f35" strokeWidth="7" />
                  <path d="M-10 318C72 310 94 275 139 277s82 68 143 29 103-7 147-33 82-70 202-55" stroke="#c66b4e" strokeWidth="2.5" />
                  <circle cx="300" cy="142" r="6" fill="#c66b4e" />
                  <circle cx="139" cy="277" r="4" fill="#173f35" />
                </svg>
                <div className="absolute left-5 top-5 border border-[#173f35]/30 bg-[#f8f6ef]/90 px-3 py-2 text-[8px] uppercase leading-4 tracking-[0.18em] text-[#173f35]">
                  Terrain study<br />Madison basin
                </div>
              </div>
              <div className="flex h-[80px] items-center justify-between border-t border-[#173f35] px-2">
                <div>
                  <div className="font-display text-[36px] font-light uppercase tracking-[0.18em] text-[#14201d]">Madison</div>
                  <div className="text-[8px] uppercase tracking-[0.28em] text-[#65716a]">Wisconsin · Est. 1836</div>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-full border border-[#173f35]/30 text-[9px] text-[#173f35]">N</div>
              </div>
              <div className="absolute bottom-2 left-7 right-7 flex justify-between text-[7px] uppercase tracking-[0.18em] text-[#65716a]">
                <span>Terralis studio edition</span>
                <span>01 / 01</span>
              </div>
            </div>
            <div className="absolute right-[-2%] top-[22%] h-[420px] w-[310px] -rotate-[4deg] border border-white/15 bg-[#22342f] -z-10" />
          </div>
        </div>

        <div className="absolute bottom-7 right-8 hidden items-center gap-3 text-[9px] uppercase tracking-[0.2em] text-white/35 xl:flex">
          <span className="h-px w-10 bg-white/25" />
          Designed on your screen · printed for your wall
        </div>
      </section>

      <section id="collection" className="studio-paper-grid scroll-mt-0 bg-[#f2efe7] px-5 py-20 text-[#14201d] md:px-10 lg:px-16 lg:py-28">
        <div className="mx-auto max-w-[1460px]">
          <div className="grid gap-8 border-b border-[#14201d]/15 pb-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <div className="studio-kicker">The state collection</div>
              <h2 className="mt-5 max-w-3xl font-display text-[clamp(3.4rem,6vw,6.6rem)] font-light leading-[0.82] tracking-[-0.04em]">
                Start with a place <span className="italic text-[#65716a]">you already know.</span>
              </h2>
            </div>
            <div className="max-w-lg lg:justify-self-end">
              <p className="text-[14px] leading-7 text-[#66706a]">Each study opens with six complete cartographic directions. Pick one, then refine the crop, detail, color, and typography.</p>
              <label className="mt-6 block border-b border-[#14201d]/35 pb-2">
                <span className="sr-only">Filter state prints</span>
                <input
                  type="search"
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Find a state"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#89918b]"
                />
              </label>
            </div>
          </div>

          <Link
            href={`/design?print=${featuredPrint.slug}`}
            className="group mt-10 grid overflow-hidden border border-[#14201d]/15 bg-[#173f35] text-white transition-transform duration-300 hover:-translate-y-1 lg:grid-cols-[1.15fr_0.85fr]"
          >
            <div className="relative min-h-[360px] overflow-hidden border-b border-white/15 p-8 lg:min-h-[430px] lg:border-b-0 lg:border-r lg:p-12">
              <div className="absolute inset-0 opacity-25" aria-hidden>
                <svg className="h-full w-full" viewBox="0 0 800 460" fill="none">
                  {CONTOUR_PATHS.map((path, index) => <path key={`${path}-${index}`} d={path} stroke="#f7f4eb" strokeWidth="1" transform={`scale(1.3 ${0.8 + index * 0.025})`} />)}
                </svg>
              </div>
              <div className="relative flex h-full flex-col justify-between">
                <span className="text-[8px] uppercase tracking-[0.22em] text-white/50">Featured national study</span>
                <div>
                  <div className="font-display text-[clamp(3.5rem,7vw,7.4rem)] font-light leading-[0.8]">United<br /><span className="italic text-[#cbd4cc]">States.</span></div>
                  <p className="mt-8 max-w-md text-[12px] leading-6 text-white/60">A continental composition ready for state lines, capitals, highway detail, and a palette of your own.</p>
                </div>
              </div>
            </div>
            <div className="flex min-h-[260px] flex-col justify-between bg-[#f8f6ef] p-8 text-[#14201d] lg:p-12">
              <div className="grid grid-cols-2 gap-6 text-[8px] uppercase tracking-[0.17em] text-[#77817b]">
                <span>Country study</span><span className="text-right">Est. 1776</span>
                <span>Six compositions</span><span className="text-right">Fully editable</span>
              </div>
              <div className="mt-14 flex items-end justify-between border-t border-[#14201d]/15 pt-6">
                <div>
                  <div className="font-display text-3xl font-light">Customize this print</div>
                  <div className="mt-2 text-[9px] uppercase tracking-[0.18em] text-[#c66b4e]">Open the studio</div>
                </div>
                <span className="text-3xl transition-transform group-hover:translate-x-1">+</span>
              </div>
            </div>
          </Link>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleStates.map((print, index) => (
              <Link
                key={print.slug}
                href={`/design?print=${print.slug}`}
                className="group flex min-h-[180px] flex-col justify-between border border-[#14201d]/15 bg-[#fbfaf6] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#173f35] hover:shadow-[0_15px_35px_rgba(20,32,29,0.1)]"
              >
                <div className="flex items-start justify-between text-[8px] uppercase tracking-[0.18em] text-[#849087]">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{print.establishedYear ? `Est. ${print.establishedYear}` : 'State study'}</span>
                </div>
                <div>
                  <h3 className="font-display text-[28px] font-light leading-none">{print.name}</h3>
                  <div className="mt-3 flex items-center justify-between border-t border-[#14201d]/10 pt-3 text-[8px] uppercase tracking-[0.14em] text-[#77817b]">
                    <span>{print.slogan || 'United States'}</span>
                    <span className="text-[#c66b4e] transition-transform group-hover:translate-x-1">Open +</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {!catalogQuery && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mx-auto mt-8 block border border-[#173f35] px-7 py-3.5 text-[9px] uppercase tracking-[0.19em] transition-colors hover:bg-[#173f35] hover:text-white"
            >
              View all 50 states + DC
            </button>
          )}
          {catalogQuery && filteredStates.length === 0 && (
            <p className="border border-[#14201d]/15 bg-[#fbfaf6] p-8 text-center text-sm text-[#66706a]">No state print matches “{catalogQuery}”. Try the custom place search above.</p>
          )}
        </div>
      </section>
    </main>
  );
}
