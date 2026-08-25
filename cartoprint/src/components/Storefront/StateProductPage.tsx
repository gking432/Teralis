'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { storeScene } from '@/lib/print/scene';
import type { RegionTheme } from '@/lib/print/regionDesign';
import {
  designsForState,
  sceneForCollectionDesign as sceneForDesign,
  type CollectionDesign,
} from '@/lib/catalog/stateCollection';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import { encodeDesign } from '@/lib/print/designUrl';
import { storeProof } from '@/lib/print/proof';
import { formatPrice, getSizePrice } from '@/lib/print/sizeCatalog';
import { trackDemoEvent } from '@/lib/demoAnalytics';
import { displayTitleText, titleFontCss } from '@/lib/print/title';

/**
 * A regional storefront: one collection of finished designs for one place.
 *
 * The customer is choosing between complete pieces of art — never between
 * abstract style settings. Whichever design is on the easel can be bought as
 * shown or personalized, and the personalizer opens that exact scene: the
 * design encoded here is the single source of truth, so nothing gets re-asked
 * and nothing visually resets across the transition.
 */

export function StateProductPage({ print }: { print: CatalogPrint }) {
  const router = useRouter();
  const DESIGNS = useMemo(() => designsForState(print.slug, print.center), [print.center, print.slug]);
  const [designId, setDesignId] = useState<RegionTheme>(DESIGNS[0].id);
  const design = DESIGNS.find((entry) => entry.id === designId) ?? DESIGNS[0];
  const scene = useMemo(() => sceneForDesign(print, design), [design, print]);
  const [boundary, setBoundary] = useState<GeoJSON.Geometry | null>(() => getCachedBoundary(print.slug)?.geometry ?? null);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Partial<Record<RegionTheme, string>>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [buying, setBuying] = useState(false);
  const [encoded, setEncoded] = useState<string | null>(null);
  const thumbnailRun = useRef(0);

  useEffect(() => {
    trackDemoEvent('product_viewed', { place: print.slug, productKind: 'state-edition', canonical: true });
  }, [print.slug]);

  useEffect(() => {
    if (boundary) return;
    let cancelled = false;
    fetchBoundary(print.slug, print.center, 'state')
      .then((record) => { if (!cancelled) setBoundary(record?.geometry ?? null); })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [boundary, print.center, print.slug]);

  // The design on the easel, at gallery size.
  useEffect(() => {
    if (!boundary) return;
    const controller = new AbortController();
    setStatus('loading');
    renderScene(scene, boundary, { width: 1100, signal: controller.signal })
      .then((image) => {
        if (controller.signal.aborted) return;
        setArtwork(image);
        setStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [boundary, scene]);

  // The rest of the collection, one small render at a time so the easel wins.
  useEffect(() => {
    if (!boundary) return;
    const run = ++thumbnailRun.current;
    let cancelled = false;
    (async () => {
      for (const entry of DESIGNS) {
        if (cancelled || thumbnailRun.current !== run) return;
        try {
          const image = await renderScene(sceneForDesign(print, entry), boundary, { width: 360 });
          if (cancelled || thumbnailRun.current !== run) return;
          setThumbnails((current) => ({ ...current, [entry.id]: image }));
        } catch {
          // A missing thumbnail falls back to the design's name.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [DESIGNS, boundary, print]);

  useEffect(() => { setEncoded(encodeDesign(scene)); }, [scene]);
  const customizeHref = `/customize?print=${encodeURIComponent(print.slug)}${encoded ? `&d=${encodeURIComponent(encoded)}` : ''}`;
  const price = formatPrice(getSizePrice('medium', 'none', false));

  function chooseDesign(entry: CollectionDesign) {
    setDesignId(entry.id);
    trackDemoEvent('region_theme_selected', { place: print.slug, theme: entry.id, surface: 'product' });
  }

  async function buyAsShown() {
    if (buying || !boundary) return;
    setBuying(true);
    try {
      const proof = artwork ?? await renderScene(scene, boundary, { width: 1200 });
      storeScene(scene);
      storeProof(scene, proof);
      trackDemoEvent('product_customize_started', { place: print.slug, palette: scene.region.theme, buyAsShown: true });
      const params = new URLSearchParams({ print: print.slug, o: scene.orientation });
      if (encoded) params.set('d', encoded);
      router.push(`/size?${params.toString()}`);
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="studio-topography min-h-screen bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />
      <main>
        <section className="mx-auto grid max-w-[1500px] gap-8 px-4 py-7 sm:px-7 md:py-10 lg:grid-cols-[minmax(520px,1.18fr)_minmax(390px,0.82fr)] lg:gap-12 lg:px-12 xl:px-16">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between text-[8px] uppercase tracking-[0.22em] text-white/45">
              <span>{print.name} · {design.name}</span>
              <span>{status === 'ready' ? 'Actual rendered artwork' : status === 'error' ? 'Preview unavailable' : 'Drawing the artwork…'}</span>
            </div>
            <div className="relative flex min-h-[570px] items-center justify-center overflow-hidden border border-white/10 bg-white/[0.035] p-5 sm:min-h-[720px] sm:p-9 lg:min-h-[calc(100vh-155px)]">
              {artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artwork} alt={design.id === 'topographic' ? `${print.name} topographic map print with elevation relief and rivers` : `${design.name} ${print.name} map print with a clean road hierarchy`} className="aspect-[3/4] h-auto max-h-[calc(100vh-205px)] w-auto max-w-full shadow-[0_35px_90px_rgba(0,0,0,0.42)]" />
              ) : (
                <div className="grid aspect-[3/4] w-[min(82vw,520px)] place-items-center bg-[#f7f3ea] text-[#3a352e] shadow-[0_35px_90px_rgba(0,0,0,0.42)]">
                  <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-current/20 border-t-current" />
                    <p className="mt-4 font-hand text-2xl">Drawing {print.name}…</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="self-start bg-[#f7f5ef] text-[#14201d] lg:sticky lg:top-5">
            <div className="border-b border-[#14201d]/12 px-6 py-7 sm:px-8 sm:py-9">
              <div className="studio-kicker">The {print.name} collection</div>
              <h1
                className="mt-4 text-[clamp(4rem,6vw,6.4rem)] leading-[0.78]"
                data-selected-font={scene.title.font}
                style={{
                  fontFamily: titleFontCss(scene.title.font),
                  fontSize: scene.title.font === 'hand'
                    ? 'clamp(4rem, 6vw, 6.4rem)'
                    : scene.title.font === 'editorial'
                      ? 'clamp(3.15rem, 4.3vw, 4.8rem)'
                      : 'clamp(3.4rem, 5vw, 5.3rem)',
                  fontWeight: scene.title.font === 'hand' ? 600 : scene.title.font === 'editorial' ? 400 : 500,
                  letterSpacing: scene.title.font === 'hand' ? '-0.045em' : scene.title.font === 'condensed' ? '0.03em' : '-0.025em',
                }}
              >
                {displayTitleText(scene.title)}
              </h1>
              <p className="mt-5 max-w-md text-[13px] leading-6 text-[#53605a]">{design.description}</p>
              <div className="mt-5 flex items-end justify-between border-t border-[#14201d]/12 pt-5">
                <div>
                  <div className="text-[8px] uppercase tracking-[0.18em] text-[#7a847e]">18 × 24 archival print</div>
                  <div className="mt-1 font-display text-4xl font-light">{price}</div>
                </div>
                <div className="text-right text-[9px] leading-4 text-[#7a847e]">Four sizes<br />Framing available</div>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <div className="text-[9px] uppercase tracking-[0.18em] text-[#69736e]">Designs in this collection</div>
              <div className={`mt-3 grid gap-2 ${DESIGNS.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {DESIGNS.map((entry) => {
                  const thumbnail = thumbnails[entry.id];
                  const selected = designId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => chooseDesign(entry)}
                      title={entry.note}
                      className={`overflow-hidden border text-left transition-all ${selected ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                    >
                      <span className="block aspect-[3/4] w-full bg-[#f2efe7]">
                        {thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbnail} alt={`${print.name} ${entry.name} design`} className="h-full w-full object-cover" />
                        ) : (
                          <span
                            className="grid h-full w-full place-items-center px-1 text-center text-[13px] leading-4 text-[#5a635d]"
                            style={{ fontFamily: titleFontCss(entry.font) }}
                          >
                            {entry.name}
                          </span>
                        )}
                      </span>
                      <span className="block px-2 py-1.5 text-center text-[9px] font-medium uppercase tracking-[0.08em]">
                        {entry.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button type="button" onClick={buyAsShown} disabled={buying || status !== 'ready'} className="mt-6 flex min-h-14 w-full items-center justify-center bg-[#173f35] px-6 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:opacity-50">
                {buying ? 'Preparing the print…' : 'Buy as shown'}
              </button>
              <Link href={customizeHref} onClick={() => trackDemoEvent('product_customize_started', { place: print.slug, palette: scene.region.theme })} className="mt-3 flex min-h-12 w-full items-center justify-center border border-[#173f35] px-6 text-[10px] font-medium uppercase tracking-[0.18em] text-[#173f35] transition-colors hover:bg-[#e9eee9]">
                Personalize this design
              </Link>
              <p className="mt-3 text-center text-[9px] leading-4 text-[#7a847e]">Change the wording and lettering, or add your own labels, stars, and hearts.</p>
            </div>
          </aside>
        </section>

        <section className="border-y border-white/10 bg-[#0f1917]/55">
          <div className="mx-auto grid max-w-[1320px] gap-8 px-6 py-14 md:grid-cols-3 md:px-10">
            <Story number="01" title="Geography first">Every edition uses real boundaries, roads, water, place data, and elevation appropriate to its purpose.</Story>
            <Story number="02" title="Make it yours">What you see is what you personalize — the exact design carries into the studio, lakes, fonts, and all.</Story>
            <Story number="03" title="Made for print">Vector-like linework, guarded contrast, and a shared export model keep the final artwork crisp at full size.</Story>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1320px] gap-8 px-6 py-16 md:grid-cols-[0.8fr_1.2fr] md:px-10 lg:py-24">
          <div>
            <div className="studio-kicker">Made for somewhere</div>
            <h2 className="mt-4 font-display text-5xl font-light leading-[0.95]">Not just where.<br /><span className="font-hand text-[#d9b09d]">What happened there.</span></h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {['Where We Met', 'Our First Home', 'Home', 'Since 2018', 'Every Summer', 'Always Here'].map((label) => (
              <div key={label} className="grid min-h-32 place-items-center border border-white/12 bg-white/[0.035] p-4 text-center font-hand text-3xl text-[#e7ded2]">{label}</div>
            ))}
          </div>
        </section>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#14201d]/15 bg-[#f7f5ef]/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[#14201d] shadow-[0_-12px_35px_rgba(0,0,0,0.2)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <span className="px-2 font-display text-3xl font-light">{price}</span>
          <button type="button" onClick={buyAsShown} disabled={buying || status !== 'ready'} className="flex min-h-12 items-center justify-center bg-[#173f35] px-4 text-[10px] font-medium uppercase tracking-[0.16em] text-white disabled:opacity-45">
            {buying ? 'Preparing…' : 'Buy this print'}
          </button>
        </div>
        <Link href={customizeHref} className="mt-1.5 block text-center text-[10px] text-[#68736d] underline underline-offset-4">
          or personalize it first
        </Link>
      </div>
    </div>
  );
}

function Story({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <article><div className="text-[9px] uppercase tracking-[0.2em] text-[#c28368]">{number}</div><h3 className="mt-3 font-display text-3xl font-light">{title}</h3><p className="mt-3 text-[12px] leading-6 text-white/55">{children}</p></article>;
}
