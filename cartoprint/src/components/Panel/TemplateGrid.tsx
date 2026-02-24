'use client';

import { TEMPLATES } from '@/lib/map/templates';

interface TemplateGridProps {
  onSelect: (templateId: string) => void;
}

export function TemplateGrid({ onSelect }: TemplateGridProps) {
  return (
    <div className="flex flex-col gap-2">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="w-full px-3.5 py-3 bg-bg border border-border rounded-md font-body text-[13px] text-text text-left cursor-pointer transition-all hover:border-text hover:bg-white flex items-center gap-2.5"
        >
          <span className="text-base opacity-60 w-5 text-center">{t.icon}</span>
          {t.name}
        </button>
      ))}
    </div>
  );
}
