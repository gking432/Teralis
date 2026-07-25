'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { PreviewColorSettings } from '@/lib/print/colorSchemes';
import {
  BODY_FONT_STACK,
  TITLE_FONT_STACK,
  resolveTitleColors,
  resolvedRect,
  snapToSlot,
  titleTypography,
  type TitleDesign,
} from '@/lib/print/title';
import { percent } from '@/lib/print/geometry';

/**
 * The title, rendered directly on the artwork.
 *
 * One model for every placement: the footer band and a freely dragged label
 * are the same object with different rectangles, and both use the shared
 * `titleTypography` fitting routine so the preview matches the export.
 *
 * All gestures are Pointer Events, so dragging, resizing, and rotating work
 * with touch and pen as well as a mouse. The previous freeform title listened
 * for `mousedown`/`mousemove` only and was completely inert on a phone.
 */

type Handle = 'body' | 'tl' | 'tr' | 'bl' | 'br' | 'rotate';

interface TitleOverlayProps {
  design: TitleDesign;
  colors: PreviewColorSettings;
  containerRef: RefObject<HTMLElement>;
  onChange: (design: TitleDesign) => void;
  /** When false the title is display-only (used for thumbnails). */
  editable?: boolean;
}

const MIN_WIDTH = 0.16;
const MAX_WIDTH = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function TitleOverlay({
  design,
  colors,
  containerRef,
  onChange,
  editable = true,
}: TitleOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const [editing, setEditing] = useState<null | 'text' | 'subtitle' | 'detail'>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // Type fitting measures text on a canvas, which the server cannot do, so the
  // first server pass would disagree with the client and trip hydration. The
  // overlay sits on a WebGL canvas and has no SSR value, so mount it client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    original: TitleDesign;
    moved: boolean;
  } | null>(null);

  const rect = resolvedRect(design);
  const colorsResolved = resolveTitleColors(design, colors);

  // Measure the block in real pixels so the shared typography routine can fit
  // the text exactly the way the exporter will.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const measure = () => {
      setBox({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rect.w, rect.h]);

  useEffect(() => {
    if (!editable) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setSelected(false);
        setEditing(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [editable]);

  function normalised(event: { clientX: number; clientY: number }) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }

  function beginDrag(handle: Handle, event: ReactPointerEvent) {
    if (!editable || editing) return;
    event.stopPropagation();
    event.preventDefault();
    // Select and start dragging on the SAME press. Requiring a separate
    // "select" tap first is fine with a mouse hover but reads as a dead
    // control on touch, where there is no hover to hint at it.
    setSelected(true);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is a nicety; the window-level listeners still work.
    }
    const point = normalised(event);
    dragRef.current = {
      handle,
      startX: point.x,
      startY: point.y,
      original: { ...design, ...rect },
      moved: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = normalised(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 0.004) drag.moved = true;
    const original = drag.original;

    if (drag.handle === 'body') {
      onChange({
        ...design,
        slot: 'free',
        x: clamp(original.x + dx, 0, 1 - original.w),
        y: clamp(original.y + dy, 0, 1 - original.h),
        w: original.w,
        h: original.h,
      });
      return;
    }

    if (drag.handle === 'rotate') {
      const cx = original.x + original.w / 2;
      const cy = original.y + original.h / 2;
      const from = Math.atan2(drag.startY - cy, drag.startX - cx);
      const to = Math.atan2(point.y - cy, point.x - cx);
      let rotation = original.rotation + (to - from) * (180 / Math.PI);
      // Snap to straight and to the common 90° turns.
      for (const target of [-90, -45, 0, 45, 90, 180, -180]) {
        if (Math.abs(rotation - target) < 4) rotation = target;
      }
      onChange({ ...design, ...original, slot: 'free', rotation });
      return;
    }

    const aspect = original.w / Math.max(original.h, 0.001);
    const delta = drag.handle === 'br'
      ? (dx / original.w + dy / original.h) / 2
      : drag.handle === 'tl'
        ? (-dx / original.w - dy / original.h) / 2
        : drag.handle === 'tr'
          ? (dx / original.w - dy / original.h) / 2
          : (-dx / original.w + dy / original.h) / 2;

    const w = clamp(original.w * (1 + delta), MIN_WIDTH, MAX_WIDTH);
    const h = w / aspect;
    let x = original.x;
    let y = original.y;
    if (drag.handle === 'tl' || drag.handle === 'bl') x = original.x + original.w - w;
    if (drag.handle === 'tl' || drag.handle === 'tr') y = original.y + original.h - h;

    onChange({
      ...design,
      slot: 'free',
      x: clamp(x, 0, 1 - w),
      y: clamp(y, 0, 1 - h),
      w,
      h,
      rotation: original.rotation,
    });
  }

  function endDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {}
    if (!drag.moved) return;

    // Magnetic snapping: land on a designed slot when the drag ends near one.
    // This is what makes free placement feel unlimited but still tidy.
    if (design.rotation === 0) {
      const snapped = snapToSlot({ x: design.x, y: design.y, w: design.w, h: design.h });
      if (snapped.slot !== 'free') {
        onChange({ ...design, slot: snapped.slot, ...snapped.rect });
      }
    }
  }

  const type = titleTypography(design, box.width || 1, box.height || 1);
  const showTitle = design.text.trim().length > 0 || editing === 'text';
  const showSubtitle = design.subtitle.trim().length > 0 || editing === 'subtitle';
  const showDetail = design.detail.trim().length > 0 || editing === 'detail';

  const lineStyle = (size: number, tracking: number, font: string, weight: number): CSSProperties => ({
    color: colorsResolved.text,
    fontFamily: font,
    fontSize: `${(size * 100).toFixed(3)}cqh`,
    fontWeight: weight,
    letterSpacing: `${tracking}em`,
    whiteSpace: 'nowrap',
    lineHeight: 1.05,
    // The horizontal fit is computed once, in the shared routine, and applied
    // as a pure scale so it cannot drift from what the exporter draws.
    transform: `scaleX(${type.fitScale})`,
    transformOrigin: design.align === 'left' ? 'left center' : 'center',
    outline: 'none',
  });

  function editableProps(field: 'text' | 'subtitle' | 'detail') {
    if (!editable) return {};
    return {
      contentEditable: editing === field,
      suppressContentEditableWarning: true,
      onDoubleClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        setSelected(true);
        setEditing(field);
      },
      onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
        setEditing(null);
        const value = event.currentTarget.textContent ?? '';
        if (value !== design[field]) onChange({ ...design, [field]: value });
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          (event.currentTarget as HTMLElement).blur();
        }
        if (event.key === 'Escape') {
          (event.currentTarget as HTMLElement).textContent = design[field];
          (event.currentTarget as HTMLElement).blur();
        }
      },
    };
  }

  if (!design.enabled || !mounted) return null;

  return (
    <div
      ref={rootRef}
      onPointerDown={(event) => beginDrag('body', event)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-testid="title-overlay"
      style={{
        position: 'absolute',
        zIndex: 25,
        left: percent(rect.x),
        top: percent(rect.y),
        width: percent(rect.w),
        height: percent(rect.h),
        transform: design.rotation ? `rotate(${design.rotation}deg)` : undefined,
        transformOrigin: 'center',
        containerType: 'size',
        touchAction: 'none',
        cursor: !editable ? 'default' : editing ? 'text' : selected ? 'move' : 'pointer',
        userSelect: editing ? 'text' : 'none',
      } as CSSProperties}
    >
      {!colorsResolved.transparent && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: colorsResolved.panel, opacity: colorsResolved.panelAlpha }}
        />
      )}

      {/* Footer bands carry a hairline rule, matching the exporter. */}
      {design.panel === 'solid' && (design.slot === 'footer' || design.slot === 'footer-tall') && (
        <div
          className="absolute inset-x-0 top-0"
          style={{ height: 'max(1px, 0.9cqh)', backgroundColor: colorsResolved.text }}
        />
      )}

      <div
        className="absolute inset-0 flex flex-col justify-center overflow-hidden"
        style={{
          alignItems: design.align === 'left' ? 'flex-start' : 'center',
          padding: type.vertical ? '6cqh 0' : '0 4cqw',
          gap: `${(type.gap * 100).toFixed(3)}cqh`,
          writingMode: type.vertical ? 'vertical-rl' : undefined,
          textAlign: design.align === 'left' ? 'left' : 'center',
        }}
      >
        {showTitle && (
          <div
            {...editableProps('text')}
            style={lineStyle(type.titleSize, type.titleTracking, TITLE_FONT_STACK, 300)}
          >
            {design.text.trim().toUpperCase()}
          </div>
        )}
        {showSubtitle && (
          <div
            {...editableProps('subtitle')}
            style={lineStyle(type.subtitleSize, type.subtitleTracking, BODY_FONT_STACK, 400)}
          >
            {design.subtitle.trim().toUpperCase()}
          </div>
        )}
        {showDetail && (
          <div
            {...editableProps('detail')}
            style={lineStyle(type.detailSize, type.detailTracking, BODY_FONT_STACK, 400)}
          >
            {design.detail.trim().toUpperCase()}
          </div>
        )}
      </div>

      {editable && selected && !editing && (
        <>
          <div className="pointer-events-none absolute -inset-px border border-dashed border-current opacity-40" />
          {([
            ['tl', { top: -7, left: -7, cursor: 'nwse-resize' }],
            ['tr', { top: -7, right: -7, cursor: 'nesw-resize' }],
            ['bl', { bottom: -7, left: -7, cursor: 'nesw-resize' }],
            ['br', { bottom: -7, right: -7, cursor: 'nwse-resize' }],
          ] as const).map(([handle, position]) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize title from ${handle}`}
              onPointerDown={(event) => beginDrag(handle, event)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              // Generous touch target; the visible dot is drawn by ::before.
              className="absolute h-[14px] w-[14px] rounded-full border border-[#14201d] bg-white shadow-sm"
              style={{ ...position, touchAction: 'none' }}
            />
          ))}
          <button
            type="button"
            aria-label="Rotate title"
            onPointerDown={(event) => beginDrag('rotate', event)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute -top-9 left-1/2 h-[14px] w-[14px] -translate-x-1/2 rounded-full border border-[#14201d] bg-white shadow-sm"
            style={{ touchAction: 'none' }}
          />
        </>
      )}
    </div>
  );
}
