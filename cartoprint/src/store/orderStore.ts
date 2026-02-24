import { create } from 'zustand';
import type { PrintSize, PaperType, FrameType, PriceBreakdown } from '@/types/order';
import { calculatePrice } from '@/lib/pricing';

interface OrderStore {
  size: PrintSize;
  paper: PaperType;
  frame: FrameType;
  price: PriceBreakdown;
  modalOpen: boolean;

  setSize: (size: PrintSize) => void;
  setPaper: (paper: PaperType) => void;
  setFrame: (frame: FrameType) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useOrderStore = create<OrderStore>((set, get) => ({
  size: '12x16',
  paper: 'matte',
  frame: 'none',
  price: calculatePrice('12x16', 'matte', 'none'),
  modalOpen: false,

  setSize: (size) => {
    const { paper, frame } = get();
    set({ size, price: calculatePrice(size, paper, frame) });
  },
  setPaper: (paper) => {
    const { size, frame } = get();
    set({ paper, price: calculatePrice(size, paper, frame) });
  },
  setFrame: (frame) => {
    const { size, paper } = get();
    set({ frame, price: calculatePrice(size, paper, frame) });
  },
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));
