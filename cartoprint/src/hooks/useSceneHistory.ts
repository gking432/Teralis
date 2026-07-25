'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrintScene } from '@/lib/print/scene';

/**
 * Undo/redo for the design.
 *
 * Without it, every experiment is a one-way door: people stop exploring
 * because getting back to something they liked means rebuilding it by hand.
 *
 * Rapid changes to the same control (dragging a slider, typing in a field) are
 * coalesced into a single history entry so one undo steps back a whole
 * gesture rather than one pixel of it.
 */

const COALESCE_MS = 600;
const MAX_ENTRIES = 60;

export interface SceneHistory {
  scene: PrintScene;
  /** Push a new state. `label` groups consecutive edits of the same control. */
  update: (next: PrintScene | ((current: PrintScene) => PrintScene), label?: string) => void;
  /** Replace without touching history (restoring a saved design). */
  reset: (next: PrintScene) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useSceneHistory(initial: PrintScene | (() => PrintScene)): SceneHistory {
  const [past, setPast] = useState<PrintScene[]>([]);
  const [scene, setScene] = useState<PrintScene>(initial);
  const [future, setFuture] = useState<PrintScene[]>([]);

  const lastLabel = useRef<string | null>(null);
  const lastAt = useRef(0);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const update = useCallback((
    next: PrintScene | ((current: PrintScene) => PrintScene),
    label?: string,
  ) => {
    const current = sceneRef.current;
    const resolved = typeof next === 'function' ? next(current) : next;
    if (resolved === current) return;

    const now = Date.now();
    const coalesce = Boolean(label)
      && label === lastLabel.current
      && now - lastAt.current < COALESCE_MS;

    lastLabel.current = label ?? null;
    lastAt.current = now;

    if (!coalesce) {
      setPast((entries) => [...entries, current].slice(-MAX_ENTRIES));
    }
    setFuture([]);
    setScene(resolved);
  }, []);

  const reset = useCallback((next: PrintScene) => {
    lastLabel.current = null;
    setPast([]);
    setFuture([]);
    setScene(next);
  }, []);

  const undo = useCallback(() => {
    setPast((entries) => {
      if (entries.length === 0) return entries;
      const previous = entries[entries.length - 1];
      setFuture((forward) => [sceneRef.current, ...forward].slice(0, MAX_ENTRIES));
      setScene(previous);
      lastLabel.current = null;
      return entries.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((entries) => {
      if (entries.length === 0) return entries;
      const [next, ...rest] = entries;
      setPast((back) => [...back, sceneRef.current].slice(-MAX_ENTRIES));
      setScene(next);
      lastLabel.current = null;
      return rest;
    });
  }, []);

  // Keyboard shortcuts, skipped while the user is typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return {
    scene,
    update,
    reset,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
