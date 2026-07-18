'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudioHeader } from '@/components/Storefront/StudioHeader';
import { ThumbnailMap } from '@/components/Storefront/ThumbnailMap';
import { getCatalogPrint, type CatalogPrint } from '@/lib/catalog/prints';
import { buildPlaceCatalogPrint, inferKind, placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { COMPOSITION_PRESETS } from '@/lib/print/presets';
import { createPrintScene } from '@/lib/print/scene';
import { COLOR_SCHEMES } from '@/lib/print/colorSchemes';

interface NominatimResult {
  display_name: string;
  name: string;
  type?: string;
  addresstype?: string;
  boundingbox: [string, string, string, string];
}

export function DesignPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const catalogPrint = getCatalogPrint(searchParams.get('print'));
  const placePrint = useMemo(
    () => catalogPrint ?? placeFromSearchParams(new URLSearchParams(searchParams.toString())),
    [catalogPrint, searchParams],
  );
  const query = searchParams.get('q');
  const [resolvedPrint, setResolvedPrint] = useState<CatalogPrint | null>(placePrint);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (placePrint) {
      setResolvedPrint(placePrint);
      return;
    }
    if (!query) return;
    const controller = new AbortController();
    setError(null);
    fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((results: NominatimResult[]) => {
        const top = Array.isArray(results) ? results[0] : null;
        if (!top) throw new Error(`No place found for “${query}”.`);
        const bbox = top.boundingbox.map(Number) as [number, number, number, number];
        const print = buildPlaceCatalogPrint({
          name: top.name || query,
          displayName: top.display_name,
          kind: inferKind(top.addresstype, top.type),
          bbox,
        });
        setResolvedPrint(print);
        const next = new URLSearchParams({
          place: print.name,
          kind: print.kind,
          bbox: bbox.join(','),
          display: top.display_name,
        });
        router.replace(`/design?${next.toString()}`);
      })
      .catch((reason) => {
        if (reason?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to find that place.');
      });
    return () => controller.abort();
  }, [placePrint, query, router]);

  const print = resolvedPrint;
  if (!print) {
    return (
      <main className="studio-paper-grid min-h-screen text-text">
        <StudioHeader step={1} backHref="/" backLabel="Search" context={query || 'Finding place'} tone="paper" />
        <div className="flex min-h-[calc(100vh-70px)] items-center justify-center px-6 text-center">
          <div>
            {error ? (
              <>
                <p className="font-display text-3xl">{error}</p>
                <Link href="/" className="mt-6 inline-block border border-[#173f35] px-5 py-3 text-[9px] uppercase tracking-[0.18em]">Try another place</Link>
              </>
            ) : (
              <>
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#173f35]/20 border-t-[#173f35]" />
                <p className="mt-4 text-[9px] uppercase tracking-[0.2em] text-[#65716a]">Preparing design studies</p>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  function hrefFor(presetId: string): string {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('q');
    if (!next.get('print')) {
      next.set('place', print!.name);
      next.set('kind', print!.kind);
      next.set('bbox', print!.bbox.join(','));
      next.set('display', print!.searchQuery);
    }
    next.set('style', presetId);
    next.set('o', 'portrait');
    return `/customize?${next.toString()}`;
  }

  return (
    <main className="studio-paper-grid min-h-screen text-text">
      <StudioHeader step={1} backHref="/" backLabel="Search" context={print.name} tone="paper" />
      <section className="mx-auto max-w-[1500px] px-5 py-10 md:px-10 lg:px-14 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <div className="studio-kicker">01 · Choose a composition</div>
            <h1 className="mt-5 max-w-2xl font-display text-[48px] font-light leading-[0.9] tracking-[-0.035em] md:text-[66px]">
              Six ways to see <span className="italic text-[#65716a]">{print.name}.</span>
            </h1>
          </div>
          <div className="max-w-xl lg:justify-self-end">
            <p className="text-[14px] leading-7 text-[#66706a]">Start with a complete cartographic direction. Every road, label, color, and title can still be refined in the studio.</p>
            <div className="mt-5 flex gap-6 text-[8px] uppercase tracking-[0.18em] text-[#849087]">
              <span>Actual map data</span><span>Print-aware detail</span><span>Change anytime</span>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMPOSITION_PRESETS.map((preset, index) => {
            const scene = createPrintScene(print, 'portrait', preset.id);
            const configured = { ...scene, detail: preset.detail(print.kind) };
            const colors = COLOR_SCHEMES.find((scheme) => scheme.value === preset.palette)?.colors ?? scene.colors;
            return (
              <Link
                key={preset.id}
                href={hrefFor(preset.id)}
                className="group grid min-h-[440px] grid-cols-[0.88fr_1.12fr] overflow-hidden border border-[#14201d]/15 bg-[#fbfaf6] transition-all duration-300 hover:-translate-y-1 hover:border-[#173f35] hover:shadow-[0_24px_60px_rgba(20,32,29,0.14)] sm:grid-cols-1"
              >
                <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden bg-[#dfe5df] p-5 sm:min-h-[310px]">
                  <div className="w-[150px] overflow-hidden bg-white shadow-[0_18px_45px_rgba(20,32,29,0.22)] transition-transform duration-500 group-hover:scale-[1.025]">
                    <ThumbnailMap
                      slug={print.slug}
                      bbox={print.bbox}
                      center={print.center}
                      kind={print.kind}
                      title={print.defaultTitle}
                      subtitle={print.defaultSubtitle}
                      detail={print.establishedYear ? `EST. ${print.establishedYear}` : ''}
                      colors={colors}
                      mapDetail={configured.detail}
                      titleEnabled={preset.titleEnabled}
                      titleLayout={preset.titleLayout}
                      cacheId={preset.id}
                      disableStatic
                    />
                  </div>
                  <span className="absolute left-4 top-4 text-[8px] uppercase tracking-[0.18em] text-[#65716a]">0{index + 1}</span>
                </div>
                <div className="flex flex-col justify-between border-l border-[#14201d]/10 p-5 sm:border-l-0 sm:border-t">
                  <div>
                    <h2 className="font-display text-[28px] font-light">{preset.name}</h2>
                    <p className="mt-2 text-[11px] leading-5 text-[#66706a]">{preset.description}</p>
                  </div>
                  <div className="mt-6 flex items-end justify-between gap-3 border-t border-[#14201d]/10 pt-4">
                    <span className="text-[8px] uppercase leading-4 tracking-[0.14em] text-[#849087]">{preset.bestFor}</span>
                    <span className="text-lg text-[#c66b4e]">↗</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
