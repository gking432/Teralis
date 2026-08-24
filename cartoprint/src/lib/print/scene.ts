import type { CatalogPrint, CatalogPrintKind } from '@/lib/catalog/prints';
import type { PreviewColorSettings } from '@/lib/print/colorSchemes';
import { defaultTitleDesign, rectForSlot, titleCacheTag, type TitleDesign } from '@/lib/print/title';
import { DEFAULT_DETAIL_SETTINGS, type PrintDetailSettings } from '@/lib/print/printRender';
import type { Orientation } from '@/lib/print/orientation';
import { DEFAULT_LAYOUT, getLayout, type Layout } from '@/lib/print/layouts';
import { DEFAULT_PALETTE, getPalette, type Palette } from '@/lib/print/palettes';
import {
  radiusForPlaceBbox,
  radiusForPlaceBboxAtRatio,
  defaultFramingRadius,
  ratioForOrientation,
  viewportForRadius,
  type Viewport,
} from '@/lib/print/framing';
import { printGeometry } from '@/lib/print/geometry';
import { resolveDensity, type DetailBias, type ResolvedDensity } from '@/lib/print/density';
import type { SizeLabel } from '@/lib/print/sizeCatalog';
import { makePalettePrintable } from '@/lib/print/contrast';
import {
  decorationCacheTag,
  defaultIllustrationDesign,
  type IllustrationDesign,
} from '@/lib/print/decorations';

export const PRINT_SCENE_VERSION = 15;
export const SESSION_SCENE_KEY = 'teralis:print-scene';

export type PrintViewport = Viewport;

export interface PrintPlace {
  slug: string;
  name: string;
  kind: CatalogPrintKind;
  /** Human geography subtype, while `kind` remains the rendering mode. */
  placeType: string;
  subtitle: string;
  establishedYear?: string;
  searchQuery: string;
  /** The place's own extent, used to reset framing. */
  placeRadiusMiles: number;
  /** Authoritative place bounds, used to keep an isolated state on the sheet. */
  bbox: [string, string, string, string];
  center: [number, number];
}

export interface PrintScene {
  version: number;
  place: PrintPlace;
  orientation: Orientation;
  /** Where the words sit and how the sheet is framed. */
  layoutId: string;
  /** What colour it is drawn in. Independent of the layout. */
  paletteId: string;
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
  /** Illustrated geography and personal story elements baked into the print. */
  illustration: IllustrationDesign;
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

/** The non-density part of the design: border weight and base layer choices. */
export function detailForLayout(layout: Layout, kind: CatalogPrintKind): PrintDetailSettings {
  const isCountry = kind === 'country';
  return {
    ...structuredClone(DEFAULT_DETAIL_SETTINGS),
    border: layout.border,
    rivers: true,
    counties: false,
    states: isCountry,
    labels: {
      // City prints are named by their optional title; state prints are
      // structural road-and-water studies rather than crowded gazetteers.
      cities: kind === 'country',
      towns: false,
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
    lonSpanDegrees: Math.abs(Number(scene.viewport.bbox[3]) - Number(scene.viewport.bbox[2])),
  });
}

/**
 * Re-derive how much is drawn. Runs after anything that changes the framing,
 * the paper, or the bias — so "every street" appears and disappears for the
 * right reason instead of being a setting the user has to find and manage.
 */
export function syncDetail(scene: PrintScene): PrintScene {
  const density = sceneDensity(scene);
  const isState = scene.place.kind === 'state';
  const illustratedRoads = scene.illustration?.layers.roads;
  const stateRoads = illustratedRoads === 'hidden'
    ? 'none'
    : scene.detailBias === 1
      ? 'neutral'
    : illustratedRoads === 'minimal' || illustratedRoads === 'doodle'
      ? 'less'
      : density.roads;
  return {
    ...scene,
    detail: {
      ...scene.detail,
      roads: isState ? stateRoads : density.roads,
      places: isState ? 'none' : density.places,
      rivers: isState
        ? scene.illustration.layers.water !== 'hidden' && scene.detailBias !== -1
        : scene.detail.rivers,
      counties: isState ? scene.detailBias === 1 : scene.detail.counties,
      labels: scene.labelsAuto
        ? {
            ...scene.detail.labels,
            cities: scene.place.kind === 'country' && density.places !== 'none',
            towns: false,
          }
        : isState
          ? { ...scene.detail.labels, cities: false, towns: false }
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

/** Closest safe state framing for the current sheet, border, and title band. */
export function minimumStateRadius(scene: PrintScene): number {
  if (scene.place.kind !== 'state') return 0;
  return radiusForPlaceBboxAtRatio(scene.place.bbox, mapRatioForScene(scene)) * 1.06;
}

/**
 * State prints are product compositions, not free maps. Keep the complete
 * isolated state centered and let the zoom slider add breathing room only.
 */
function constrainStateFraming(scene: PrintScene): PrintScene {
  if (scene.place.kind !== 'state') return scene;
  return {
    ...scene,
    focus: [...scene.place.center] as [number, number],
    radiusMiles: Math.max(scene.radiusMiles, minimumStateRadius(scene)),
    freeViewport: false,
  };
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
  palette: Palette = DEFAULT_PALETTE,
  layout: Layout = DEFAULT_LAYOUT,
): PrintScene {
  const effectivePalette = print.kind === 'state' && palette.id === DEFAULT_PALETTE.id
    ? getPalette('bone')
    : palette;
  const placeRadiusMiles = print.kind === 'city'
    ? radiusForPlaceBbox(print.bbox)
    : radiusForPlaceBboxAtRatio(print.bbox, ratioForOrientation(orientation)) * 1.06;
  const radiusMiles = defaultFramingRadius(placeRadiusMiles, print.kind);
  const center: [number, number] = [...print.center];

  const base: PrintScene = {
    version: PRINT_SCENE_VERSION,
    place: {
      slug: print.slug,
      name: print.name,
      kind: print.kind,
      placeType: print.placeType || print.kind,
      subtitle: print.defaultSubtitle,
      establishedYear: print.establishedYear,
      searchQuery: print.searchQuery,
      placeRadiusMiles,
      bbox: [...print.bbox],
      center,
    },
    orientation,
    layoutId: layout.id,
    paletteId: effectivePalette.id,
    radiusMiles,
    focus: [...center] as [number, number],
    freeViewport: false,
    viewport: { bbox: [...print.bbox], center },
    colors: { ...effectivePalette.colors },
    strokeWeight: effectivePalette.strokeWeight,
    size: 'medium',
    detailBias: 0,
    labelsAuto: true,
    detail: detailForLayout(layout, print.kind),
    title: {
      ...applyLayoutToTitle(defaultTitleDesign(
        print.defaultTitle,
        print.defaultSubtitle,
        print.kind === 'city'
          ? coordinateLine(center)
          : print.establishedYear ? `EST. ${print.establishedYear}` : '',
      ), layout),
      // Framing and color come first. The label is introduced only when the
      // customer reaches the composition step.
      ...(print.kind === 'state'
        ? { slot: 'footer-tall' as const, ...rectForSlot('footer-tall') }
        : {}),
      enabled: print.kind === 'state',
      font: print.kind === 'state' ? 'hand' : 'editorial',
    },
    illustration: defaultIllustrationDesign(print.slug, print.kind, center),
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
  return syncDetail(syncViewport(constrainStateFraming({
    ...scene,
    place: {
      ...scene.place,
      placeType: scene.place.placeType || scene.place.kind,
    },
    illustration: scene.illustration ?? defaultIllustrationDesign(scene.place.slug, scene.place.kind, scene.place.center),
    title: { ...scene.title, font: scene.title.font ?? 'editorial' },
    colors: makePalettePrintable(scene.colors),
  })));
}

/** Move the title block to wherever a layout puts it, keeping the words. */
export function applyLayoutToTitle(title: TitleDesign, layout: Layout): TitleDesign {
  const rect = rectForSlot(layout.titleSlot);
  return {
    ...title,
    enabled: layout.titleEnabled,
    slot: layout.titleSlot,
    panel: layout.titlePanel,
    align: layout.align,
    // A layout change re-derives colours; a manual override would otherwise
    // survive into a scheme it was never chosen for.
    textColor: undefined,
    panelColor: undefined,
    backdropColor: undefined,
    // Auto-placed layouts get their rect computed from the artwork once it has
    // rendered. Until then, fall back to the slot's own geometry.
    autoPlaced: Boolean(layout.autoPlace),
    onWater: layout.autoPlace === 'water',
    ...(layout.titleSlot === 'free' ? {} : rect),
  };
}

/** Apply a layout, preserving the words, the framing, and the colours. */
export function applyLayout(scene: PrintScene, layout: Layout): PrintScene {
  return normalizeScene({
    ...scene,
    layoutId: layout.id,
    detail: {
      ...detailForLayout(layout, scene.place.kind),
      labels: scene.detail.labels,
    },
    title: applyLayoutToTitle(scene.title, layout),
    updatedAt: Date.now(),
  });
}

/** Apply a palette, preserving everything about the composition. */
export function applyPalette(scene: PrintScene, palette: Palette): PrintScene {
  return normalizeScene({
    ...scene,
    paletteId: palette.id,
    colors: { ...palette.colors },
    strokeWeight: palette.strokeWeight,
    title: {
      ...scene.title,
      // Let the new palette derive its own title colours.
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
  if (scene.place.kind === 'state') return reframe(scene, radiusMiles);
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

export function sceneLayout(scene: PrintScene): Layout {
  return getLayout(scene.layoutId);
}

export function scenePalette(scene: PrintScene): Palette {
  return getPalette(scene.paletteId);
}

/** Cache tag covering everything that changes the rendered artwork. */
export function sceneCacheTag(scene: PrintScene): string {
  const d = scene.detail;
  const labels = d.labels;
  return [
    `v${scene.version}`,
    scene.place.slug,
    scene.orientation,
    scene.size,
    scene.detailBias,
    scene.layoutId,
    scene.paletteId,
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
    decorationCacheTag(scene.illustration),
  ].join(':');
}
