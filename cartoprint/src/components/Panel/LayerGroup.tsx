'use client';

interface LayerGroupProps {
  title: string;
  children: React.ReactNode;
}

export function LayerGroup({ title, children }: LayerGroupProps) {
  return (
    <div className="p-6 border-b border-border-light last:border-b-0">
      <h3 className="font-display text-sm font-semibold tracking-[2px] uppercase text-text-muted mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}
