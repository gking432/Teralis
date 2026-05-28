'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface HeaderProps {
  zoom: number;
  onReset: () => void;
  onPreview: () => void;
}

export function Header({
  zoom,
  onReset,
  onPreview,
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-header bg-panel border-b border-border flex items-center justify-between px-8 z-50">
      <Link href="/" className="font-display font-light text-[26px] tracking-[3px] uppercase">
        TERRA<span className="font-semibold">LIS</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="hidden text-[11px] uppercase tracking-[1.2px] text-text-muted transition-colors hover:text-text md:inline"
        >
          Print Catalog
        </Link>
        <span className="text-xs text-text-muted min-w-[80px] text-center">
          Zoom: {zoom.toFixed(1)}×
        </span>
        <Button variant="outline" onClick={onReset}>
          Reset View
        </Button>
        <Button variant="primary" onClick={onPreview}>
          Customize Print
        </Button>
      </div>
    </header>
  );
}
