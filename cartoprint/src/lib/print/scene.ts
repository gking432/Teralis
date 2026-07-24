import type { CatalogPrint, CatalogPrintKind } from '@/lib/catalog/prints';
import { DEFAULT_COLOR_SCHEME, type PreviewColorSettings } from '@/lib/print/colorSchemes';
import { defaultTitleBlock, type TitleBlockSettings } from '@/lib/print/titleLayouts';
import { DEFAULT_DETAIL_SETTINGS, type PrintDetailSettings } from '@/lib/print/printRender';
import type { Orientation } from '@/lib/print/printSnapshot';

export const PRINT_SCENE_VERSION = 6;
export const SESSION_SCENE_KEY = 'teralis:print-scene';

export type CompositionPresetId = 'city-detail';
export type CityFramingId = 'city' | 'central' | 'downtown' | 'close-up';
export type PrintFramingId = CityFramingId | 'custom';

export interface PrintViewport {
  bbox: [string, string, string, string];
  center: [number, number];
}

export interface PrintPlace {
  slug: string;
  name: string;
  kind: CatalogPrintKind;
  subtitle: string;
  establishedYear?: string;
  searchQuery: string;
}

export interface PrintScene {
  version: number;
  place: PrintPlace;
  orientation: Orientation;
  composition: CompositionPresetId;
  framing: PrintFramingId;
  viewport: PrintViewport;
  colors: PreviewColorSettings;
  detail: PrintDetailSettings;
  title: TitleBlockSettings;
  updatedAt: number;
}

export function centerFromBbox(bbox: [string, string, string, string]): [number, number] {
  const [south, north, west, east] = bbox.map(Number);
  return [(west + east) / 2, (south + north) / 2];
}

function coordinateLine([longitude, latitude]: [number, number]): string {
  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(4)}° ${latDirection}  ${Math.abs(longitude).toFixed(4)}° ${lonDirection}`;
}

export function createPrintScene(
  print: CatalogPrint,
  orientation: Orientation = 'portrait',
  composition: CompositionPresetId = 'city-detail',
): PrintScene {
  return {
    version: PRINT_SCENE_VERSION,
    place: {
      slug: print.slug,
      name: print.name,
      kind: print.kind,
      subtitle: print.defaultSubtitle,
      establishedYear: print.establishedYear,
      searchQuery: print.searchQuery,
    },
    orientation,
    composition,
    framing: 'city',
    viewport: { bbox: [...print.bbox], center: [...print.center] },
    colors: { ...DEFAULT_COLOR_SCHEME.colors },
    detail: structuredClone(DEFAULT_DETAIL_SETTINGS),
    title: defaultTitleBlock(
      print.defaultTitle,
      print.defaultSubtitle,
      print.kind === 'city'
        ? coordinateLine(print.center)
        : print.establishedYear ? `EST. ${print.establishedYear}` : '',
    ),
    updatedAt: Date.now(),
  };
}

export function sceneMatchesPrint(scene: PrintScene, print: CatalogPrint): boolean {
  return scene.place.slug === print.slug;
}

export function readStoredScene(print?: CatalogPrint): PrintScene | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_SCENE_KEY);
    if (!raw) return null;
    const scene = JSON.parse(raw) as PrintScene;
    if (scene.version !== PRINT_SCENE_VERSION || !scene.viewport?.bbox || !scene.place?.slug) return null;
    if (print && !sceneMatchesPrint(scene, print)) return null;
    return scene;
  } catch {
    return null;
  }
}

export function storeScene(scene: PrintScene): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_SCENE_KEY, JSON.stringify({ ...scene, updatedAt: Date.now() }));
  } catch {}
}

export function sceneCacheTag(scene: PrintScene): string {
  const d = scene.detail;
  const labels = d.labels;
  return [
    `v${scene.version}`,
    scene.orientation,
    scene.composition,
    scene.framing,
    scene.viewport.bbox.join(','),
    d.places,
    d.roads,
    d.border,
    d.rivers ? 'rv1' : 'rv0',
    d.counties ? 'ct1' : 'ct0',
    d.states ? 'st1' : 'st0',
    labels.cities ? 'lc1' : 'lc0',
    labels.towns ? 'lt1' : 'lt0',
    labels.roads ? 'lr1' : 'lr0',
    labels.water ? 'lw1' : 'lw0',
    labels.rivers ? 'lrv1' : 'lrv0',
  ].join(':');
}

const CITY_FRAME_FACTORS: Record<Exclude<CityFramingId, 'city'>, number> = {
  central: 0.68,
  downtown: 0.42,
  'close-up': 0.24,
};

export function viewportForCityFraming(
  original: PrintViewport,
  cityCenter: [number, number],
  framing: CityFramingId,
): PrintViewport {
  if (framing === 'city') {
    const bbox = [...original.bbox] as PrintViewport['bbox'];
    return { bbox, center: centerFromBbox(bbox) };
  }

  const [south, north, west, east] = original.bbox.map(Number);
  const factor = CITY_FRAME_FACTORS[framing];
  const latSpan = (north - south) * factor;
  const lonSpan = (east - west) * factor;
  const [longitude, latitude] = cityCenter;
  const bbox = [
    latitude - latSpan / 2,
    latitude + latSpan / 2,
    longitude - lonSpan / 2,
    longitude + lonSpan / 2,
  ].map(String) as PrintViewport['bbox'];

  return { bbox, center: [longitude, latitude] };
}

export function transformViewport(
  viewport: PrintViewport,
  operation: 'zoom-in' | 'zoom-out' | 'left' | 'right' | 'up' | 'down' | 'reset',
  original?: PrintViewport,
): PrintViewport {
  if (operation === 'reset' && original) {
    return { bbox: [...original.bbox], center: [...original.center] };
  }

  const [south, north, west, east] = viewport.bbox.map(Number);
  const lonSpan = east - west;
  const latSpan = north - south;
  let nextSouth = south;
  let nextNorth = north;
  let nextWest = west;
  let nextEast = east;

  if (operation === 'zoom-in' || operation === 'zoom-out') {
    const factor = operation === 'zoom-in' ? 0.78 : 1.28;
    const [lon, lat] = viewport.center;
    nextWest = lon - (lonSpan * factor) / 2;
    nextEast = lon + (lonSpan * factor) / 2;
    nextSouth = lat - (latSpan * factor) / 2;
    nextNorth = lat + (latSpan * factor) / 2;
  } else {
    const lonShift = lonSpan * 0.16 * (operation === 'left' ? -1 : operation === 'right' ? 1 : 0);
    const latShift = latSpan * 0.16 * (operation === 'down' ? -1 : operation === 'up' ? 1 : 0);
    nextWest += lonShift;
    nextEast += lonShift;
    nextSouth += latShift;
    nextNorth += latShift;
  }

  const bbox = [nextSouth, nextNorth, nextWest, nextEast].map(String) as PrintViewport['bbox'];
  return { bbox, center: centerFromBbox(bbox) };
}

export function panViewportByPixels(
  viewport: PrintViewport,
  dx: number,
  dy: number,
  width: number,
  height: number,
): PrintViewport {
  const [south, north, west, east] = viewport.bbox.map(Number);
  const lonShift = -(dx / Math.max(width, 1)) * (east - west);
  const latShift = (dy / Math.max(height, 1)) * (north - south);
  const bbox = [
    south + latShift,
    north + latShift,
    west + lonShift,
    east + lonShift,
  ].map(String) as PrintViewport['bbox'];
  return { bbox, center: centerFromBbox(bbox) };
}
