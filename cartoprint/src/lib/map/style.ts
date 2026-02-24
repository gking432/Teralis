import type { Map as MaplibreMap } from 'maplibre-gl';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const TERRAIN_TILES_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const BACKGROUND_COLOR = '#fafaf8';
export const WATER_COLOR = '#d0d0ce';
export const WATERWAY_COLOR = '#bbbbb8';
export const COUNTRY_BORDER_COLOR = '#333';
export const STATE_BORDER_COLOR = '#555';

let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCtx() {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = 1;
    _canvas.height = 1;
    _ctx = _canvas.getContext('2d')!;
  }
  return _ctx!;
}

export function colorToGrey(color: string): string {
  const ctx = getCtx();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return a < 255
    ? `rgba(${lum},${lum},${lum},${(a / 255).toFixed(2)})`
    : `rgb(${lum},${lum},${lum})`;
}

export function greyify(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
      return colorToGrey(value);
    }
  }
  if (Array.isArray(value)) {
    return value.map((v) => greyify(v));
  }
  return value;
}

const COLOR_PROPS = [
  'fill-color', 'fill-outline-color',
  'line-color',
  'text-color', 'text-halo-color',
  'icon-color', 'icon-halo-color',
  'circle-color', 'circle-stroke-color',
] as const;

export function applyGreyscale(map: MaplibreMap): void {
  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    if (layer.id === 'background') {
      try { map.setPaintProperty('background', 'background-color', BACKGROUND_COLOR); } catch {}
      return;
    }

    const paint = (layer as any).paint || {};
    COLOR_PROPS.forEach((prop) => {
      if (paint[prop] !== undefined) {
        try { map.setPaintProperty(layer.id, prop, greyify(paint[prop]) as any); } catch {}
      }
    });
  });
}

export function applyStyleOverrides(map: MaplibreMap): void {
  const style = map.getStyle();
  if (!style) return;

  style.layers.forEach((layer) => {
    const id = layer.id;

    if (/admin.*country|admin.*2|boundary.*country/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-color', COUNTRY_BORDER_COLOR);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 2, 8, 3]);
        map.setLayerZoomRange(id, 0, 24);
      } catch {}
    }

    if (/admin.*(state|3|4)|boundary.*(state|3|4)/.test(id) && layer.type === 'line') {
      try {
        map.setPaintProperty(id, 'line-color', STATE_BORDER_COLOR);
        map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'], 2, 0.8, 5, 1.5, 8, 2.5]);
        map.setLayerZoomRange(id, 2, 24);
      } catch {}
    }

    if (/^water$/.test(id) && layer.type === 'fill') {
      try { map.setPaintProperty(id, 'fill-color', WATER_COLOR); } catch {}
    }
    if (/waterway/.test(id) && layer.type === 'line') {
      try { map.setPaintProperty(id, 'line-color', WATERWAY_COLOR); } catch {}
    }

    if (/motorway/.test(id) && !/link|casing/.test(id) && layer.type === 'line') {
      try { map.setLayerZoomRange(id, 3, 24); } catch {}
    }

    if (/place.*(city|capital)/.test(id) && layer.type === 'symbol') {
      try { map.setLayerZoomRange(id, 3, 24); } catch {}
    }

    if (id === 'natural_earth') {
      try { map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
    }
  });
}

export function addTerrain(map: MaplibreMap): void {
  map.addSource('terrain-dem', {
    type: 'raster-dem',
    tiles: [TERRAIN_TILES_URL],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
  });

  map.addLayer(
    {
      id: 'hillshade-layer',
      type: 'hillshade',
      source: 'terrain-dem',
      paint: {
        'hillshade-exaggeration': 0.35,
        'hillshade-shadow-color': '#555',
        'hillshade-highlight-color': BACKGROUND_COLOR,
        'hillshade-accent-color': '#777',
      },
      layout: { visibility: 'none' },
    },
    'waterway_tunnel'
  );
}
