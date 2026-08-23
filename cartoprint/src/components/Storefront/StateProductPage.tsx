'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { applyPalette, createPrintScene, normalizeScene, storeScene, type PrintScene } from '@/lib/print/scene';
import { getPalette } from '@/lib/print/palettes';
import { illustrationForTheme, type IllustrationTheme } from '@/lib/print/decorations';
import { fetchBoundary, getCachedBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import { encodeDesign } from '@/lib/print/designUrl';
import { storeProof } from '@/lib/print/proof';
import { formatPrice, getSizePrice } from '@/lib/print/sizeCatalog';
import { trackDemoEvent } from '@/lib/demoAnalytics';

const DIRECTIONS: Array<{
  id: IllustrationTheme;
  name: string;
  note: string;
  palette: string;
  font: PrintScene['title']['font'];
}> = [
  { id: 'doodle-atlas', name: 'Doodle Atlas', note: 'Northwoods, bluffs, lakes, and personal landmarks', palette: 'bone', font: 'hand' },
  { id: 'heritage', name: 'Heritage', note: 'Warm cartography with restrained illustrated markers', palette: 'terracotta', font: 'editorial' },
  { id: 'topographic', name: 'Topographic', note: 'Quiet terrain with modern atlas lettering', palette: 'forest', font: 'condensed' },
];

function initialScene(print: CatalogPrint): PrintScene {
  const scene = createPrintScene(print, 'portrait', getPalette('bone'));
  return normalizeScene({
    ...scene,
    title: {
      ...scene.title,
      enabled: true,
      text: print.name,
      subtitle: 'The Great Lakes State',
      detail: 'Made for somewhere',
      font: 'hand',
    },
  });
}

export function StateProductPage({ print }: { print: CatalogPrint }) {
  const router = useRouter();
  const [scene, setScene] = useState(() => initialScene(print));
  const [boundary, setBoundary] = useState<GeoJSON.Geometry | null>(() => getCachedBoundary(print.slug)?.geometry ?? null);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [buying, setBuying] = useState(false);
  const [encoded, setEncoded] = useState<string | null>(null);

  useEffect(() => {
    trackDemoEvent('product_viewed', { place: print.slug, productKind: 'state-doodle', canonical: true });
  }, [print.slug]);

  useEffect(() => {
    if (boundary) return;
    let cancelled = false;
    fetchBoundary(print.slug, print.center, 'state')
      .then((record) => { if (!cancelled) setBoundary(record?.geometry ?? null); })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [boundary, print.center, print.slug]);

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

  useEffect(() => { setEncoded(encodeDesign(scene)); }, [scene]);
  const customizeHref = `/customize?print=${encodeURIComponent(print.slug)}${encoded ? `&d=${encodeURIComponent(encoded)}` : ''}`;
  const price = formatPrice(getSizePrice('medium', 'none', false));

  function chooseDirection(direction: typeof DIRECTIONS[number]) {
    setScene((current) => {
      const recolored = applyPalette(current, getPalette(direction.palette));
      return normalizeScene({
        ...recolored,
        illustration: illustrationForTheme(direction.id, current.illustration, print.slug),
        title: { ...recolored.title, enabled: true, font: direction.font },
      });
    });
    trackDemoEvent('illustration_theme_selected', { place: print.slug, theme: direction.id, surface: 'product' });
  }

  async function buyAsShown() {
    if (buying || !boundary) return;
    setBuying(true);
    try {
      const proof = artwork ?? await renderScene(scene, boundary, { width: 1200 });
      storeScene(scene);
      storeProof(scene, proof);
      trackDemoEvent('product_customize_started', { place: print.slug, palette: scene.illustration.theme, buyAsShown: true });
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
              <span>Wisconsin · illustrated state edition</span>
              <span>{status === 'ready' ? 'Actual rendered artwork' : status === 'error' ? 'Preview unavailable' : 'Drawing the atlas…'}</span>
            </div>
            <div className="relative flex min-h-[570px] items-center justify-center overflow-hidden border border-white/10 bg-white/[0.035] p-5 sm:min-h-[720px] sm:p-9 lg:min-h-[calc(100vh-155px)]">
              {artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artwork} alt="Wisconsin Doodle Atlas print with forests, lakes, bluffs, and landmarks" className="aspect-[3/4] h-auto max-h-[calc(100vh-205px)] w-auto max-w-full shadow-[0_35px_90px_rgba(0,0,0,0.42)]" />
              ) : (
                <div className="grid aspect-[3/4] w-[min(82vw,520px)] place-items-center bg-[#f7f3ea] text-[#3a352e] shadow-[0_35px_90px_rgba(0,0,0,0.42)]">
                  <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-current/20 border-t-current" />
                    <p className="mt-4 font-hand text-2xl">Drawing Wisconsin…</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="self-start bg-[#f7f5ef] text-[#14201d] lg:sticky lg:top-5">
            <div className="border-b border-[#14201d]/12 px-6 py-7 sm:px-8 sm:py-9">
              <div className="studio-kicker">The illustrated state collection</div>
              <h1 className="mt-4 font-hand text-[clamp(4rem,6vw,6.4rem)] font-semibold leading-[0.78] tracking-[-0.045em]">Wisconsin</h1>
              <p className="mt-5 max-w-md text-[13px] leading-6 text-[#53605a]">
                A map with a point of view: Northwoods pines, Driftless hills, Great Lakes lettering, Door County light, and room for the places that are yours.
              </p>
              <div className="mt-5 flex items-end justify-between border-t border-[#14201d]/12 pt-5">
                <div>
                  <div className="text-[8px] uppercase tracking-[0.18em] text-[#7a847e]">18 × 24 archival print</div>
                  <div className="mt-1 font-display text-4xl font-light">{price}</div>
                </div>
                <div className="text-right text-[9px] leading-4 text-[#7a847e]">Four sizes<br />Framing available</div>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <div className="text-[9px] uppercase tracking-[0.18em] text-[#69736e]">Choose a direction</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {DIRECTIONS.map((direction) => (
                  <button key={direction.id} type="button" aria-pressed={scene.illustration.theme === direction.id} onClick={() => chooseDirection(direction)} title={direction.note} className={`flex min-h-[62px] items-center justify-center border px-2 text-center transition-all ${scene.illustration.theme === direction.id ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}>
                    <span className="text-[10px] font-medium leading-4">{direction.name}</span>
                  </button>
                ))}
              </div>

              <button type="button" onClick={buyAsShown} disabled={buying || status !== 'ready'} className="mt-6 flex min-h-14 w-full items-center justify-center bg-[#173f35] px-6 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#c66b4e] disabled:opacity-50">
                {buying ? 'Preparing the print…' : 'Buy as shown'}
              </button>
              <Link href={customizeHref} onClick={() => trackDemoEvent('product_customize_started', { place: print.slug, palette: scene.illustration.theme })} className="mt-3 flex min-h-12 w-full items-center justify-center border border-[#173f35] px-6 text-[10px] font-medium uppercase tracking-[0.18em] text-[#173f35] transition-colors hover:bg-[#e9eee9]">
                Personalize this map
              </Link>
              <p className="mt-3 text-center text-[9px] leading-4 text-[#7a847e]">Add labels, dates, stars, hearts, cabins, trees, and your own places.</p>
            </div>
          </aside>
        </section>

        <section className="border-y border-white/10 bg-[#0f1917]/55">
          <div className="mx-auto grid max-w-[1320px] gap-8 px-6 py-14 md:grid-cols-3 md:px-10">
            <Story number="01" title="Geography first">Every automatic illustration begins at a real coordinate and follows the map when the sheet changes shape.</Story>
            <Story number="02" title="Make it yours">Drag the drawings, add your own wording, and mark the places that turn a state into your state.</Story>
            <Story number="03" title="Made for print">Vector-like linework, guarded contrast, and a shared export model keep the final artwork crisp at full size.</Story>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1320px] gap-8 px-6 py-16 md:grid-cols-[0.8fr_1.2fr] md:px-10 lg:py-24">
          <div>
            <div className="studio-kicker">Made for somewhere</div>
            <h2 className="mt-4 font-display text-5xl font-light leading-[0.95]">Not just where.<br /><span className="font-hand text-[#d9b09d]">What happened there.</span></h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {['Where We Met', 'Up North', 'Our First Home', 'The Family Cabin', 'Every Summer', 'Home, for now'].map((label) => (
              <div key={label} className="grid min-h-32 place-items-center border border-white/12 bg-white/[0.035] p-4 text-center font-hand text-3xl text-[#e7ded2]">{label}</div>
            ))}
          </div>
        </section>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-t border-[#14201d]/15 bg-[#f7f5ef]/95 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[#14201d] shadow-[0_-12px_35px_rgba(0,0,0,0.2)] backdrop-blur lg:hidden">
        <span className="px-2 font-display text-3xl font-light">{price}</span>
        <Link href={customizeHref} className="flex min-h-12 items-center justify-center bg-[#173f35] px-4 text-[9px] font-medium uppercase tracking-[0.16em] text-white">Personalize</Link>
        <button type="button" onClick={buyAsShown} disabled={buying || status !== 'ready'} className="min-h-12 border border-[#173f35] px-3 text-[8px] font-medium uppercase tracking-[0.12em] disabled:opacity-45">Buy shown</button>
      </div>
    </div>
  );
}

function Story({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <article><div className="text-[9px] uppercase tracking-[0.2em] text-[#c28368]">{number}</div><h3 className="mt-3 font-display text-3xl font-light">{title}</h3><p className="mt-3 text-[12px] leading-6 text-white/55">{children}</p></article>;
}
