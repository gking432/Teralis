import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Studio } from '@/components/Studio/Studio';
import { getCatalogPrint, getCityCatalogPrints, getStateCatalogPrints } from '@/lib/catalog/prints';
import { ILLUSTRATIONS } from '@/lib/print/illustrations';

export function generateStaticParams() {
  return [
    ...getCityCatalogPrints().map((print) => ({ slug: print.slug })),
    ...getStateCatalogPrints().map((print) => ({ slug: print.slug })),
  ];
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const print = getCatalogPrint(params.slug);
  if (!print || print.kind === 'country') return {};

  if (print.kind === 'state') {
    const title = `${print.name} Map Print | ${ILLUSTRATIONS[print.slug] ? 'Illustrated, Topographic & Street Atlas' : 'Topographic & Street Atlas'} | Terralis`;
    const description = `Explore ${print.name} through elevation, rivers and lakes, or streets with cities and towns. Choose your edition, colors, and personal wording.`;
    return {
      title,
      description,
      alternates: { canonical: `/maps/${print.slug}` },
      openGraph: { title, description, type: 'website', url: `/maps/${print.slug}` },
    };
  }

  const title = `${print.name} Map Print | Every Street | Terralis`;
  const description = `Create a detailed ${print.name}, ${print.defaultSubtitle} street map print. Choose the color, title, border, size, and frame.`;
  return {
    title,
    description,
    alternates: { canonical: `/maps/${print.slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/maps/${print.slug}`,
    },
  };
}

export default function MapProductPage({ params }: { params: { slug: string } }) {
  const print = getCatalogPrint(params.slug);
  if (!print || print.kind === 'country') notFound();

  return <Suspense fallback={<div className="min-h-screen bg-[#14201d]" />}><Studio key={print.slug} print={print} /></Suspense>;
}
