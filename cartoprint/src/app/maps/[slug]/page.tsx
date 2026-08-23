import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CityProductPage } from '@/components/Storefront/CityProductPage';
import { getCityCatalogPrint, getCityCatalogPrints } from '@/lib/catalog/prints';

export function generateStaticParams() {
  return getCityCatalogPrints().map((print) => ({ slug: print.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const print = getCityCatalogPrint(params.slug);
  if (!print) return {};
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

export default function CityMapProductPage({ params }: { params: { slug: string } }) {
  const print = getCityCatalogPrint(params.slug);
  if (!print) notFound();

  return (
    <CityProductPage
      print={print}
      customizeBaseHref={`/customize?print=${encodeURIComponent(print.slug)}`}
    />
  );
}
