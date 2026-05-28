import type { MapGeoJSONFeature } from 'maplibre-gl';
import { classifyLayer } from '@/lib/map/layers';
import type { LayerGroup } from '@/types/map';
import type { PrintRegionScope, PrintVisibleRegion } from '@/types/order';

const SCOPE_LABELS: Record<PrintRegionScope, string> = {
  country: 'Countries',
  state: 'States',
  county: 'Counties',
  city: 'Cities & Towns',
};

const SCOPE_ORDER: PrintRegionScope[] = ['country', 'state', 'county', 'city'];

export function getPrintScopeLabel(scope: PrintRegionScope): string {
  return SCOPE_LABELS[scope];
}

export function getPrintScopeOrder(scope: PrintRegionScope): number {
  return SCOPE_ORDER.indexOf(scope);
}

export function getRegionScopeFromLayerGroup(layerGroup: LayerGroup | null): PrintRegionScope | null {
  switch (layerGroup) {
    case 'countrylabels':
      return 'country';
    case 'statelabels':
      return 'state';
    case 'cities':
    case 'towns':
    case 'capitals':
      return 'city';
    default:
      return null;
  }
}

function getFeatureName(feature: MapGeoJSONFeature): string | null {
  const props = feature.properties;
  if (!props) return null;

  const raw =
    (props['name:latin'] as string | undefined) ||
    (props.name as string | undefined) ||
    (props.name_en as string | undefined) ||
    null;

  if (!raw) return null;
  const name = raw.trim();
  return name.length > 0 ? name : null;
}

export function captureVisibleRegions(rendered: MapGeoJSONFeature[]): PrintVisibleRegion[] {
  const deduped = new Map<string, PrintVisibleRegion>();

  for (const feature of rendered) {
    if (!feature.layer || feature.layer.type !== 'symbol') continue;

    const name = getFeatureName(feature);
    if (!name) continue;

    const scope = getRegionScopeFromLayerGroup(classifyLayer(feature.layer.id));
    if (!scope) continue;

    const id = `${scope}:${name.toLowerCase()}`;
    if (!deduped.has(id)) {
      deduped.set(id, { id, name, scope });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const scopeDelta = getPrintScopeOrder(a.scope) - getPrintScopeOrder(b.scope);
    if (scopeDelta !== 0) return scopeDelta;
    return a.name.localeCompare(b.name);
  });
}
