import { create } from 'zustand';
import type { LayerGroup, LayerState, MapSelection, MapViewState, MapTemplate } from '@/types/map';
import { DEFAULT_LAYERS, TEMPLATES } from '@/lib/map/templates';

interface MapStore {
  // View
  view: MapViewState;
  setView: (view: MapViewState) => void;

  // Layers
  layers: LayerState;
  toggleLayer: (group: LayerGroup) => void;
  setLayers: (layers: LayerState) => void;

  // Selection
  selection: MapSelection | null;
  setSelection: (sel: MapSelection | null) => void;
  clearSelection: () => void;

  // Isolation
  isIsolated: boolean;
  setIsolated: (val: boolean) => void;
  toggleIsolation: () => void;

  // Templates
  applyTemplate: (templateId: string) => void;

  // Panel
  panelOpen: boolean;
  togglePanel: () => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  // View
  view: { center: [-98.58, 39.83], zoom: 4 },
  setView: (view) => set({ view }),

  // Layers
  layers: { ...DEFAULT_LAYERS },
  toggleLayer: (group) =>
    set((s) => ({
      layers: { ...s.layers, [group]: !s.layers[group] },
    })),
  setLayers: (layers) => set({ layers }),

  // Selection
  selection: null,
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: null, isIsolated: false }),

  // Isolation
  isIsolated: false,
  setIsolated: (isIsolated) => set({ isIsolated }),
  toggleIsolation: () => set((s) => ({ isIsolated: !s.isIsolated })),

  // Templates
  applyTemplate: (templateId) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    set({
      layers: { ...template.layers },
      selection: null,
      isIsolated: false,
    });
  },

  // Panel
  panelOpen: true,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
