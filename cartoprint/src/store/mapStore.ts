import { create } from 'zustand';
import type { LayerGroup, LayerState, MapSelection, MapViewState } from '@/types/map';
import { DEFAULT_LAYERS, TEMPLATES } from '@/lib/map/templates';

interface MapStore {
  view: MapViewState;
  setView: (view: MapViewState) => void;

  layers: LayerState;
  toggleLayer: (group: LayerGroup) => void;
  setLayers: (layers: LayerState) => void;

  selection: MapSelection | null;
  setSelection: (sel: MapSelection | null) => void;
  clearSelection: () => void;

  isIsolated: boolean;
  setIsolated: (val: boolean) => void;
  toggleIsolation: () => void;

  applyTemplate: (templateId: string) => void;

  panelOpen: boolean;
  togglePanel: () => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  view: { center: [-98.58, 39.83], zoom: 4 },
  setView: (view) => set({ view }),

  layers: { ...DEFAULT_LAYERS },
  toggleLayer: (group) =>
    set((s) => ({
      layers: { ...s.layers, [group]: !s.layers[group] },
    })),
  setLayers: (layers) => set({ layers }),

  selection: null,
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: null, isIsolated: false }),

  isIsolated: false,
  setIsolated: (isIsolated) => set({ isIsolated }),
  toggleIsolation: () => set((s) => ({ isIsolated: !s.isIsolated })),

  applyTemplate: (templateId) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    set({
      layers: { ...template.layers },
      selection: null,
      isIsolated: false,
    });
  },

  panelOpen: true,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
