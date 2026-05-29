'use client';

import { useRef, useState } from 'react';

interface MousePos {
  // Position of the mouse within the image element (CSS pixels)
  x: number;
  y: number;
  // Dimensions of the rendered image element
  imgW: number;
  imgH: number;
}

interface ImageMagnifierProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  // Multiplier applied to the displayed image pixels (default 3.5)
  magnification?: number;
  // Diameter of the circular lens in screen pixels (default 220)
  lensSize?: number;
}

/**
 * Wraps an image and shows a circular magnifier lens on hover.
 * Uses the CSS background-image trick so no additional network request is made.
 */
export function ImageMagnifier({
  src,
  alt,
  className,
  style,
  magnification = 3.5,
  lensSize = 220,
}: ImageMagnifierProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [mouse, setMouse] = useState<MousePos | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLImageElement>) {
    const el = imgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMouse({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      imgW: rect.width,
      imgH: rect.height,
    });
  }

  // Lens viewport coordinates (viewport-relative, for position:fixed)
  let lensStyle: React.CSSProperties | null = null;
  if (mouse && imgRef.current) {
    const rect = imgRef.current.getBoundingClientRect();
    const absX = mouse.x + rect.left;
    const absY = mouse.y + rect.top;

    // Prefer placing the lens to the right; flip left if it would go off-screen
    const gap = 18;
    const rightEdge = absX + gap + lensSize;
    const lensLeft = rightEdge < window.innerWidth
      ? absX + gap
      : absX - gap - lensSize;

    // Clamp top so lens stays within viewport
    const lensTop = Math.max(8, Math.min(absY - lensSize / 2, window.innerHeight - lensSize - 8));

    // Background position: shift so the cursor point is centred in the lens
    const bgX = -(mouse.x * magnification - lensSize / 2);
    const bgY = -(mouse.y * magnification - lensSize / 2);

    lensStyle = {
      position: 'fixed',
      left: lensLeft,
      top: lensTop,
      width: lensSize,
      height: lensSize,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.75)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      overflow: 'hidden',
      backgroundImage: `url(${src})`,
      backgroundSize: `${mouse.imgW * magnification}px ${mouse.imgH * magnification}px`,
      backgroundPosition: `${bgX}px ${bgY}px`,
      backgroundRepeat: 'no-repeat',
      zIndex: 9999,
      pointerEvents: 'none',
      cursor: 'none',
    };
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        style={{ ...style, cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setMouse(null)}
        onMouseEnter={handleMouseMove}
        draggable={false}
      />
      {mouse && lensStyle && <div style={lensStyle} aria-hidden />}
    </>
  );
}
