'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getPrintFrameRect, getSafeFrameRect } from '@/lib/print/composition';
import type { PrintSize } from '@/types/order';

interface PrintFrameOverlayProps {
  size: PrintSize;
  panelOpen?: boolean;
}

export function PrintFrameOverlay({ size, panelOpen = false }: PrintFrameOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const frame = useMemo(
    () => getPrintFrameRect(containerSize.width, containerSize.height, size),
    [containerSize, size]
  );
  const safeFrame = useMemo(() => (frame ? getSafeFrameRect(frame, size) : null), [frame, size]);

  return (
    <div ref={rootRef} className="absolute inset-0 pointer-events-none z-[900]">
      {frame && safeFrame && (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/8" style={{ height: frame.top }} />
          <div
            className="absolute left-0 bg-black/8"
            style={{ top: frame.top, width: frame.left, height: frame.height }}
          />
          <div
            className="absolute right-0 bg-black/8"
            style={{ top: frame.top, width: frame.left, height: frame.height }}
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-black/8"
            style={{ height: containerSize.height - frame.top - frame.height }}
          />

          <div
            className="absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.16)]"
            style={{
              width: frame.width,
              height: frame.height,
              left: frame.left,
              top: frame.top,
            }}
          >
            <div
              className="absolute border border-dashed border-white/60"
              style={{
                left: safeFrame.left - frame.left,
                top: safeFrame.top - frame.top,
                width: safeFrame.width,
                height: safeFrame.height,
              }}
            />
            <div className="absolute top-2 left-2 px-2 py-1 bg-white/88 text-[10px] tracking-[1px] uppercase text-[#222]">
              Print Frame
            </div>
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-white/88 text-[10px] tracking-[1px] uppercase text-[#222]">
              Safe Margin
            </div>
          </div>
        </>
      )}
    </div>
  );
}
