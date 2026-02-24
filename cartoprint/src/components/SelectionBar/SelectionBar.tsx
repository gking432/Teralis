'use client';

import { Button } from '@/components/ui/Button';
import type { MapSelection } from '@/types/map';

interface SelectionBarProps {
  selection: MapSelection;
  onZoomTo: () => void;
  onIsolate: () => void;
  onClear: () => void;
}

export function SelectionBar({ selection, onZoomTo, onIsolate, onClear }: SelectionBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-panel border border-border px-6 py-3 z-[998] flex items-center gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.1)] text-[13px]">
      <div>
        <span className="font-medium">{selection.name}</span>
        <br />
        <span className="text-text-muted text-[11px] uppercase tracking-[1px]">
          {selection.type}
        </span>
      </div>
      <div className="w-px h-6 bg-border" />
      <Button variant="outline" size="sm" onClick={onZoomTo}>
        Zoom To
      </Button>
      <Button variant="outline" size="sm" onClick={onIsolate}>
        Isolate
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
