'use client';
import { useEffect, useRef, useState } from 'react';
import type { PrintScene } from '@/lib/print/scene';
import { renderScene } from '@/lib/print/renderScene';
export function ProofInspector({ scene, boundary, onClose }: { scene: PrintScene; boundary: GeoJSON.Geometry | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const abort = new AbortController();
    renderScene(scene, boundary, { width: 2400, signal: abort.signal }).then(url => { if (!abort.signal.aborted) setSrc(url); }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [scene, boundary]);
  return <dialog ref={dialog} onCancel={onClose} aria-label="Enlarged print proof" className="fixed inset-0 m-auto h-[90dvh] w-[94vw] max-w-none bg-[#eee9df] p-0 text-[#14201d] backdrop:bg-black/70">
    <div className="flex items-center justify-between gap-3 border-b border-black/15 p-4">
      <div><h2 className="font-medium">A closer look</h2><p className="text-xs">Scroll to explore the enlarged proof.</p></div>
      <button onClick={() => setZoom(!zoom)} disabled={!src} className="rounded border border-black/25 px-3 py-2">{zoom ? 'Fit print' : 'Magnify'}</button>
      <button autoFocus onClick={onClose} className="rounded bg-[#173f35] px-4 py-2 text-white">Close</button>
    </div>
    <div className="h-[calc(100%-85px)] overflow-auto p-4">
      {src ? <>
        {/* Canvas proof data URLs intentionally use img. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${scene.place.name} enlarged print proof`} style={{ width: zoom ? 1800 : 'auto', height: zoom ? 'auto' : '100%', maxWidth: zoom ? 'none' : '100%', objectFit: 'contain', margin: 'auto' }} />
      </> : <p role="status" className="p-8">{error ? 'The proof could not load. Close and try again.' : 'Preparing the details…'}</p>}
    </div>
  </dialog>;
}
