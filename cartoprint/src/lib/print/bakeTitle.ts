import {
  BODY_FONT_STACK,
  displayTitleText,
  TITLE_FONT_STACK,
  resolveTitleColors,
  resolvedRect,
  titleFontCanvas,
  titleTypography,
  type TitleDesign,
} from '@/lib/print/title';
import type { PreviewColorSettings } from '@/lib/print/colorSchemes';

/**
 * Draw the title onto the export canvas.
 *
 * This is the canvas twin of `TitleOverlay`. Both read their geometry from
 * `resolvedRect`, their colors from `resolveTitleColors`, and their type sizes
 * and fit scale from `titleTypography` — so what the user positions on screen
 * is what lands on the paper.
 */

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  size: number,
  tracking: number,
  align: 'left' | 'center',
  leftX: number,
  fitScale: number,
): void {
  if (!text) return;
  const characters = Array.from(text);
  const gap = size * tracking;

  const widths = characters.map((character) => ctx.measureText(character).width);
  const naturalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(characters.length - 1, 0);

  ctx.save();
  // Apply the shared horizontal fit as a real transform so the canvas shrinks
  // long titles exactly the way the DOM overlay does.
  const originX = align === 'left' ? leftX : centerX;
  ctx.translate(originX, baselineY);
  ctx.scale(fitScale, 1);

  let cursor = align === 'left' ? 0 : -naturalWidth / 2;
  characters.forEach((character, index) => {
    ctx.fillText(character, cursor, 0);
    cursor += widths[index] + gap;
  });
  ctx.restore();
}

export function bakeTitle(
  ctx: CanvasRenderingContext2D,
  design: TitleDesign,
  colors: PreviewColorSettings,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (!design.enabled) return;

  const rect = resolvedRect(design);
  const blockX = rect.x * canvasWidth;
  const blockY = rect.y * canvasHeight;
  const blockW = rect.w * canvasWidth;
  const blockH = rect.h * canvasHeight;
  if (blockW <= 0 || blockH <= 0) return;

  const resolved = resolveTitleColors(design, colors);
  const type = titleTypography(design, blockW, blockH);

  ctx.save();

  if (design.rotation) {
    ctx.translate(blockX + blockW / 2, blockY + blockH / 2);
    ctx.rotate((design.rotation * Math.PI) / 180);
    ctx.translate(-(blockX + blockW / 2), -(blockY + blockH / 2));
  }

  if (!resolved.transparent) {
    ctx.save();
    ctx.globalAlpha = resolved.panelAlpha;
    ctx.fillStyle = resolved.panel;
    ctx.fillRect(blockX, blockY, blockW, blockH);
    ctx.restore();
  }

  const vertical = type.vertical;
  const across = vertical ? blockW : blockH;

  const lines: Array<{ text: string; size: number; tracking: number; font: string; weight: number }> = [];
  const title = displayTitleText(design);
  const subtitle = design.subtitle.trim().toUpperCase();
  const detail = design.detail.trim().toUpperCase();

  if (title) lines.push({
    text: title,
    size: type.titleSize * across,
    tracking: type.titleTracking,
    font: design.font ? titleFontCanvas(design.font) : TITLE_FONT_STACK,
    weight: design.font === 'hand' ? 600 : design.font === 'condensed' ? 500 : 300,
  });
  if (subtitle) lines.push({ text: subtitle, size: type.subtitleSize * across, tracking: type.subtitleTracking, font: BODY_FONT_STACK, weight: 400 });
  if (detail) lines.push({ text: detail, size: type.detailSize * across, tracking: type.detailTracking, font: BODY_FONT_STACK, weight: 400 });

  if (lines.length === 0) {
    ctx.restore();
    return;
  }

  const gapPx = type.gap * across;
  const totalHeight = lines.reduce((sum, line) => sum + line.size, 0) + gapPx * (lines.length - 1);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = resolved.text;

  if (vertical) {
    // Spine layout: rotate the whole stack a quarter turn.
    ctx.translate(blockX + blockW / 2, blockY + blockH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-(blockY + blockH / 2), -(blockX + blockW / 2));
  }

  const alongCenter = vertical ? blockY + blockH / 2 : blockX + blockW / 2;
  const alongLeft = vertical ? blockY + blockH * 0.04 : blockX + blockW * 0.04;
  let cursor = (vertical ? blockX + blockW / 2 : blockY + blockH / 2) - totalHeight / 2;

  lines.forEach((line) => {
    ctx.font = `${line.weight} ${line.size}px ${line.font}`;
    ctx.fillStyle = resolved.text;
    // Baseline sits ~0.78 down the em box for these faces.
    drawTracked(
      ctx,
      line.text,
      alongCenter,
      cursor + line.size * 0.78,
      line.size,
      line.tracking,
      design.align,
      alongLeft,
      type.fitScale,
    );
    cursor += line.size + gapPx;
  });

  ctx.restore();
}
