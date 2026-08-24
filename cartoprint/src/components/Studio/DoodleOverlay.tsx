'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  decorationSheetPosition,
  layoutDecorations,
  type DecorationKind,
  type PrintDecoration,
} from '@/lib/print/decorations';
import type { PrintScene } from '@/lib/print/scene';

interface DoodleOverlayProps {
  scene: PrintScene;
  containerRef: RefObject<HTMLElement>;
  onChange: (decorations: PrintDecoration[]) => void;
  editable?: boolean;
}

function clamp(value: number, min = 0.025, max = 0.975): number {
  return Math.min(Math.max(value, min), max);
}

export function DoodleOverlay({ scene, containerRef, onChange, editable = true }: DoodleOverlayProps) {
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
    onChange(scene.illustration.decorations.map((item) => item.id === drag.current?.id
      ? { ...item, anchor: 'sheet' as const, x: point.x, y: point.y, lng: undefined, lat: undefined }
      : item));
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    drag.current = null;
  }

  function remove(id: string) {
    onChange(scene.illustration.decorations.filter((item) => item.id !== id));
    setSelected(null);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ containerType: 'size' }} aria-label="Illustrated map elements">
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
              <DoodleGlyph kind={decoration.kind} size={decoration.size} />
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

export function DoodleGlyph({ kind, size = 1 }: { kind: Exclude<DecorationKind, 'text'>; size?: number }) {
  const width = 5.8 * size;
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 100 100" aria-hidden style={{ width: `${width}cqw`, height: `${width}cqw`, overflow: 'visible' }}>
      {kind === 'forest' && <g {...common}>
        <path d="M22 79V52M8 60 22 20l14 40M4 73l18-34 18 34" />
        <path d="M52 82V44M34 54 52 8l18 46M29 70l23-42 23 42" />
        <path d="M80 79V55M68 62 80 27l12 35M64 74l16-31 16 31" />
      </g>}
      {kind === 'mountains' && <g {...common}><path d="M3 79 39 18l20 31 14-22 25 52" /><path d="m30 34 9 10 8-12" /></g>}
      {kind === 'hills' && <g {...common}><path d="M2 72C20 25 42 27 55 71c14-31 30-29 43 1" /><path d="M9 82c20-13 54-11 82 0" opacity=".65" /></g>}
      {kind === 'waves' && <g {...common}><path d="M3 29c18-15 30 15 47 0s30 15 47 0M3 50c18-15 30 15 47 0s30 15 47 0M3 71c18-15 30 15 47 0s30 15 47 0" /></g>}
      {kind === 'star' && <path d="m50 5 11 31 33 1-26 20 9 33-27-19-27 19 9-33L6 37l33-1Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
      {kind === 'heart' && <path d="M50 88C13 62 8 41 20 24 31 9 47 17 50 31c5-16 25-21 35-5 13 20 0 40-35 62Z" fill="none" stroke="currentColor" strokeWidth="4" />}
      {kind === 'cabin' && <g {...common}><path d="M10 47 50 14l40 33M18 43v42h64V43M41 85V61h18v24M68 30V12h10v27" /></g>}
      {kind === 'lighthouse' && <g {...common}><path d="m35 88 8-55h14l8 55M37 88h26M38 54h24M34 33h32v-15H34zM40 18 50 7l10 11M23 26 7 17M77 26l16-9" /></g>}
    </svg>
  );
}
