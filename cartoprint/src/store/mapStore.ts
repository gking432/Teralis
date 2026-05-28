import { create } from 'zustand';
import {
  createInitialBuilderState,
  deriveLayers,
  getPresetDefaults,
  getScaleBand,
} from '@/lib/map/builder';
import type { PrintMetrics } from '@/types/order';
import type {
  BorderDensity,
  BuilderState,
  FeatureSetting,
  FocusMode,
  LabelDensity,
  LayerGroup,
  LayerState,
  MapPreset,
  MapSelection,
  MapViewState,
  NatureDensity,
  RoadDensity,
  SelectionTarget,
} from '@/types/map';

interface MapStore {
  view: MapViewState;
  setView: (view: MapViewState) => void;
  fitBoundsRequest: { bbox: [string, string, string, string]; id: number } | null;
  requestFitBounds: (bbox: [string, string, string, string]) => void;

  builder: BuilderState;
  layers: LayerState;
  printMetrics: PrintMetrics | null;

  selection: MapSelection | null;
  setSelection: (sel: MapSelection | null) => void;
  setPrintMetrics: (metrics: PrintMetrics | null) => void;
  clearSelection: () => void;

  setPreset: (preset: MapPreset) => void;
  setSelectionTarget: (target: SelectionTarget) => void;
  setLabelDensity: (density: LabelDensity) => void;
  setRoadDensity: (density: RoadDensity) => void;
  setNatureDensity: (density: NatureDensity) => void;
  setBorderDensity: (density: BorderDensity) => void;
  resetDetailsToGuided: () => void;

  setFocusMode: (mode: FocusMode) => void;
  toggleAdvancedOpen: () => void;
  setAdvancedOverride: (group: LayerGroup, value: FeatureSetting) => void;
  clearAdvancedOverrides: () => void;

  panelOpen: boolean;
  togglePanel: () => void;
}

function deriveState(
  builder: BuilderState,
  selection: MapSelection | null
): Pick<MapStore, 'builder' | 'layers'> {
  return {
    builder,
    layers: deriveLayers(builder, selection),
  };
}

function getGuidedBuilder(builder: BuilderState, scaleBand: BuilderState['scaleBand']): BuilderState {
  const defaults = getPresetDefaults(builder.preset, scaleBand);
  return {
    ...builder,
    ...defaults,
    scaleBand,
    detailMode: 'guided',
  };
}

const initialView: MapViewState = { center: [-98.58, 39.83], zoom: 4 };
const initialBuilder = createInitialBuilderState(getScaleBand(initialView.zoom));

export const useMapStore = create<MapStore>((set, get) => ({
  view: initialView,
  fitBoundsRequest: null,
  requestFitBounds: (bbox) =>
    set((state) => ({
      fitBoundsRequest: {
        bbox,
        id: (state.fitBoundsRequest?.id || 0) + 1,
      },
    })),
  builder: initialBuilder,
  layers: deriveLayers(initialBuilder, null),
  printMetrics: null,

  setView: (view) =>
    set((state) => {
      const scaleBand = getScaleBand(view.zoom);
      const builder =
        scaleBand !== state.builder.scaleBand && state.builder.detailMode === 'guided'
          ? getGuidedBuilder(state.builder, scaleBand)
          : { ...state.builder, scaleBand };

      return {
        view,
        ...deriveState(builder, state.selection),
      };
    }),

  selection: null,
  setSelection: (selection) =>
    set((state) => ({
      selection,
      layers: deriveLayers(state.builder, selection),
    })),
  setPrintMetrics: (printMetrics) => set({ printMetrics }),
  clearSelection: () =>
    set((state) => ({
      selection: null,
      ...deriveState({ ...state.builder, focusMode: 'none' }, null),
    })),

  setPreset: (preset) =>
    set((state) => {
      const builder = {
        ...state.builder,
        ...getPresetDefaults(preset, state.builder.scaleBand),
        preset,
        detailMode: 'guided' as const,
      };
      return deriveState(builder, state.selection);
    }),
  setSelectionTarget: (selectionTarget) =>
    set((state) => ({
      builder: { ...state.builder, selectionTarget },
    })),

  setLabelDensity: (labels) =>
    set((state) => deriveState({ ...state.builder, labels, detailMode: 'custom' }, state.selection)),
  setRoadDensity: (roads) =>
    set((state) => deriveState({ ...state.builder, roads, detailMode: 'custom' }, state.selection)),
  setNatureDensity: (nature) =>
    set((state) => deriveState({ ...state.builder, nature, detailMode: 'custom' }, state.selection)),
  setBorderDensity: (borders) =>
    set((state) => deriveState({ ...state.builder, borders, detailMode: 'custom' }, state.selection)),
  resetDetailsToGuided: () =>
    set((state) => deriveState(getGuidedBuilder(state.builder, state.builder.scaleBand), state.selection)),

  setFocusMode: (focusMode) =>
    set((state) => ({
      builder: { ...state.builder, focusMode },
    })),
  toggleAdvancedOpen: () =>
    set((state) => ({
      builder: { ...state.builder, advancedOpen: !state.builder.advancedOpen },
    })),
  setAdvancedOverride: (group, value) =>
    set((state) =>
      deriveState(
        {
          ...state.builder,
          advancedOverrides: { ...state.builder.advancedOverrides, [group]: value },
        },
        state.selection
      )
    ),
  clearAdvancedOverrides: () =>
    set((state) =>
      deriveState(
        {
          ...state.builder,
          advancedOverrides: {},
        },
        state.selection
      )
    ),

  panelOpen: false,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
