'use client';

import { sceneCacheTag, type PrintScene } from '@/lib/print/scene';
import { SESSION_PREVIEW_KEY } from '@/lib/print/sizeCatalog';

interface StoredProof {
  version: 2;
  sceneKey: string;
  dataUrl: string;
  createdAt: number;
}

/**
 * A proof is valid only for the exact scene that produced it. This prevents a
 * previous place, palette, title, or paper size from leaking into Finish.
 */
export function storeProof(scene: PrintScene, dataUrl: string): void {
  if (typeof window === 'undefined') return;
  const proof: StoredProof = {
    version: 2,
    sceneKey: sceneCacheTag(scene),
    dataUrl,
    createdAt: Date.now(),
  };
  window.sessionStorage.setItem(SESSION_PREVIEW_KEY, JSON.stringify(proof));
}

export function readProof(scene: PrintScene): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREVIEW_KEY);
    if (!raw) return null;
    const proof = JSON.parse(raw) as StoredProof;
    if (
      proof.version !== 2
      || proof.sceneKey !== sceneCacheTag(scene)
      || !proof.dataUrl?.startsWith('data:image/')
    ) {
      return null;
    }
    return proof.dataUrl;
  } catch {
    // Older builds stored the raw data URL. Treat it as stale rather than
    // showing artwork that may belong to another scene.
    return null;
  }
}

export function clearProof(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_PREVIEW_KEY);
}
