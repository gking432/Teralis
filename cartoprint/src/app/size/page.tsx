import { Suspense } from 'react';
import { SizePickerClient } from './SizePickerClient';

export default function SizePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#ece7dd] text-[11px] uppercase tracking-[1.8px] text-[#999]">
          Loading…
        </div>
      }
    >
      <SizePickerClient />
    </Suspense>
  );
}
