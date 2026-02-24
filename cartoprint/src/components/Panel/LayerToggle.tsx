'use client';

import { Toggle } from '@/components/ui/Toggle';

interface LayerToggleProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onToggle: () => void;
}

export function LayerToggle({ label, icon, active, onToggle }: LayerToggleProps) {
  return (
    <div
      className="flex items-center justify-between py-2.5 cursor-pointer select-none"
      onClick={onToggle}
    >
      <span className="text-sm flex items-center gap-2.5">
        <span
          className={`w-5 h-5 flex items-center justify-center transition-opacity ${
            active ? 'opacity-100' : 'opacity-50'
          }`}
        >
          {icon}
        </span>
        {label}
      </span>
      <Toggle active={active} onClick={onToggle} />
    </div>
  );
}
