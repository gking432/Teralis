'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { getCityCatalogPrints, getStateCatalogPrints } from '@/lib/catalog/prints';
import { trackDemoEvent } from '@/lib/demoAnalytics';

/**
 * The "design your own map" landing page.
 *
 * Product ads point at a specific finished print; this page is the other
 * entry — for the audience that came to make something rather than to buy
 * something already made. It opens on the search, because for these visitors
 * the first question really is "which place?", and it says plainly that the
 * map is drawn for them before they change anything.
 *
 * Links that already carry a place (old bookmarks, deep links) skip the
 * search entirely and open the studio, as this route always did.
 */

const POPULAR_CITIES = getCityCatalogPrints().slice(0, 6);
const POPULAR_STATES = ['wisconsin', 'michigan', 'colorado', 'texas', 'california', 'new-york'];

export function DesignPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);

  // A place in the URL means this is a deep link, not a browsing visit.
  const hasPlace = Boolean(
    searchParams.get('place') || searchParams.get('q') || searchParams.get('print') || searchParams.get('bbox'),
  );

  useEffect(() => {
    if (!hasPlace) {
      trackDemoEvent('design_landing_viewed', { entry: 'search' });
      return;
    }
    setRedirecting(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('style');
    router.replace(`/customize?${next.toString()}`);
  }, [hasPlace, router, searchParams]);

  if (redirecting || hasPlace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#14201d] text-[#f7f4eb]">
        <div className="text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="mt-4 text-[9px] uppercase tracking-[0.2em] text-white/55">Opening your map</p>
        </div>
      </main>
    );
  }

  const states = getStateCatalogPrints().filter((print) => POPULAR_STATES.includes(print.slug));

  return (
    <main className="studio-topography min-h-screen bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />

      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 md:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="studio-kicker justify-center">Design your own map print</div>
          <h1 className="mt-7 font-display text-[clamp(3rem,6.4vw,5.6rem)] font-light leading-[0.85] tracking-[-0.04em]">
            Any place on earth,<br />
            <span className="italic text-[#cbd4cc]">drawn for your wall.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-[15px] font-light leading-7 text-[#dce2dd]/72">
            Start with the place. We draw a finished print from real streets, water, and terrain —
            then you change the wording, colors, and details that make it yours.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl">
          <LocationSearch autoFocus placeholder="Search any city, town, state, island, park…" />
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <div className="text-center text-[9px] uppercase tracking-[0.2em] text-white/35">Or start from a favorite</div>
          <div className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-2">
            {POPULAR_CITIES.map((city) => (
              <Link
                key={city.slug}
                href={`/maps/${city.slug}`}
                onClick={() => trackDemoEvent('design_landing_shortcut', { place: city.slug })}
                className="border border-white/15 px-4 py-2 text-[12px] text-white/70 transition-colors hover:border-white/45 hover:text-white"
              >
                {city.name}
              </Link>
            ))}
            {states.map((state) => (
              <Link
                key={state.slug}
                href={`/maps/${state.slug}`}
                onClick={() => trackDemoEvent('design_landing_shortcut', { place: state.slug })}
                className="border border-white/15 px-4 py-2 text-[12px] text-white/70 transition-colors hover:border-white/45 hover:text-white"
              >
                {state.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl gap-8 border-t border-white/10 pt-10 sm:grid-cols-3">
          <Step number="01" title="Pick a place">Any city, town, state, island, or park. We find its real geography.</Step>
          <Step number="02" title="Make it yours">Wording, dates, markers, colors — drag anything directly on the print.</Step>
          <Step number="03" title="See it framed">Choose the size and finish, and see it on a wall before you buy.</Step>
        </div>
      </section>
    </main>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-[#c28368]">{number}</div>
      <h2 className="mt-3 font-display text-2xl font-light">{title}</h2>
      <p className="mt-2 text-[12px] leading-6 text-white/52">{children}</p>
    </div>
  );
}
