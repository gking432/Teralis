import type { PrintScene } from './scene';
import { bakeTitle } from './bakeTitle';
import { printGeometry } from './geometry';

export const ILLUSTRATIONS: Record<string, { src: string; width: number; height: number; paper: string; orientation: 'portrait' | 'landscape' }> = {
  tennessee: { src: '/illustrations/tennessee-atlas.png', width: 1693, height: 929, paper: '#f5f0e5', orientation: 'landscape' },
  wisconsin: { src: '/illustrations/wisconsin-atlas.png', width: 1024, height: 1536, paper: '#f5f0e5', orientation: 'portrait' },
};

export function illustrationFor(scene: Pick<PrintScene, 'place'>) {
  return ILLUSTRATIONS[scene.place.slug];
}

/** Same contained artwork rectangle in the live sheet and exported proof. */
export function illustrationRect(scene: PrintScene) {
  const art = illustrationFor(scene);
  const geo = printGeometry(scene.orientation, 'none', scene.title);
  const available = { x: .04, y: .035, w: .92, h: geo.mapRect.h - .07 };
  const w = Math.min(available.w, available.h * geo.ratio * art.width / art.height);
  const h = w * art.height / art.width / geo.ratio;
  return { x: (1 - w) / 2, y: available.y + (available.h - h) / 2, w, h };
}

export async function renderIllustration(scene: PrintScene, width: number): Promise<string> {
  const art = illustrationFor(scene);
  if (!art) throw new Error('This illustrated edition is not available.');
  const image = new Image();
  image.src = art.src;
  await image.decode();
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * printGeometry(scene.orientation, 'none', scene.title).ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to prepare artwork.');
  ctx.fillStyle = art.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rect = illustrationRect(scene);
  ctx.drawImage(image, rect.x * width, rect.y * canvas.height, rect.w * width, rect.h * canvas.height);
  bakeTitle(ctx, scene.title, scene.colors, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
