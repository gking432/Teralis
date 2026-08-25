import type { MetadataRoute } from 'next';
import { getCityCatalogPrints, getStateCatalogPrints } from '@/lib/catalog/prints';

const SITE_URL = 'https://cartoprint.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...getCityCatalogPrints().map((print) => ({
      url: `${SITE_URL}/maps/${print.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    })),
    ...getStateCatalogPrints().map((print) => ({
      url: `${SITE_URL}/maps/${print.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    })),
  ];
}
