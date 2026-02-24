'use client';

import { Button } from '@/components/ui/Button';

interface HeaderProps {
  zoom: number;
  onReset: () => void;
  onOrderPrint: () => void;
}

export function Header({ zoom, onReset, onOrderPrint }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-header bg-panel border-b border-border flex items-center justify-between px-8 z-50">
      <div className="font-display font-light text-[26px] tracking-[3px] uppercase">
        TERRA<span className="font-semibold">LIS</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-text-muted min-w-[80px] text-center">
          Zoom: {zoom.toFixed(1)}×
        </span>
        <Button variant="outline" onClick={onReset}>
          Reset View
        </Button>
        <Button variant="primary" onClick={onOrderPrint}>
          Order Print
        </Button>
      </div>
    </header>
  );
}
