'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
export default function WisconsinStudy() {
  const [src,setSrc]=useState('/studies/wisconsin-land-water.png');
  const [previous,setPrevious]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function render() {
    setBusy(true);setError('');
    try { const {renderWisconsinStudy}=await import('@/lib/studies/wisconsin');setSrc(await renderWisconsinStudy()); }
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-[#dfe1d7] px-5 py-10 text-[#263f3c]">
    <div className="mx-auto mb-8 flex max-w-5xl flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em]">Wisconsin · Art study 01</p><h1 className="mt-2 font-display text-4xl">Land & Water</h1><p className="mt-2 max-w-xl text-sm leading-6">A quieter atlas, with the Great Lakes in view and room for the places that matter.</p></div><a download="wisconsin-land-water.png" href={src} className="rounded-full border border-[#263f3c]/30 px-5 py-3 text-sm">Download study</a></div>
    <div className="mx-auto mb-5 flex max-w-4xl gap-2"><button onClick={() => setPrevious(false)} aria-pressed={!previous} className={`rounded-full px-5 py-2 text-sm ${!previous?'bg-[#263f3c] text-white':'border border-[#263f3c]/30'}`}>New study</button><button onClick={() => setPrevious(true)} aria-pressed={previous} className={`rounded-full px-5 py-2 text-sm ${previous?'bg-[#263f3c] text-white':'border border-[#263f3c]/30'}`}>Current map</button></div>
    <img id="study-print" src={previous ? '/thumbnails/wisconsin-landscape-atlas.png' : src} alt="Wisconsin Land and Water map study" className="mx-auto w-full max-w-4xl shadow-xl" />
    <details className="mx-auto mt-10 max-w-4xl text-sm"><summary>Study notes</summary><p className="my-4 leading-6">Real map geography, shaded relief, and a curated hierarchy of cities and smaller towns. This is a visual study, separate from the print editor.</p>{process.env.NODE_ENV === 'development' && <button onClick={render} disabled={busy} className="rounded border border-current px-4 py-2">{busy?'Rendering…':'Render study from map data'}</button>}{error&&<p role="alert">{error}</p>}</details>
  </main>;
}
