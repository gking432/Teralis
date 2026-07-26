'use client';

import { getBorderFraction } from '@/lib/print/printRender';
import { slotReservesBand } from '@/lib/print/title';
import { readableInk } from '@/lib/print/contrast';
import type { Layout } from '@/lib/print/layouts';
import type { Palette } from '@/lib/print/palettes';

/**
 * Two swatches, because there are now two decisions.
 *
 * `LayoutSwatch` varies only the composition and is drawn in a neutral grey, so
 * scanning the row shows you where the words go and nothing else.
 * `PaletteSwatch` varies only the colour and holds the composition fixed. When
 * one swatch changed six things at once it was impossible to tell which control
 * was responsible for what.
 */

const STREETS_H = [0.16, 0.3, 0.46, 0.62, 0.79];
const STREETS_V = [0.13, 0.28, 0.41, 0.57, 0.72, 0.87];

interface MiniProps {
  land: string;
  water: string;
  roads: string;
  ink: string;
  layout: Pick<Layout, 'titleSlot' | 'titlePanel' | 'border' | 'titleEnabled' | 'autoPlace'>;
  width: number;
  strokeWeight?: number;
}

function MiniPrint({ land, water, roads, ink, layout, width, strokeWeight = 1 }: MiniProps) {
  const ratio = 4 / 3;
  const height = width * ratio;
  const border = getBorderFraction(layout.border) * width;
  const band = layout.titleEnabled ? slotReservesBand(layout.titleSlot) : null;
  const bandH = band ? height * 0.14 : 0;

  const frameY = band === 'top' ? bandH : 0;
  const frameH = height - bandH;
  const mapX = border;
  const mapY = frameY + border;
  const mapW = width - border * 2;
  const mapH = frameH - border * 2;

  const stroke = Math.max(0.45, 0.7 * strokeWeight);
  const titleInk = readableInk(land, ink);
  // The lake shape the on-water layout targets.
  const lakeY = mapY + mapH * 0.6;
  const lakeH = mapH * 0.4;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <rect width={width} height={height} fill={land} />
      {border > 0 && <rect x={0} y={frameY} width={width} height={frameH} fill={ink} />}
      <rect x={mapX} y={mapY} width={mapW} height={mapH} fill={land} />

      <path
        d={`M${mapX} ${lakeY} C ${mapX + mapW * 0.3} ${lakeY - lakeH * 0.3},
            ${mapX + mapW * 0.55} ${lakeY + lakeH * 0.5},
            ${mapX + mapW} ${lakeY - lakeH * 0.15}
            L ${mapX + mapW} ${mapY + mapH} L ${mapX} ${mapY + mapH} Z`}
        fill={water}
      />

      <g stroke={roads} strokeWidth={stroke} opacity={0.85}>
        {STREETS_H.map((t) => (
          <line key={`h${t}`} x1={mapX} y1={mapY + mapH * t} x2={mapX + mapW} y2={mapY + mapH * t} />
        ))}
        {STREETS_V.map((t) => (
          <line key={`v${t}`} x1={mapX + mapW * t} y1={mapY} x2={mapX + mapW * t} y2={mapY + mapH} />
        ))}
      </g>

      {layout.titleEnabled && band && (
        <g>
          <rect x={0} y={band === 'top' ? 0 : height - bandH} width={width} height={bandH} fill={land} />
          <rect x={0} y={band === 'top' ? bandH : height - bandH} width={width} height={0.6} fill={titleInk} />
          <rect
            x={width * 0.26}
            y={(band === 'top' ? 0 : height - bandH) + bandH * 0.38}
            width={width * 0.48}
            height={bandH * 0.2}
            fill={titleInk}
            opacity={0.85}
          />
        </g>
      )}

      {/* On-water label: drawn ON the lake, in a colour that contrasts it. */}
      {layout.titleEnabled && layout.autoPlace === 'water' && (
        <rect
          x={width * 0.18}
          y={lakeY + lakeH * 0.22}
          width={width * 0.64}
          height={height * 0.03}
          fill={readableInk(water, land)}
        />
      )}

      {/* Corner plaque */}
      {layout.titleEnabled && !band && !layout.autoPlace && (
        <g>
          <rect x={mapX + mapW * 0.06} y={mapY + mapH * 0.06} width={mapW * 0.44} height={mapH * 0.12} fill={land} />
          <rect x={mapX + mapW * 0.1} y={mapY + mapH * 0.1} width={mapW * 0.3} height={mapH * 0.035} fill={titleInk} />
        </g>
      )}
    </svg>
  );
}

/** Composition only. Neutral grey so colour never distracts from placement. */
export function LayoutSwatch({ layout, width = 52 }: { layout: Layout; width?: number }) {
  return (
    <MiniPrint
      layout={layout}
      land="#ffffff"
      water="#c9ced4"
      roads="#9aa2ab"
      ink="#5b646d"
      width={width}
    />
  );
}

/** Colour only. Composition held fixed at the simplest layout. */
export function PaletteSwatch({ palette, width = 52 }: { palette: Palette; width?: number }) {
  const ink = palette.colors.water || palette.colors.roads;
  return (
    <MiniPrint
      layout={{ titleSlot: 'footer', titlePanel: 'solid', border: 'thin', titleEnabled: true }}
      land={palette.colors.land}
      water={palette.colors.water}
      roads={palette.colors.roads}
      ink={ink}
      strokeWeight={palette.strokeWeight}
      width={width}
    />
  );
}
