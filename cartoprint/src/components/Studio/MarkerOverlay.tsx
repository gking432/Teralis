'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  decorationSheetPosition,
  layoutDecorations,
  type DecorationKind,
  type PrintDecoration,
} from '@/lib/print/decorations';
import type { PrintScene } from '@/lib/print/scene';

interface MarkerOverlayProps {
  scene: PrintScene;
  containerRef: RefObject<HTMLElement>;
  onChange: (decorations: PrintDecoration[]) => void;
  editable?: boolean;
}

function clamp(value: number, min = 0.025, max = 0.975): number {
  return Math.min(Math.max(value, min), max);
}

export function MarkerOverlay({ scene, containerRef, onChange, editable = true }: MarkerOverlayProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointerId: number } | null>(null);

  useEffect(() => {
    if (!editable) return;
    const clear = (event: PointerEvent) => {
      if (!(event.target as HTMLElement)?.closest?.('[data-decoration-id]')) setSelected(null);
    };
    document.addEventListener('pointerdown', clear);
    return () => document.removeEventListener('pointerdown', clear);
  }, [editable]);

  function positionFromEvent(event: { clientX: number; clientY: number }) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function begin(decoration: PrintDecoration, event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(decoration.id);
    drag.current = { id: decoration.id, pointerId: event.pointerId };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable || !drag.current || drag.current.pointerId !== event.pointerId) return;
    const point = positionFromEvent(event);
    onChange(scene.markers.map((item) => item.id === drag.current?.id
      ? { ...item, anchor: 'sheet' as const, x: point.x, y: point.y, lng: undefined, lat: undefined }
      : item));
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    drag.current = null;
  }

  function remove(id: string) {
    onChange(scene.markers.filter((item) => item.id !== id));
    setSelected(null);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ containerType: 'size' }} aria-label="Personal map elements">
      {layoutDecorations(scene).map((decoration) => {
        const position = decorationSheetPosition(scene, decoration);
        const active = selected === decoration.id;
        const color = decoration.color || scene.colors.roads || '#283a34';
        return (
          <div
            key={decoration.id}
            data-decoration-id={decoration.id}
            role={editable ? 'button' : undefined}
            aria-label={decoration.kind === 'text' ? `Move ${decoration.text}` : `Move ${decoration.kind}`}
            tabIndex={editable ? 0 : -1}
            onPointerDown={(event) => begin(decoration, event)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={`absolute grid place-items-center ${editable ? 'pointer-events-auto cursor-grab touch-none active:cursor-grabbing' : ''}`}
            style={{
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${decoration.rotation}deg)`,
              color,
              minWidth: decoration.kind === 'text' ? `${Math.max(13, decoration.size * 18)}cqw` : undefined,
            }}
          >
            {decoration.kind === 'text' ? (
              <span
                className="whitespace-nowrap text-center leading-none"
                style={{
                  fontFamily: decoration.font === 'hand'
                    ? 'var(--font-hand), cursive'
                    : decoration.font === 'condensed'
                      ? 'var(--font-condensed), sans-serif'
                      : decoration.font === 'modern'
                        ? 'var(--font-body), sans-serif'
                        : 'var(--font-display), serif',
                  fontSize: `${3.4 * decoration.size}cqw`,
                  fontWeight: decoration.font === 'hand' ? 600 : 500,
                  letterSpacing: decoration.font === 'condensed' ? '0.08em' : undefined,
                  textTransform: decoration.font === 'condensed' ? 'uppercase' : undefined,
                  textShadow: `0 1px 0 ${scene.colors.land}`,
                }}
              >
                {decoration.text}
              </span>
            ) : (
              <MarkerGlyph kind={decoration.kind} size={decoration.size} />
            )}
            {editable && active && (
              <>
                <span className="pointer-events-none absolute -inset-2 rounded-md border border-dashed border-current opacity-55" />
                <button
                  type="button"
                  aria-label={`Remove ${decoration.text || decoration.kind}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); remove(decoration.id); }}
                  className="absolute -right-4 -top-4 grid h-6 w-6 place-items-center rounded-full border border-[#14201d] bg-white text-[13px] leading-none text-[#14201d] shadow-md"
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MarkerGlyph({ kind, size = 1 }: { kind: Exclude<DecorationKind, 'text'>; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 100 100" style={{ width: `${size * 100}%`, height: `${size * 100}%`, overflow: 'visible' }} aria-hidden>
      {kind === 'star' && <path d="M50 12 61 38l28 2-21 19 6 28-24-14-24 14 6-28-21-19 28-2Z" fill="currentColor" stroke="none" />}
      {kind === 'heart' && <path d="M50 84C24 66 12 52 12 38a19 19 0 0 1 38-6 19 19 0 0 1 38 6c0 14-12 28-38 46Z" fill="currentColor" stroke="none" />}
    </svg>
  );
}
