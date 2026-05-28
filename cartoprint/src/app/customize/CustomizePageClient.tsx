'use client';

import { useSearchParams } from 'next/navigation';
import { MapBuilder } from '@/components/MapBuilder/MapBuilder';
import { getCatalogPrint } from '@/lib/catalog/prints';

export function CustomizePageClient() {
  const searchParams = useSearchParams();
  const catalogSlug = searchParams.get('print');
  const catalogPrint = getCatalogPrint(catalogSlug);

  return <MapBuilder catalogPrint={catalogPrint} catalogSlug={catalogSlug} />;
}
