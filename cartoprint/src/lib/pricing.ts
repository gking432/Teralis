import type { PrintSize, PaperType, FrameType, PriceBreakdown } from '@/types/order';

const SIZE_PRICES: Record<PrintSize, number> = {
  '12x16': 59,
  '18x24': 89,
  '24x36': 129,
  '30x40': 169,
};

const PAPER_PRICES: Record<PaperType, number> = {
  matte: 0,
  lustre: 15,
};

const FRAME_PRICES: Record<FrameType, Record<PrintSize, number>> = {
  none:  { '12x16': 0, '18x24': 0, '24x36': 0, '30x40': 0 },
  black: { '12x16': 89, '18x24': 89, '24x36': 119, '30x40': 149 },
  white: { '12x16': 89, '18x24': 89, '24x36': 119, '30x40': 149 },
  oak:   { '12x16': 139, '18x24': 139, '24x36': 179, '30x40': 219 },
};

export function calculatePrice(
  size: PrintSize,
  paper: PaperType,
  frame: FrameType
): PriceBreakdown {
  const base = SIZE_PRICES[size];
  const paperCost = PAPER_PRICES[paper];
  const frameCost = FRAME_PRICES[frame][size];

  return {
    base,
    paper: paperCost,
    frame: frameCost,
    total: base + paperCost + frameCost,
  };
}
