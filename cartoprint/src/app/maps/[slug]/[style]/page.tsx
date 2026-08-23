import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StateProductPage } from '@/components/Storefront/StateProductPage';
import { getCatalogPrint } from '@/lib/catalog/prints';

export function generateStaticParams() {
  return [{ slug: 'wisconsin', style: 'doodle' }];
}

export function generateMetadata({ params }: { params: { slug: string; style: string } }): Metadata {
  const print = getCatalogPrint(params.slug);
  if (!print || print.kind !== 'state' || params.style !== 'doodle') return {};
  const title = `${print.name} Doodle Map Print | Personalized Illustrated Atlas | Terralis`;
  const description = `Personalize an illustrated ${print.name} map with hand-drawn forests, terrain, water, landmarks, custom labels, and meaningful places.`;
  return {
    title,
    description,
    alternates: { canonical: `/maps/${print.slug}/doodle` },
    openGraph: { title, description, type: 'website', url: `/maps/${print.slug}/doodle` },
  };
}

export default function IllustratedStateMapPage({ params }: { params: { slug: string; style: string } }) {
  const print = getCatalogPrint(params.slug);
  if (!print || print.kind !== 'state' || params.style !== 'doodle') notFound();
  return <StateProductPage print={print} />;
}
