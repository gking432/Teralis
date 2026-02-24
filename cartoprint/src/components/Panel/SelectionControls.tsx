'use client';

import { LayerToggle } from './LayerToggle';
import type { MapSelection } from '@/types/map';

interface SelectionControlsProps {
  isIsolated: boolean;
  onToggleIsolation: () => void;
  selection: MapSelection | null;
}

const IsolateIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="8" height="8" />
    <line x1="1" y1="1" x2="4" y2="4" />
    <line x1="15" y1="1" x2="12" y2="4" />
    <line x1="1" y1="15" x2="4" y2="12" />
    <line x1="15" y1="15" x2="12" y2="12" />
  </svg>
);

export function SelectionControls({
  isIsolated,
  onToggleIsolation,
  selection,
}: SelectionControlsProps) {
  return (
    <>
      <p className="text-xs text-text-light mb-3.5 leading-relaxed">
        Click any region on the map to select it. Toggle isolation to show only that region with
        white space around it.
      </p>
      <LayerToggle
        label="Isolate Selection"
        icon={IsolateIcon}
        active={isIsolated}
        onToggle={onToggleIsolation}
      />
      <p className="text-xs text-text-muted pt-2 pl-[30px]">
        {selection ? selection.name : 'No region selected'}
      </p>
    </>
  );
}
