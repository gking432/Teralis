import { checkPalette } from '@/lib/print/contrast';
import { resolvedRect } from '@/lib/print/title';
import type { PrintScene } from '@/lib/print/scene';

export interface PrintReadiness {
  ready: boolean;
  issues: string[];
}

const SAFE_MARGIN = 0.012;

/** Hard gates shared by the studio CTA and the generated proof. */
export function checkPrintReadiness(scene: PrintScene): PrintReadiness {
  const issues: string[] = [];
  const palette = checkPalette(scene.colors);

  if (palette.verdict !== 'good') {
    issues.push(...palette.issues);
  }

  if (
    scene.title.enabled
    && !scene.title.text.trim()
    && !scene.title.subtitle.trim()
    && !scene.title.detail.trim()
  ) {
    issues.push('Add title text or choose a map-only style.');
  }

  if (scene.title.enabled && scene.title.slot === 'free') {
    const rect = resolvedRect(scene.title);
    if (
      rect.x < SAFE_MARGIN
      || rect.y < SAFE_MARGIN
      || rect.x + rect.w > 1 - SAFE_MARGIN
      || rect.y + rect.h > 1 - SAFE_MARGIN
    ) {
      issues.push('Move the title inside the print-safe area.');
    }
  }

  return { ready: issues.length === 0, issues };
}
