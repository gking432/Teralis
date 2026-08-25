import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CityProductPage } from '@/components/Storefront/CityProductPage';
import { StateProductPage } from '@/components/Storefront/StateProductPage';
import { getCatalogPrint, getCityCatalogPrints, getStateCatalogPrints } from '@/lib/catalog/prints';
import { designsForState } from '@/lib/catalog/stateCollection';

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
    const title = `${print.name} Map Print | Topographic & Street Atlas Editions | Terralis`;
    const description = `Shop finished ${print.name} map prints — a Topographic edition with elevation relief and rivers, and a Street Atlas edition with a clean road hierarchy — then personalize the wording, markers, and framing.`;
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

  if (print.kind === 'state') {
    return <StateProductPage print={print} />;
  }

  return (
    <CityProductPage
      print={print}
      customizeBaseHref={`/customize?print=${encodeURIComponent(print.slug)}`}
    />
  );
}
