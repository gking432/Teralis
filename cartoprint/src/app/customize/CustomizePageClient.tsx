'use client';

import { useSearchParams } from 'next/navigation';
import { MapBuilder } from '@/components/MapBuilder/MapBuilder';
import { PrintCustomizer } from '@/components/Storefront/PrintCustomizer';
import { getCatalogPrint } from '@/lib/catalog/prints';

export function CustomizePageClient() {
  const searchParams = useSearchParams();
  const catalogSlug = searchParams.get('print');
  const catalogPrint = getCatalogPrint(catalogSlug);

  // Catalog prints get the focused print customizer (large preview + quick
  // more/less detail controls). Freeform building still uses the full builder.
  if (catalogPrint) {
    return <PrintCustomizer print={catalogPrint} />;
  }

  return <MapBuilder catalogPrint={catalogPrint} catalogSlug={catalogSlug} />;
}
