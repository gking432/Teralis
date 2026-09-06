'use client';

/* Rendered canvas previews and prepared illustration assets intentionally use img. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { applyLayout, applyPalette, createPrintScene, type PrintScene } from '@/lib/print/scene';
import type { CatalogPrint } from '@/lib/catalog/prints';
import { getLayout } from '@/lib/print/layouts';
import { CITY_COLORWAYS, getPalette } from '@/lib/print/palettes';
import { CITY_VERSIONS, STATE_EDITIONS, chooseEdition, recommendedOrientation } from '@/lib/print/editions';
import { illustrationFor } from '@/lib/print/illustrations';
import { renderScene } from '@/lib/print/renderScene';
import { StudioPanels } from './StudioDock';
import { printGeometry } from '@/lib/print/geometry';
import { bakeTitle } from '@/lib/print/bakeTitle';
import { findWaterPlacement, mapRectToSheet } from '@/lib/print/waterPlacement';
import { titleCacheTag } from '@/lib/print/title';
import type { SceneHistory } from '@/hooks/useSceneHistory';

type Props = { print: CatalogPrint; scene: PrintScene; update: SceneHistory['update']; boundary: GeoJSON.Geometry | null; waterAvailable?: boolean; mapPreview?: string; onAdjustArea: (active: boolean) => void };

/** Compose real map pixels into small version previews; no extra city map instances. */
function CityVersionPreview({ scene, mapPreview, layout }: { scene: PrintScene; mapPreview?: string; layout: string }) {
  const [src, setSrc] = useState<string>();
  const titleKey = titleCacheTag(scene.title);
  useEffect(() => {
    if (!mapPreview) return;
    let cancelled = false;
    const image = new Image();
    image.src = mapPreview;
    image.decode().then(async () => {
      await document.fonts.ready;
      if (cancelled) return;
      const target = applyLayout(scene, getLayout(layout));
      if (layout === 'on-water') {
        const sample = document.createElement('canvas'); sample.width = image.width; sample.height = image.height; sample.getContext('2d')?.drawImage(image, 0, 0);
        const found = findWaterPlacement(sample, scene.colors.water, image.height / image.width);
        const position = found ? mapRectToSheet(found.rect, printGeometry(target.orientation, target.detail.border, target.title).mapRect) : null;
        target.title = { ...target.title, slot: 'free', enabled: Boolean(position), ...(position || {}), onWater: true };
        if (scene.title.onWater && scene.title.autoPlaced) target.title = { ...target.title, x: scene.title.x, y: scene.title.y, w: scene.title.w, h: scene.title.h };
      }
      const geo = printGeometry(target.orientation, target.detail.border, target.title);
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = Math.round(240 * geo.ratio);
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.fillStyle = target.colors.land; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, geo.mapRect.x * canvas.width, geo.mapRect.y * canvas.height, geo.mapRect.w * canvas.width, geo.mapRect.h * canvas.height);
      bakeTitle(ctx, target.title, target.colors, canvas.width, canvas.height);
      setSrc(canvas.toDataURL());
    }).catch(() => {});
    return () => { cancelled = true; };
    // Pixels already include the selected geography and colorway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPreview, layout, titleKey, scene.orientation]);
  return src ? <img src={src} alt="" className="aspect-[3/4] w-full object-contain" /> : <div className="aspect-[3/4] animate-pulse bg-[#e9e7df]" />;
}

const editionCache = new Map<string, string>();
function StateEditionPreview({ print, edition, boundary }: { print: CatalogPrint; edition: 'detailed' | 'topographic'; boundary: GeoJSON.Geometry | null }) {
  const key = `${print.slug}:${edition}`;
  const [src, setSrc] = useState(editionCache.get(key));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!boundary || editionCache.has(key)) return;
    const abort = new AbortController();
    const scene = chooseEdition(createPrintScene(print, recommendedOrientation(print)), edition);
    renderScene(scene, boundary, { width: 260, signal: abort.signal }).then((url) => {
      if (abort.signal.aborted) return;
      if (editionCache.size >= 30) editionCache.delete(editionCache.keys().next().value!);
      editionCache.set(key, url); setSrc(url);
    }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [print, boundary, key, edition]);
  return src ? <img src={src} alt="" className="aspect-[3/4] w-full object-contain" /> : <div className="grid aspect-[3/4] place-items-center bg-[#f0eee5] p-2 text-center text-xs text-[#697267]">{failed ? 'Select to preview' : 'Preparing map…'}</div>;
}

export function PlaceOptions({ print, scene, update, boundary, waterAvailable, mapPreview, onAdjustArea }: Props) {
  const state = print.kind !== 'city';
  const illustrated = scene.region.theme === 'illustrated';
  const landmarks = scene.region.theme === 'landmarks';
  const art = illustrationFor(scene);
  const palettes = (state ? ['bone', 'forest', 'blueprint', 'terracotta'] : [...CITY_COLORWAYS]).map(getPalette);
  return <>
    <section aria-label={state ? 'State editions' : 'City versions'}>
      <h2 className="mb-3 text-base font-medium">{state ? 'Choose your edition' : 'Choose your version'}</h2>
      <div className="grid grid-cols-3 gap-2">
        {state ? STATE_EDITIONS.map((edition) => {
          const unavailable = edition.id === 'illustrated' && !art;
          return <button key={edition.id} className="place-choice" aria-pressed={scene.region.theme === edition.id} disabled={unavailable} onClick={() => update((current) => chooseEdition(current, edition.id), 'edition')}>
            {edition.id === 'illustrated' ? art ? <img src={art.src} alt="" className="aspect-[3/4] w-full bg-[#f5f0e5] object-contain" /> : <div className="flex aspect-[3/4] items-center justify-center bg-[#eeeae0] px-2 text-center text-xs text-[#7b827b]">New places in progress</div> : <StateEditionPreview print={print} edition={edition.id} boundary={boundary} />}
            <span className="mt-2 block text-sm font-medium leading-tight">{edition.name}</span><span className="mt-1 block text-xs leading-4 text-[#657167]">{unavailable ? 'Not yet illustrated' : edition.description}</span>
          </button>;
        }) : CITY_VERSIONS.map((version) => <button key={version.id} className="place-choice" disabled={!illustrated && version.id === 'on-water' && waterAvailable !== true} aria-pressed={!illustrated && !landmarks && scene.layoutId === version.id} onClick={() => update((current) => applyLayout(illustrated || landmarks ? chooseEdition(current, 'atlas') : current, getLayout(version.id)), 'version')}>
          {!illustrated && !landmarks && <CityVersionPreview scene={scene} mapPreview={mapPreview} layout={version.id} />}
          <span className="mt-2 block text-sm font-medium">{version.name}</span>
          {!illustrated && version.id === 'on-water' && waterAvailable !== true && <span className="mt-1 block text-xs leading-4 text-[#657167]">{waterAvailable === false ? 'Needs a wider water view' : 'Checking shoreline…'}</span>}
        </button>)}
      </div>
      {!state && art && <button className="place-choice mt-3 flex w-full items-center gap-4 text-left" aria-pressed={illustrated} onClick={() => update((current) => chooseEdition(current, 'illustrated'), 'edition')}><img src={art.src} alt="" className="h-24 w-32 object-contain" /><span><span className="block font-medium">Illustrated City</span><span className="mt-1 block text-sm text-[#657167]">An aerial portrait of the places you know</span></span></button>}
      {state && scene.region.theme === 'detailed' && <><p className="mt-3 text-sm leading-6 text-[#687267]">Cities, villages and small towns over quiet terrain and waterways. Labels are spaced for readability, so crowded names may be omitted. Open the enlarged proof to explore. Best enjoyed as a larger print.</p><HometownPicker slug={print.slug} scene={scene} update={update} /></>}
      {state && !art && <p className="mt-3 text-sm text-[#687267]">Curious about the illustrated edition? <Link href="/maps/tennessee?edition=illustrated" className="underline underline-offset-4">Explore Tennessee →</Link></p>}
      {illustrated && <p className="mt-3 text-sm leading-6 text-[#687267]">{state ? `A pictorial interpretation of ${print.name}, with fixed illustrated landmarks.` : 'The lakes, the Capitol, the campus, game day. Familiar landmarks drawn into an imagined aerial view.'} Personalize the caption below.</p>}
    </section>
    {!illustrated && <section className="my-6" aria-label="Map colors">
      <div className="mb-3 flex justify-between text-sm"><h2>Color</h2><span className="text-[#687267]">{getPalette(scene.paletteId).name}</span></div>
      <div className="flex flex-wrap gap-3">{palettes.map((palette) => <button key={palette.id} onClick={() => update((current) => applyPalette(current, palette), 'palette')} aria-label={palette.name} aria-pressed={scene.paletteId === palette.id} title={palette.name} className={`h-10 w-10 rounded-full border-[3px] ${scene.paletteId === palette.id ? 'border-[#173f35] ring-2 ring-[#cdd9ce] ring-offset-2' : 'border-white shadow-sm'}`} style={{ background: `linear-gradient(135deg, ${palette.colors.water} 50%, ${palette.colors.land} 50%)` }} />)}</div>
    </section>}
    <div className="mt-6">
      <details><summary>Edit wording</summary><div><StudioPanels scene={scene} update={update} active="title" /></div></details>
      {!illustrated && !state && <details onToggle={(event) => onAdjustArea(event.currentTarget.open)}><summary>{state ? 'Map detail & shape' : 'Adjust map area & shape'}</summary><div><StudioPanels scene={scene} update={update} active="view" /></div></details>}
      {illustrated && <p className="mt-4 text-sm text-[#687267]">{art?.orientation === 'portrait' ? 'Portrait' : 'Landscape'} composition · Warm paper & rust lettering</p>}
    </div>
  </>;
}

function HometownPicker({ slug, scene, update }: { slug: string; scene: PrintScene; update: Props['update'] }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Array<GeoJSON.Feature<GeoJSON.Point, { name: string; kind: string }>>>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setError(false); setPlaces([]);
    fetch(`/atlas-places/${slug}.json`, { signal: abort.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setPlaces(data.features)).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [slug]);
  const matches = query.trim().length > 1 ? places.filter(p => p.properties.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  return <div className="mt-5 rounded border border-[#d8d9d3] p-3">
    <label className="block text-sm font-medium" htmlFor="hometown-search">Highlight your hometown</label>
    <p className="mt-1 text-xs leading-5 text-[#657167]">Optional · A small marker for your place in the state.</p>
    {scene.region.hometown && <div className="my-2 flex items-center justify-between text-sm"><span>{scene.region.hometown.name}</span><button className="underline" onClick={() => update(c => ({ ...c, region: { ...c.region, hometown: undefined } }), 'hometown')}>Remove highlight</button></div>}
    <input id="hometown-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your city or town" className="mt-2 w-full" />
    {error ? <p className="mt-2 text-xs">Place search could not load. Reload to try again.</p> : query.trim().length > 1 && !places.length ? <p className="mt-2 text-xs">Loading places…</p> : query.trim().length > 1 && !matches.length ? <p className="mt-2 text-xs">No matching place in this state.</p> : null}
    <ul className="mt-2">{matches.map(p => <li key={`${p.properties.name}:${p.geometry.coordinates}`}><button className="w-full rounded px-2 py-2 text-left text-sm hover:bg-[#eef1ed]" onClick={() => { update(c => ({ ...c, region: { ...c.region, hometown: { name: p.properties.name, coordinates: p.geometry.coordinates as [number, number] } } }), 'hometown'); setQuery(''); }}>{p.properties.name}{' '}<span className="ml-2 text-xs text-[#657167]">{p.properties.kind}{matches.filter(m => m.properties.name === p.properties.name && m.properties.kind === p.properties.kind).length > 1 ? ` · ${p.geometry.coordinates[1].toFixed(2)}° N, ${Math.abs(p.geometry.coordinates[0]).toFixed(2)}° W` : ''}</span></button></li>)}</ul>
  </div>;
}
