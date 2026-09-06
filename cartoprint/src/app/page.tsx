'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { LocationSearch } from '@/components/Storefront/LocationSearch';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { getFeaturedCityPrints, getStateCatalogPrints } from '@/lib/catalog/prints';

const cities = getFeaturedCityPrints(12);
const states = getStateCatalogPrints();

export default function StorefrontPage() {
  const [collection, setCollection] = useState<'city' | 'state'>('city');
  return (
    <main className="discovery-page min-h-screen bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-10 md:px-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-16">
        <div className="relative z-20">
          <p className="text-xs uppercase tracking-[0.2em] text-[#d7a38a]">A place worth keeping</p>
          <h1 className="mt-5 max-w-xl font-display text-6xl leading-[0.95] tracking-tight md:text-8xl">Somewhere,<br /><em>made yours.</em></h1>
          <p className="mb-7 mt-6 max-w-lg text-base leading-7 text-[#dce2dd]/80">Your first city. Your home state. The place you always return to. Find it, choose a map, and make it yours.</p>
          <LocationSearch placeholder="City, town, or state" />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-[#dce2dd]/80">
            <span className="text-[#d7a38a]">Try</span>
            <Link href="/maps/chicago-il?look=on-water&palette=navy">Chicago ↗</Link>
            <Link href="/maps/madison-wi?look=on-water&palette=navy">Madison ↗</Link>
            <Link href="/maps/wisconsin?edition=topographic">Wisconsin ↗</Link>
            <Link href="/maps/tennessee?edition=illustrated">Tennessee ↗</Link>
          </div>
        </div>
        <Link href="/maps/chicago-il?look=on-water&palette=navy" className="group relative mx-auto block w-full max-w-[420px]" aria-label="Explore Chicago's Open Water print">
          <div className="bg-[#f7f4eb] p-4 shadow-[0_30px_80px_#0005] transition-transform duration-500 group-hover:-rotate-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <Image width={1200} height={1600} src="/thumbnails/chicago-open-water.png" alt="Chicago's street network beside Lake Michigan" className="aspect-[3/4] w-full object-cover" />
          </div>
          <div className="mt-4 flex items-center justify-between text-sm"><span>Chicago, Illinois</span><span className="text-[#d7a38a]">Find your version ↗</span></div>
        </Link>
      </section>
      <section className="mx-auto max-w-[1440px] px-6 pb-12 md:px-12" aria-label="New map editions">
        <p className="mb-5 text-xs uppercase tracking-[0.18em] text-[#d7a38a]">New ways to come home</p>
        <div className="grid gap-5 md:grid-cols-3">
          {[{slug:'madison-wi',name:'Madison, mapped & drawn',edition:'landmarks',image:'/thumbnails/madison-landmarks.png',description:'Real streets and shorelines. A few familiar landmarks.'},{slug:'wisconsin',name:'Wisconsin in ink',edition:'illustrated',image:'/illustrations/wisconsin-atlas.png',description:'Northwoods, small towns, and familiar shores.'},{slug:'wisconsin',name:'Wisconsin, up close',edition:'detailed',image:'/thumbnails/wisconsin-landscape-atlas.png',description:'Terrain, water, roads, and places worth finding.'}].map(item => <Link key={item.name} href={`/maps/${item.slug}?edition=${item.edition}`} className="group rounded-sm border border-white/20 p-4">
            <Image src={item.image} width={900} height={900} alt={item.name} className="aspect-square w-full bg-[#f5f0e5] object-contain transition-transform group-hover:scale-[1.02]" />
            <h2 className="mt-4 font-display text-2xl">{item.name} ↗</h2><p className="mt-2 text-sm text-[#dce2dd]/80">{item.description}</p>
          </Link>)}
        </div>
      </section>
      <section id="explore" className="border-t border-white/15 bg-[#f7f4eb] text-[#14201d]">
        <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-12 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div><p className="text-xs uppercase tracking-[0.18em] text-[#986147]">Or follow your curiosity</p><h2 className="mt-3 font-display text-4xl md:text-5xl">Two ways to see your place.</h2></div>
            <div className="flex rounded-full border border-[#14201d]/25 p-1" role="group" aria-label="Explore places">
              {(['city', 'state'] as const).map((kind) => <button key={kind} onClick={() => setCollection(kind)} aria-pressed={collection === kind} className={`rounded-full px-7 py-3 text-sm ${collection === kind ? 'bg-[#173f35] text-white' : ''}`}>{kind === 'city' ? 'Cities & towns' : 'States'}</button>)}
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button onClick={() => setCollection('city')} aria-pressed={collection === 'city'} className={`discovery-collection text-left ${collection === 'city' ? 'is-selected' : ''}`}><Image width={1200} height={1600} src="/thumbnails/chicago-open-water.png" alt="Chicago Open Water map" className="float-right ml-5 hidden h-40 w-28 object-cover sm:block" /><span className="text-xs uppercase tracking-widest">01 / Cities & towns</span><span className="mt-4 block font-display text-4xl">The streets you know.</span><span className="mt-3 block text-base leading-6 opacity-75">Neighborhoods, city grids, and shorelines. Find your favorite view.</span><span className="mt-5 block text-sm">Explore cities →</span></button>
            <button onClick={() => setCollection('state')} aria-pressed={collection === 'state'} className={`discovery-collection text-left ${collection === 'state' ? 'is-selected' : ''}`}><Image width={1693} height={929} src="/illustrations/tennessee-atlas.png" alt="Tennessee illustrated with forests, mountains, and settlements" className="mb-5 aspect-[3/1] w-full object-cover" /><span className="text-xs uppercase tracking-widest">02 / States</span><span className="mt-4 block font-display text-4xl">A whole state of belonging.</span><span className="mt-3 block text-base leading-6 opacity-75">Relief, rivers and lakes. Roads and towns. Or an illustrated atlas.</span><span className="mt-5 block text-sm">Explore states →</span></button>
          </div>
          <p className="mt-8 text-sm text-[#58665d]">{collection === 'city' ? 'A few places to begin. Search above for any city or town.' : 'Topographic and Street Atlas maps for every state. Explore illustrated Wisconsin and Tennessee, or Wisconsin’s detailed Landscape Atlas.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 md:grid-cols-4 lg:grid-cols-6">
            {(collection === 'city' ? cities : states).map((place) => <Link key={place.slug} href={`/maps/${place.slug}`} className="border-b border-[#14201d]/15 py-4 text-base hover:text-[#a35b3f]">{place.name}<span className="float-right opacity-40">↗</span></Link>)}
          </div>
        </div>
      </section>
    </main>
  );
}
