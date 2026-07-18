'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Compatibility route for old bookmarks and shared links. The composition
// gallery is intentionally gone; every place now opens in the same studio.
export function DesignPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('style');
    router.replace(`/customize?${next.toString()}`);
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#14201d] text-[#f7f4eb]">
      <div className="text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="mt-4 text-[9px] uppercase tracking-[0.2em] text-white/55">Opening your city map</p>
      </div>
    </main>
  );
}
