import { Suspense } from 'react';
import { CustomizePageClient } from './CustomizePageClient';

export default function CustomizePage() {
  return (
    <Suspense fallback={<CustomizeFallback />}>
      <CustomizePageClient />
    </Suspense>
  );
}

function CustomizeFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg text-sm uppercase tracking-[1.5px] text-text-muted">
      Loading map editor
    </div>
  );
}
