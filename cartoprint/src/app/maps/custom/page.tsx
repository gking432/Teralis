import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Studio } from '@/components/Studio/Studio';
import { placeFromSearchParams } from '@/lib/catalog/placeFromQuery';

export const metadata: Metadata = {
  title: 'Your Custom City Map | Terralis',
  description: 'Preview a detailed street map of your city or town, then adjust its color, title, border, and print format.',
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

  return <Suspense fallback={<div className="min-h-screen bg-[#14201d]" />}><Studio key={print.slug} print={print} /></Suspense>;
}
