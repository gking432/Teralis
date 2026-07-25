'use client';

import { getBorderWidth } from '@/lib/print/printRender';
import { slotReservesBand } from '@/lib/print/title';
import { readableInk } from '@/lib/print/contrast';
import type { Look } from '@/lib/print/looks';

/**
 * A miniature poster showing what a look actually does.
 *
 * "Signal — red streets, deep navy water" is a description of a picture, so we
 * draw the picture instead: the palette, the stroke weight, the border, and
 * where the title sits. Selecting a look updates the real artwork instantly,
 * so this only has to communicate the design, not the specific geography.
 */

const STREETS_H = [0.16, 0.3, 0.46, 0.62, 0.79];
const STREETS_V = [0.13, 0.28, 0.41, 0.57, 0.72, 0.87];

export function LookSwatch({ look, width = 64 }: { look: Look; width?: number }) {
  const ratio = 4 / 3;
  const height = width * ratio;
  const border = getBorderWidth(look.border, width);
  const band = slotReservesBand(look.titleSlot);
  const bandH = band ? height * 0.14 : 0;

  const frameY = band === 'top' ? bandH : 0;
  const frameH = height - bandH;
  const mapX = border;
  const mapY = frameY + border;
  const mapW = width - border * 2;
  const mapH = frameH - border * 2;

  const ink = look.colors.water || look.colors.roads;
  const stroke = Math.max(0.5, 0.7 * look.strokeWeight);
  const titleInk = readableInk(look.colors.land, ink);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${look.name}: ${look.blurb}`}
      style={{ display: 'block' }}
    >
      <rect width={width} height={height} fill={look.colors.land} />
      {border > 0 && <rect x={0} y={frameY} width={width} height={frameH} fill={ink} />}

      <g clipPath="url(#none)">
        <rect x={mapX} y={mapY} width={mapW} height={mapH} fill={look.colors.land} />
        {/* Water body */}
        <path
          d={`M${mapX} ${mapY + mapH * 0.62}
              C ${mapX + mapW * 0.3} ${mapY + mapH * 0.5},
                ${mapX + mapW * 0.55} ${mapY + mapH * 0.82},
                ${mapX + mapW} ${mapY + mapH * 0.68}
              L ${mapX + mapW} ${mapY + mapH} L ${mapX} ${mapY + mapH} Z`}
          fill={look.colors.water}
        />
        {/* Street grid */}
        <g stroke={look.colors.roads} strokeWidth={stroke} opacity={0.85}>
          {STREETS_H.map((t) => (
            <line key={`h${t}`} x1={mapX} y1={mapY + mapH * t} x2={mapX + mapW} y2={mapY + mapH * t} />
          ))}
          {STREETS_V.map((t) => (
            <line key={`v${t}`} x1={mapX + mapW * t} y1={mapY} x2={mapX + mapW * t} y2={mapY + mapH} />
          ))}
          <line
            x1={mapX}
            y1={mapY + mapH * 0.9}
            x2={mapX + mapW}
            y2={mapY + mapH * 0.12}
            strokeWidth={stroke * 2}
          />
        </g>
      </g>

      {/* Title treatment */}
      {band && (
        <g>
          <rect
            x={0}
            y={band === 'top' ? 0 : height - bandH}
            width={width}
            height={bandH}
            fill={look.colors.land}
          />
          <rect
            x={0}
            y={band === 'top' ? bandH : height - bandH}
            width={width}
            height={0.6}
            fill={titleInk}
          />
          <rect
            x={width * 0.28}
            y={(band === 'top' ? 0 : height - bandH) + bandH * 0.36}
            width={width * 0.44}
            height={bandH * 0.22}
            fill={titleInk}
            opacity={0.85}
          />
        </g>
      )}
      {!band && (
        <rect
          x={width * 0.1}
          y={look.titleSlot === 'top-left' ? height * 0.09 : height * 0.84}
          width={width * 0.36}
          height={height * 0.022}
          fill={titleInk}
          opacity={0.85}
        />
      )}
    </svg>
  );
}
