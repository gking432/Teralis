import { Suspense } from 'react';
import { DesignPageClient } from './DesignPageClient';

export default function DesignPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#ece7dd]" />}>
      <DesignPageClient />
    </Suspense>
  );
}
