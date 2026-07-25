import type { PrintScene } from '@/lib/print/scene';
import type { TitleDesign, TitlePanel, TitleSlot } from '@/lib/print/title';
import type { Orientation } from '@/lib/print/orientation';
import type { BorderWeight, Density } from '@/lib/print/printRender';
import type { DetailBias } from '@/lib/print/density';
import type { SizeLabel } from '@/lib/print/sizeCatalog';

/**
 * Shareable designs.
 *
 * The design used to live only in sessionStorage, so closing the tab destroyed
 * it and there was no way to send someone your map. We now serialise the whole
 * design into a single compact URL parameter: the URL is the save file.
 */

export const DESIGN_PARAM = 'd';

interface PackedDesign {
  v: number;
  o: Orientation;
  l: string;              // look id
  r: number;              // radius miles
  f: 0 | 1;               // free viewport
  b: [string, string, string, string];
  c: [number, number];    // center
  col: [string, string, string];
  sw: number;             // stroke weight
  d: [Density, Density, BorderWeight, number]; // places, roads, border, flag bits
  lb: number;             // label bitfield
  t: [string, string, string, TitleSlot, TitlePanel, string, string, string]; // text..., colors
  tr: [number, number, number, number, number]; // x, y, w, h, rotation
  te: 0 | 1;              // title enabled
  ta: 'left' | 'center';
  sz: SizeLabel;          // paper size — changes what the art can carry
  db: DetailBias;         // detail bias
  la: 0 | 1;              // place labels still following the resolver
}

// Bumped when the packed shape changes; older links decode to null and fall
// back to a fresh scene rather than restoring a half-populated design.
const DESIGN_VERSION = 2;

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDesign(scene: PrintScene): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const d = scene.detail;
    const packed: PackedDesign = {
      v: DESIGN_VERSION,
      o: scene.orientation,
      l: scene.lookId,
      r: Number(scene.radiusMiles.toFixed(3)),
      f: scene.freeViewport ? 1 : 0,
      b: scene.viewport.bbox,
      c: scene.viewport.center,
      col: [scene.colors.land, scene.colors.water, scene.colors.roads],
      sw: Number(scene.strokeWeight.toFixed(3)),
      d: [
        d.places,
        d.roads,
        d.border,
        (d.rivers ? 1 : 0) | (d.counties ? 2 : 0) | (d.states ? 4 : 0),
      ],
      lb:
        (d.labels.cities ? 1 : 0) |
        (d.labels.towns ? 2 : 0) |
        (d.labels.roads ? 4 : 0) |
        (d.labels.water ? 8 : 0) |
        (d.labels.rivers ? 16 : 0),
      t: [
        scene.title.text,
        scene.title.subtitle,
        scene.title.detail,
        scene.title.slot,
        scene.title.panel,
        scene.title.textColor ?? '',
        scene.title.panelColor ?? '',
        '',
      ],
      tr: [
        Number(scene.title.x.toFixed(4)),
        Number(scene.title.y.toFixed(4)),
        Number(scene.title.w.toFixed(4)),
        Number(scene.title.h.toFixed(4)),
        Number(scene.title.rotation.toFixed(2)),
      ],
      te: scene.title.enabled ? 1 : 0,
      ta: scene.title.align,
      sz: scene.size,
      db: scene.detailBias,
      la: scene.labelsAuto ? 1 : 0,
    };
    return encodeBase64Url(JSON.stringify(packed));
  } catch {
    return null;
  }
}

export interface DecodedDesign {
  orientation: Orientation;
  lookId: string;
  radiusMiles: number;
  freeViewport: boolean;
  viewport: PrintScene['viewport'];
  colors: PrintScene['colors'];
  strokeWeight: number;
  size: SizeLabel;
  detailBias: DetailBias;
  labelsAuto: boolean;
  detail: PrintScene['detail'];
  title: TitleDesign;
}

export function decodeDesign(encoded: string | null): DecodedDesign | null {
  if (!encoded || typeof window === 'undefined') return null;
  try {
    const packed = JSON.parse(decodeBase64Url(encoded)) as PackedDesign;
    if (packed.v !== DESIGN_VERSION) return null;

    const [places, roads, border, flags] = packed.d;
    return {
      orientation: packed.o,
      lookId: packed.l,
      radiusMiles: packed.r,
      freeViewport: packed.f === 1,
      viewport: { bbox: packed.b, center: packed.c },
      colors: { land: packed.col[0], water: packed.col[1], roads: packed.col[2] },
      strokeWeight: packed.sw,
      size: packed.sz,
      detailBias: packed.db,
      labelsAuto: packed.la === 1,
      detail: {
        places,
        roads,
        border,
        rivers: Boolean(flags & 1),
        counties: Boolean(flags & 2),
        states: Boolean(flags & 4),
        labels: {
          cities: Boolean(packed.lb & 1),
          towns: Boolean(packed.lb & 2),
          roads: Boolean(packed.lb & 4),
          water: Boolean(packed.lb & 8),
          rivers: Boolean(packed.lb & 16),
        },
      },
      title: {
        enabled: packed.te === 1,
        text: packed.t[0],
        subtitle: packed.t[1],
        detail: packed.t[2],
        slot: packed.t[3],
        panel: packed.t[4],
        align: packed.ta,
        textColor: packed.t[5] || undefined,
        panelColor: packed.t[6] || undefined,
        x: packed.tr[0],
        y: packed.tr[1],
        w: packed.tr[2],
        h: packed.tr[3],
        rotation: packed.tr[4],
      },
    };
  } catch {
    return null;
  }
}
