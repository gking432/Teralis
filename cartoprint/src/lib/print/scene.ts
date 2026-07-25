import type { CatalogPrint, CatalogPrintKind } from '@/lib/catalog/prints';
import type { PreviewColorSettings } from '@/lib/print/colorSchemes';
import { defaultTitleDesign, titleCacheTag, type TitleDesign } from '@/lib/print/title';
import { DEFAULT_DETAIL_SETTINGS, type PrintDetailSettings } from '@/lib/print/printRender';
import type { Orientation } from '@/lib/print/orientation';
import { DEFAULT_LOOK, getLook, type Look } from '@/lib/print/looks';
import {
  radiusForPlaceBbox,
  viewportForRadius,
  type Viewport,
} from '@/lib/print/framing';
import { printGeometry } from '@/lib/print/geometry';
import { resolveDensity, type DetailBias, type ResolvedDensity } from '@/lib/print/density';
import type { SizeLabel } from '@/lib/print/sizeCatalog';

export const PRINT_SCENE_VERSION = 8;
export const SESSION_SCENE_KEY = 'teralis:print-scene';

export type PrintViewport = Viewport;

export interface PrintPlace {
  slug: string;
  name: string;
  kind: CatalogPrintKind;
  subtitle: string;
  establishedYear?: string;
  searchQuery: string;
  /** The place's own extent, used to reset framing. */
  placeRadiusMiles: number;
  center: [number, number];
}

export interface PrintScene {
  version: number;
  place: PrintPlace;
  orientation: Orientation;
  lookId: string;
  /** Framing radius in miles. Authoritative unless the user free-pans. */
  radiusMiles: number;
  /** Center the radius is measured around. Moves when the user pans. */
  focus: [number, number];
  /** True once the user has dragged away from the radius-centered view. */
  freeViewport: boolean;
  viewport: PrintViewport;
  colors: PreviewColorSettings;
  strokeWeight: number;
  /**
   * Paper size. It lives in the scene because it changes the ARTWORK, not just
   * the checkout line item: a bigger sheet can legibly carry more streets and
   * more town names for the same piece of ground.
   */
  size: SizeLabel;
  /** User nudge on the resolved density: −1 cleaner, 0 automatic, +1 maximum. */
  detailBias: DetailBias;
  /**
   * True while place-name visibility is still following the resolver. Flips off
   * the first time the user toggles a place label by hand, so an explicit
   * choice is never silently overwritten by a reframe.
   */
  labelsAuto: boolean;
  detail: PrintDetailSettings;
  title: TitleDesign;
  updatedAt: number;
}

export function centerFromBbox(bbox: [string, string, string, string]): [number, number] {
  const [south, north, west, east] = bbox.map(Number);
  return [(west + east) / 2, (south + north) / 2];
}

export function coordinateLine([longitude, latitude]: [number, number]): string {
  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(4)}° ${latDirection}  ${Math.abs(longitude).toFixed(4)}° ${lonDirection}`;
}

/** The non-density part of a look: border weight and the base layer choices. */
export function detailForLook(look: Look, kind: CatalogPrintKind): PrintDetailSettings {
  const isCountry = kind === 'country';
  return {
    ...structuredClone(DEFAULT_DETAIL_SETTINGS),
    border: look.border,
    rivers: true,
    counties: false,
    states: isCountry,
    labels: {
      cities: kind !== 'city',
      towns: kind === 'state',
      roads: false,
      water: false,
      rivers: false,
    },
  };
}

/** What this scene's framing and paper size can actually carry. */
export function sceneDensity(scene: PrintScene): ResolvedDensity {
  return resolveDensity({
    kind: scene.place.kind,
    radiusMiles: scene.radiusMiles,
    size: scene.size,
    orientation: scene.orientation,
    bias: scene.detailBias,
  });
}

/**
 * Re-derive how much is drawn. Runs after anything that changes the framing,
 * the paper, or the bias — so "every street" appears and disappears for the
 * right reason instead of being a setting the user has to find and manage.
 */
export function syncDetail(scene: PrintScene): PrintScene {
  const density = sceneDensity(scene);
  return {
    ...scene,
    detail: {
      ...scene.detail,
      roads: density.roads,
      places: density.places,
      labels: scene.labelsAuto
        ? {
            ...scene.detail.labels,
            cities: scene.place.kind !== 'city' && density.places !== 'none',
            towns: scene.place.kind !== 'city' && (density.places === 'more' || density.places === 'neutral'),
          }
        : scene.detail.labels,
    },
  };
}

/**
 * The aspect the camera must fit — the MAP area, not the sheet. Border
 * thickness and a reserved title band both change it, so framing has to be
 * recomputed whenever they do or the radius would silently mean something else.
 */
export function mapRatioForScene(scene: Pick<PrintScene, 'orientation' | 'detail' | 'title'>): number {
  return printGeometry(scene.orientation, scene.detail.border, scene.title).mapRatio;
}

/**
 * Recompute the viewport from the framing radius. A no-op once the user has
 * panned or zoomed by hand — their composition wins until they reframe.
 */
export function syncViewport(scene: PrintScene): PrintScene {
  if (scene.freeViewport) return scene;
  return {
    ...scene,
    viewport: viewportForRadius(scene.focus, scene.radiusMiles, mapRatioForScene(scene)),
  };
}

export function createPrintScene(
  print: CatalogPrint,
  orientation: Orientation = 'portrait',
  look: Look = DEFAULT_LOOK,
): PrintScene {
  const placeRadiusMiles = radiusForPlaceBbox(print.bbox);
  const center: [number, number] = [...print.center];

  const base: PrintScene = {
    version: PRINT_SCENE_VERSION,
    place: {
      slug: print.slug,
      name: print.name,
      kind: print.kind,
      subtitle: print.defaultSubtitle,
      establishedYear: print.establishedYear,
      searchQuery: print.searchQuery,
      placeRadiusMiles,
      center,
    },
    orientation,
    lookId: look.id,
    radiusMiles: placeRadiusMiles,
    focus: [...center] as [number, number],
    freeViewport: false,
    viewport: { bbox: [...print.bbox], center },
    colors: { ...look.colors },
    strokeWeight: look.strokeWeight,
    size: 'medium',
    detailBias: 0,
    labelsAuto: true,
    detail: detailForLook(look, print.kind),
    title: defaultTitleDesign(
      print.defaultTitle,
      print.defaultSubtitle,
      print.kind === 'city'
        ? coordinateLine(center)
        : print.establishedYear ? `EST. ${print.establishedYear}` : '',
    ),
    updatedAt: Date.now(),
  };

  return normalizeScene(base);
}

/**
 * The single place a scene is made self-consistent: framing follows the radius,
 * and density follows the framing and the paper. Every mutation runs through
 * this so no control can leave the scene in a state that contradicts itself.
 */
export function normalizeScene(scene: PrintScene): PrintScene {
  return syncDetail(syncViewport(scene));
}

/** Apply a look to an existing scene, preserving the user's words and framing. */
export function applyLook(scene: PrintScene, look: Look): PrintScene {
  return normalizeScene({
    ...scene,
    lookId: look.id,
    colors: { ...look.colors },
    strokeWeight: look.strokeWeight,
    detail: {
      ...detailForLook(look, scene.place.kind),
      // Preserve label choices the user explicitly made.
      labels: scene.detail.labels,
    },
    title: {
      ...scene.title,
      slot: look.titleSlot,
      panel: look.titlePanel,
      // Drop manual color overrides so the new look's automatic pairing wins.
      textColor: undefined,
      panelColor: undefined,
    },
    updatedAt: Date.now(),
  });
}

/**
 * Re-derive the viewport from a framing radius. If the user had panned, the
 * radius is re-centered on where they actually are rather than yanking the map
 * back to the geocoder's idea of the place center.
 */
export function reframe(scene: PrintScene, radiusMiles: number): PrintScene {
  return normalizeScene({
    ...scene,
    focus: scene.freeViewport ? [...scene.viewport.center] as [number, number] : scene.focus,
    radiusMiles,
    freeViewport: false,
    updatedAt: Date.now(),
  });
}

/** Reset framing to the place's own extent, centered on the place itself. */
export function resetFraming(scene: PrintScene): PrintScene {
  return normalizeScene({
    ...scene,
    focus: [...scene.place.center] as [number, number],
    radiusMiles: scene.place.placeRadiusMiles,
    freeViewport: false,
    updatedAt: Date.now(),
  });
}

/** Record a camera move the user made by hand. */
export function setFreeViewport(scene: PrintScene, viewport: PrintViewport, radiusMiles: number): PrintScene {
  return {
    ...scene,
    viewport,
    radiusMiles,
    focus: [...viewport.center] as [number, number],
    freeViewport: true,
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

export function sceneLook(scene: PrintScene): Look {
  return getLook(scene.lookId);
}

/** Cache tag covering everything that changes the rendered artwork. */
export function sceneCacheTag(scene: PrintScene): string {
  const d = scene.detail;
  const labels = d.labels;
  return [
    `v${scene.version}`,
    scene.orientation,
    scene.lookId,
    scene.viewport.bbox.join(','),
    scene.colors.land, scene.colors.water, scene.colors.roads,
    scene.strokeWeight.toFixed(2),
    d.places, d.roads, d.border,
    d.rivers ? 'rv1' : 'rv0',
    d.counties ? 'ct1' : 'ct0',
    d.states ? 'st1' : 'st0',
    labels.cities ? 'lc1' : 'lc0',
    labels.towns ? 'lt1' : 'lt0',
    labels.roads ? 'lr1' : 'lr0',
    labels.water ? 'lw1' : 'lw0',
    labels.rivers ? 'lrv1' : 'lrv0',
    titleCacheTag(scene.title),
  ].join(':');
}
