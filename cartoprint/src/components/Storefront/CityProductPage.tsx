'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { getCityCatalogPrints } from '@/lib/catalog/prints';
import { CITY_PRODUCT_PALETTES, createCityProductScene } from '@/lib/catalog/cityProduct';
import { CityArtworkImage, useCityArtwork } from '@/components/Storefront/CityArtwork';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { trackDemoEvent } from '@/lib/demoAnalytics';
import { encodeDesign } from '@/lib/print/designUrl';
import { getPalette } from '@/lib/print/palettes';
import { renderScene } from '@/lib/print/renderScene';
import { storeScene } from '@/lib/print/scene';
import { storeProof } from '@/lib/print/proof';
import { formatPrice, getSizePrice } from '@/lib/print/sizeCatalog';

type PreviewMode = 'artwork' | 'room';

export function CityProductPage({
  print,
  customizeBaseHref,
  canonical = true,
}: {
  print: CatalogPrint;
  customizeBaseHref: string;
  canonical?: boolean;
}) {
  const router = useRouter();
  const [paletteId, setPaletteId] = useState('slate');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('artwork');
  const [customizeHref, setCustomizeHref] = useState(customizeBaseHref);
  const [buying, setBuying] = useState(false);
  const scene = useMemo(() => createCityProductScene(print, paletteId), [paletteId, print]);
  const staticArtwork = canonical && paletteId === 'slate' ? `/thumbnails/${print.slug}.png` : null;
  const { image, status } = useCityArtwork(scene, 1100, !staticArtwork);
  const visibleArtwork = image || staticArtwork;
  const otherCities = getCityCatalogPrints().filter((city) => city.slug !== print.slug).slice(0, 4);

  useEffect(() => {
    trackDemoEvent('product_viewed', {
      place: print.slug,
      productKind: print.placeType || print.kind,
      canonical,
    });
  }, [canonical, print.kind, print.placeType, print.slug]);

  useEffect(() => {
    const encoded = encodeDesign(scene);
    if (!encoded) return;
    const url = new URL(customizeBaseHref, window.location.origin);
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid') {
        url.searchParams.set(key, value);
      }
    });
    url.searchParams.set('d', encoded);
    setCustomizeHref(`${url.pathname}?${url.searchParams.toString()}`);
  }, [customizeBaseHref, scene]);

  function choosePalette(nextPalette: string) {
    setPaletteId(nextPalette);
    trackDemoEvent('product_palette_selected', { place: print.slug, palette: nextPalette });
  }

  function startCustomizing() {
    trackDemoEvent('product_customize_started', { place: print.slug, palette: paletteId });
  }

  const price = formatPrice(getSizePrice('medium', 'none', false));

  /** The finished design goes straight to size and framing, exactly as shown. */
  async function buyAsShown() {
    if (buying || status !== 'ready') return;
    setBuying(true);
    try {
      // The default colorway shows a pre-rendered thumbnail, so the live
      // artwork may not exist yet — render the real proof on demand.
      const proof = image ?? await renderScene(scene, null, { width: 1200 });
      storeScene(scene);
      storeProof(scene, proof);
      trackDemoEvent('product_customize_started', { place: print.slug, palette: paletteId, buyAsShown: true });
      router.push(`/size?print=${encodeURIComponent(print.slug)}&o=${scene.orientation}`);
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="studio-topography min-h-screen bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />

      <main>
        <section className="mx-auto grid max-w-[1500px] gap-8 px-4 py-7 sm:px-7 md:py-10 lg:grid-cols-[minmax(520px,1.2fr)_minmax(360px,0.8fr)] lg:gap-12 lg:px-12 xl:px-16">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[8px] uppercase tracking-[0.22em] text-white/45">Actual map preview</div>
              <div className="flex border border-white/15 bg-[#14201d]/70 p-1">
                {(['artwork', 'room'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewMode(mode)}
                    aria-pressed={previewMode === mode}
                    className={`min-h-9 px-4 text-[9px] uppercase tracking-[0.16em] transition-colors ${previewMode === mode ? 'bg-[#f7f4eb] text-[#14201d]' : 'text-white/55 hover:text-white'}`}
                  >
                    {mode === 'artwork' ? 'Artwork' : 'In a room'}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative flex min-h-[520px] items-center justify-center overflow-hidden border border-white/10 bg-white/[0.035] p-5 sm:min-h-[680px] sm:p-9 lg:min-h-[calc(100vh-165px)]">
              {previewMode === 'artwork' ? (
                <CityArtworkImage
                  src={visibleArtwork}
                  status={status}
                  label={`Drawing ${print.name}'s streets`}
                  alt={`${print.name}, ${print.defaultSubtitle} detailed street map print`}
                  className="aspect-[3/4] w-[min(82vw,520px)] max-w-full shadow-[0_35px_90px_rgba(0,0,0,0.42)]"
                />
              ) : (
                <RoomProductPreview image={visibleArtwork} print={print} status={status} />
              )}
              {status === 'loading' && image && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#14201d]/85 px-4 py-2 text-[8px] uppercase tracking-[0.18em] text-white/75">
                  Updating artwork
                </div>
              )}
            </div>
          </div>

          <aside className="self-start bg-[#f7f5ef] text-[#14201d] lg:sticky lg:top-5">
            <div className="border-b border-[#14201d]/12 px-6 py-7 sm:px-8 sm:py-9">
              <div className="studio-kicker">Detailed city print</div>
              <h1 className="mt-5 font-display text-[clamp(3.4rem,6vw,6rem)] font-light leading-[0.82] tracking-[-0.035em]">
                {print.name}
              </h1>
              <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-[#7a847e]">{print.defaultSubtitle}</p>
              <p className="mt-6 max-w-md text-[13px] leading-6 text-[#53605a]">
                Every available street, shaped into a print that is already composed for the wall. Buy it as shown, or make a few changes that turn it into your print.
              </p>
              <div className="mt-6 flex items-end justify-between border-t border-[#14201d]/12 pt-5">
                <div>
                  <div className="text-[8px] uppercase tracking-[0.18em] text-[#7a847e]">18 × 24 archival print</div>
                  <div className="mt-1 font-display text-4xl font-light">{price}</div>
                </div>
                <div className="text-right text-[9px] leading-4 text-[#7a847e]">Four sizes<br />Framing available</div>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <div className="text-[9px] uppercase tracking-[0.18em] text-[#69736e]">Choose a starting color</div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {CITY_PRODUCT_PALETTES.map((id) => {
                  const palette = getPalette(id);
                  const selected = id === paletteId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => choosePalette(id)}
                      aria-pressed={selected}
                      className={`flex min-h-[62px] items-center gap-3 border px-3 text-left transition-all ${selected ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-black/10">
                        <span className="h-full flex-1" style={{ backgroundColor: palette.colors.land }} />
                        <span className="h-full flex-1" style={{ backgroundColor: palette.colors.roads }} />
                        <span className="h-full flex-1" style={{ backgroundColor: palette.colors.water }} />
                      </span>
                      <span>
                        <span className="block text-[10px] font-medium uppercase tracking-[0.13em]">{palette.name}</span>
                        <span className="mt-1 block text-[9px] text-[#7b847f]">{palette.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={buyAsShown}
                disabled={buying || status !== 'ready'}
                className="mt-6 flex min-h-14 w-full items-center justify-center bg-[#173f35] px-6 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:opacity-50"
              >
                {buying ? 'Preparing the print…' : 'Buy as shown'}
              </button>
              <Link
                href={customizeHref}
                onClick={startCustomizing}
                className="mt-3 flex min-h-12 w-full items-center justify-center border border-[#173f35] px-6 text-[10px] font-medium uppercase tracking-[0.18em] text-[#173f35] transition-colors hover:bg-[#e9eee9]"
              >
                Personalize this map
              </Link>
              <p className="mt-3 text-center text-[9px] leading-4 text-[#7a847e]">Add your wording, a heart where it happened, and the places that matter.</p>
              <Link href="/" className="mt-4 flex min-h-11 items-center justify-center text-[9px] uppercase tracking-[0.16em] text-[#68736d] underline underline-offset-4">
                Choose another place
              </Link>
            </div>

            <div className="grid grid-cols-3 border-t border-[#14201d]/12 text-center text-[8px] uppercase leading-4 tracking-[0.14em] text-[#68736d]">
              <span className="px-2 py-4">Every street</span>
              <span className="border-x border-[#14201d]/12 px-2 py-4">Print safe</span>
              <span className="px-2 py-4">Four sizes</span>
            </div>
          </aside>
        </section>

        <section className="border-y border-white/10 bg-[#0f1917]/55">
          <div className="mx-auto grid max-w-[1320px] gap-8 px-6 py-12 md:grid-cols-3 md:px-10 lg:py-16">
            <ProductFact number="01" title="We draw the whole network">Residential streets stay in the artwork instead of disappearing when the view changes.</ProductFact>
            <ProductFact number="02" title="You choose the feeling">Pick a restrained starting palette, then unlock custom colors in the studio if you need them.</ProductFact>
            <ProductFact number="03" title="The print stays safe">Titles, borders, contrast, and crop are gated so every path ends with artwork that can actually be printed.</ProductFact>
          </div>
        </section>

        {canonical && otherCities.length > 0 && (
          <section className="mx-auto max-w-[1320px] px-6 py-14 md:px-10 lg:py-20">
            <div className="flex items-end justify-between gap-5">
              <div>
                <div className="studio-kicker">More city studies</div>
                <h2 className="mt-4 font-display text-4xl font-light md:text-5xl">Start somewhere else</h2>
              </div>
              <Link href="/" className="text-[9px] uppercase tracking-[0.17em] text-white/55 underline underline-offset-4">Search any place</Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {otherCities.map((city) => (
                <Link key={city.slug} href={`/maps/${city.slug}`} className="group border border-white/12 bg-white/[0.035] p-4 transition-colors hover:bg-white/[0.08] md:p-5">
                  <div className="text-[8px] uppercase tracking-[0.17em] text-white/35">Detailed street study</div>
                  <div className="mt-8 font-display text-3xl font-light group-hover:text-[#dce6df]">{city.name}</div>
                  <div className="mt-2 text-[8px] uppercase tracking-[0.17em] text-white/42">{city.defaultSubtitle}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function RoomProductPreview({
  image,
  print,
  status,
}: {
  image: string | null;
  print: CatalogPrint;
  status: 'loading' | 'ready' | 'error';
}) {
  return (
    <div className="relative aspect-[3/2] w-full max-w-[820px] overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
      <Image src="/mockups/studio/scandinavian-oak.webp" alt={`${print.name} print in a modern room`} fill priority className="object-cover" sizes="(min-width: 1024px) 58vw, 92vw" />
      <div className="absolute left-[49%] top-[42%] aspect-[3/4] w-[25%] -translate-x-1/2 -translate-y-1/2 bg-[#1c1e1c] p-[1.4%] shadow-[0_14px_20px_rgba(0,0,0,0.38)]">
        <div className="relative h-full w-full overflow-hidden bg-[#f7f4eb]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-fill" />
          ) : (
            <div className="absolute inset-0 grid place-items-center px-2 text-center text-[5px] uppercase tracking-[0.12em] text-[#68736d]">
              {status === 'error' ? 'Preview unavailable' : 'Drawing streets'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductFact({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/15 pt-5">
      <div className="text-[8px] uppercase tracking-[0.2em] text-[#c66b4e]">{number}</div>
      <h3 className="mt-4 font-display text-2xl font-light">{title}</h3>
      <p className="mt-3 max-w-sm text-[12px] leading-6 text-white/52">{children}</p>
    </div>
  );
}
