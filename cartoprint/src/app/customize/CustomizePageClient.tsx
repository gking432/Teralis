'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapBuilder } from '@/components/MapBuilder/MapBuilder';
import { Studio } from '@/components/Studio/Studio';
import { getCatalogPrint, type CatalogPrint } from '@/lib/catalog/prints';
import { buildPlaceCatalogPrint, inferKind, placeFromSearchParams } from '@/lib/catalog/placeFromQuery';
import { isValidOrientation, type Orientation } from '@/lib/print/orientation';

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  type?: string;
  addresstype?: string;
  boundingbox: [string, string, string, string];
  lat: string;
  lon: string;
}

export function CustomizePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const catalogSlug = searchParams.get('print');
  const catalogPrint = getCatalogPrint(catalogSlug);
  const orientationParam = searchParams.get('o');
  const orientation: Orientation = isValidOrientation(orientationParam) ? orientationParam : 'portrait';

  // Arbitrary place from search result (?place=Madison&bbox=...&kind=city&display=...)
  const placePrint = useMemo<CatalogPrint | null>(() => {
    if (catalogPrint) return null;
    return placeFromSearchParams(new URLSearchParams(searchParams.toString()));
  }, [catalogPrint, searchParams]);

  // Free-text query (?q=Chicago) — for popular-city pills, ads, deep links.
  // Geocode here once and replace the URL with the full param set.
  const freeQuery = searchParams.get('q');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (catalogPrint || placePrint || !freeQuery) return;
    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    fetch(`/api/geocode?q=${encodeURIComponent(freeQuery)}`)
      .then((r) => r.json())
      .then((data: NominatimResult[]) => {
        if (cancelled) return;
        const top = Array.isArray(data) ? data[0] : null;
        if (!top) { setResolveError(`No place found for "${freeQuery}".`); setResolving(false); return; }

        const bb = top.boundingbox.map(Number) as [number, number, number, number];
        const kind = inferKind(top.addresstype, top.type);
        const print = buildPlaceCatalogPrint({
          name: top.name || freeQuery,
          displayName: top.display_name,
          kind,
          bbox: bb,
          center: [Number(top.lon), Number(top.lat)],
        });

        const next = new URLSearchParams({
          place: print.name,
          kind: print.kind,
          bbox: bb.join(','),
          center: print.center.join(','),
          display: top.display_name,
          o: orientation,
        });
        router.replace(`/customize?${next.toString()}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setResolveError(String(err));
        setResolving(false);
      });

    return () => { cancelled = true; };
  }, [catalogPrint, placePrint, freeQuery, orientation, router]);

  const print = catalogPrint || placePrint;
  if (print) {
    return <Studio key={print.slug} print={print} orientation={orientation} />;
  }

  if (resolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ece7dd]">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#07122a]/20 border-t-[#07122a]" />
          <p className="mt-4 text-[11px] uppercase tracking-[1.6px] text-[#777]">
            Finding {freeQuery}…
          </p>
        </div>
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ece7dd] px-6">
        <div className="max-w-md text-center">
          <p className="font-display text-2xl font-light">{resolveError}</p>
          <a href="/" className="mt-6 inline-block border border-text px-5 py-3 text-[11px] uppercase tracking-[1.4px] transition-colors hover:bg-text hover:text-white">
            Back to Search
          </a>
        </div>
      </div>
    );
  }

  return <MapBuilder catalogPrint={catalogPrint} catalogSlug={catalogSlug} />;
}
