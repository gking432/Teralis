'use client';

import Link from 'next/link';
import { LocationSearch } from '@/components/Storefront/LocationSearch';

const POPULAR_CITIES = [
  'Chicago', 'New York', 'Los Angeles', 'Austin', 'Nashville',
  'Boston', 'Portland', 'Denver', 'Seattle', 'Miami',
];

export default function StorefrontPage() {
  return (
    <main className="min-h-screen bg-[#f8f4ec] text-text">
      <section className="relative flex min-h-screen flex-col overflow-hidden bg-[#f6efe1]">
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

        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-20 pt-10 text-center md:px-10">
          <div className="mb-5 text-[11px] font-medium uppercase tracking-[2px] text-text-muted">
            Fine-art map prints of any place
          </div>
          <h1 className="font-display text-[52px] font-light leading-[0.95] tracking-[-1.5px] md:text-[78px]">
            Where do you call home?
          </h1>
          <p className="mt-7 text-lg leading-8 text-text-muted">
            Type a state, city, or town. We&rsquo;ll show you a print, ready to customize and order.
          </p>

          <div className="mt-9 w-full">
            <LocationSearch />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] text-text-muted">
            <span className="uppercase tracking-[1.4px] text-[10px]">Popular:</span>
            {POPULAR_CITIES.map((city) => (
              <Link
                key={city}
                href={`/design?q=${encodeURIComponent(city)}`}
                className="underline-offset-4 transition-colors hover:text-text hover:underline"
              >
                {city}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
