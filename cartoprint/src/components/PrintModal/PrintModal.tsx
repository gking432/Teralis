'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useOrderStore } from '@/store/orderStore';
import type { PrintSize, PaperType, FrameType } from '@/types/order';

const SIZES: { value: PrintSize; label: string; desc: string }[] = [
  { value: '12x16', label: '12 × 16"', desc: 'Small' },
  { value: '18x24', label: '18 × 24"', desc: 'Medium' },
  { value: '24x36', label: '24 × 36"', desc: 'Large' },
  { value: '30x40', label: '30 × 40"', desc: 'Extra Large' },
];

const PAPERS: { value: PaperType; label: string; desc: string }[] = [
  { value: 'matte', label: 'Matte', desc: 'Museum quality' },
  { value: 'lustre', label: 'Lustre', desc: 'Subtle sheen' },
];

const FRAMES: { value: FrameType; label: string; desc: string }[] = [
  { value: 'none', label: 'Print Only', desc: 'Unframed' },
  { value: 'black', label: 'Black Frame', desc: 'Slim aluminum' },
  { value: 'white', label: 'White Frame', desc: 'Slim aluminum' },
  { value: 'oak', label: 'Oak Frame', desc: 'Natural wood' },
];

export function PrintModal() {
  const { size, paper, frame, price, modalOpen, setSize, setPaper, setFrame, closeModal } =
    useOrderStore();

  return (
    <Modal open={modalOpen} onClose={closeModal}>
      <h2 className="font-display text-[32px] font-light mb-2">Order Your Print</h2>
      <p className="text-sm text-text-muted mb-9 leading-relaxed">
        Your custom map, printed on museum-quality paper with archival inks. Ships in 5–7 business
        days.
      </p>

      <OptionGroup label="Print Size">
        <div className="grid grid-cols-2 gap-2">
          {SIZES.map((s) => (
            <OptionCard
              key={s.value}
              selected={size === s.value}
              onClick={() => setSize(s.value)}
              title={s.label}
              desc={s.desc}
            />
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="Paper">
        <div className="grid grid-cols-2 gap-2">
          {PAPERS.map((p) => (
            <OptionCard
              key={p.value}
              selected={paper === p.value}
              onClick={() => setPaper(p.value)}
              title={p.label}
              desc={p.desc}
            />
          ))}
        </div>
      </OptionGroup>

      <OptionGroup label="Framing">
        <div className="grid grid-cols-2 gap-2">
          {FRAMES.map((f) => (
            <OptionCard
              key={f.value}
              selected={frame === f.value}
              onClick={() => setFrame(f.value)}
              title={f.label}
              desc={f.desc}
            />
          ))}
        </div>
      </OptionGroup>

      <div className="font-display text-4xl font-normal text-center py-6 border-t border-b border-border my-7">
        ${price.total}{' '}
        <span className="text-base text-text-muted font-body">USD</span>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1 py-3.5" onClick={closeModal}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1 py-3.5"
          onClick={() => {
            alert('Print added to cart! (Stripe integration coming soon)');
            closeModal();
          }}
        >
          Add to Cart
        </Button>
      </div>
    </Modal>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <div className="text-[11px] font-medium tracking-[1.5px] uppercase text-text-muted mb-3">
        {label}
      </div>
      {children}
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3.5 border-[1.5px] cursor-pointer transition-all text-center ${
        selected
          ? 'border-text bg-bg'
          : 'border-border hover:border-text-muted'
      }`}
    >
      <div className="text-sm font-medium mb-0.5">{title}</div>
      <div className="text-xs text-text-muted">{desc}</div>
    </button>
  );
}
