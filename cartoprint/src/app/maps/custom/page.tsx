import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CityProductPage } from '@/components/Storefront/CityProductPage';
import { placeFromSearchParams } from '@/lib/catalog/placeFromQuery';

export const metadata: Metadata = {
  title: 'Your Custom City Map | Terralis',
  description: 'Preview a detailed street map of your city or town, then personalize its color, title, border, and print format.',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function toUrlSearchParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  });
  return params;
}

export default function CustomCityProductPage({ searchParams }: { searchParams: SearchParams }) {
  const params = toUrlSearchParams(searchParams);
  const print = placeFromSearchParams(params);
  if (!print) notFound();

  if (print.kind !== 'city') {
    redirect(`/customize?${params.toString()}`);
  }

  return (
    <CityProductPage
      print={print}
      customizeBaseHref={`/customize?${params.toString()}`}
      canonical={false}
    />
  );
}
