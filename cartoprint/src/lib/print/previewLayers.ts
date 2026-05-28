import type { BuilderState, LayerState, MapSelection } from '@/types/map';

function isFocusedRegion(selection: MapSelection | null): boolean {
  if (!selection) return false;
  const type = selection.type.toLowerCase();
  return (
    type.includes('state') ||
    type.includes('province') ||
    type.includes('county') ||
    type.includes('city') ||
    type.includes('town') ||
    type.includes('village')
  );
}

export function getPrintPreviewLayers(
  layers: LayerState,
  builder: BuilderState,
  selection: MapSelection | null
): LayerState {
  const previewLayers = { ...layers };
  const focusedRegion = isFocusedRegion(selection);

  // The live map intentionally gates detail for usability. A print preview should honor
  // the user's requested detail when the print has a focused subject and larger canvas.
  if (builder.labels === 'dense' && focusedRegion) {
    previewLayers.capitals = true;
    previewLayers.cities = true;
    previewLayers.towns = true;
  }

  if (builder.roads === 'streets' && focusedRegion) {
    previewLayers.highways = true;
    previewLayers.mainroads = true;
    previewLayers.allroads = true;
  }

  previewLayers.water = true;
  previewLayers.waterlabels = layers.waterlabels;
  previewLayers.rivers = builder.nature === 'water' || builder.nature === 'terrain';
  previewLayers.riverlabels = previewLayers.rivers && layers.riverlabels;

  if (builder.borders === 'county' && selection?.type.toLowerCase() !== 'country') {
    previewLayers.states = true;
    previewLayers.counties = true;
  }

  return previewLayers;
}
