import { create } from 'zustand';
import type { PrintSize, PaperType, FrameType, PriceBreakdown } from '@/types/order';
import { calculatePrice } from '@/lib/pricing';
import type { PrintRegionScope, PrintSelectedRegion } from '@/types/order';
import type { MapSelection } from '@/types/map';

interface OrderStore {
  size: PrintSize;
  paper: PaperType;
  frame: FrameType;
  price: PriceBreakdown;
  modalOpen: boolean;
  printSnapshot: MapSelection | null;
  activeScope: PrintRegionScope;
  drilldownSelections: PrintSelectedRegion[];
  skipIsolationStep: boolean;

  setSize: (size: PrintSize) => void;
  setPaper: (paper: PaperType) => void;
  setFrame: (frame: FrameType) => void;
  openModal: (config?: {
    scope?: PrintRegionScope;
    skipIsolationStep?: boolean;
    printSnapshot?: MapSelection | null;
  }) => void;
  closeModal: () => void;
  setActiveScope: (scope: PrintRegionScope) => void;
  selectRegion: (region: PrintSelectedRegion) => void;
  removeRegionScope: (scope: PrintRegionScope) => void;
  clearSelections: () => void;
}

const SCOPE_ORDER: PrintRegionScope[] = ['country', 'state', 'county', 'city'];

function getScopeIndex(scope: PrintRegionScope): number {
  return SCOPE_ORDER.indexOf(scope);
}

export const useOrderStore = create<OrderStore>((set, get) => ({
  size: '12x16',
  paper: 'matte',
  frame: 'none',
  price: calculatePrice('12x16', 'matte', 'none'),
  modalOpen: false,
  printSnapshot: null,
  activeScope: 'state',
  drilldownSelections: [],
  skipIsolationStep: false,

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
  openModal: (config) =>
    set({
      modalOpen: true,
      activeScope: config?.scope || 'state',
      skipIsolationStep: config?.skipIsolationStep || false,
      printSnapshot: config?.printSnapshot || null,
    }),
  closeModal: () =>
    set({
      modalOpen: false,
      skipIsolationStep: false,
    }),
  setActiveScope: (activeScope) => set({ activeScope }),
  selectRegion: (region) =>
    set((state) => ({
      drilldownSelections: [
        ...state.drilldownSelections.filter(
          (entry) => getScopeIndex(entry.scope) < getScopeIndex(region.scope)
        ),
        region,
      ],
    })),
  removeRegionScope: (scope) =>
    set((state) => ({
      drilldownSelections: state.drilldownSelections.filter(
        (entry) => getScopeIndex(entry.scope) < getScopeIndex(scope)
      ),
    })),
  clearSelections: () => set({ drilldownSelections: [] }),
}));
