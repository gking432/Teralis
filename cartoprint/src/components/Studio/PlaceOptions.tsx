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
function StateEditionPreview({ print, edition, boundary }: { print: CatalogPrint; edition: 'atlas' | 'topographic'; boundary: GeoJSON.Geometry | null }) {
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
  const art = illustrationFor(scene);
  const palettes = (state ? ['bone', 'forest', 'blueprint', 'terracotta', 'slate', 'midnight'] : [...CITY_COLORWAYS]).map(getPalette);
  return <>
    <section aria-label={state ? 'State editions' : 'City versions'}>
      <h2 className="mb-3 text-base font-medium">{state ? 'Choose your edition' : 'Choose your version'}</h2>
      <div className="grid grid-cols-3 gap-2">
        {state ? STATE_EDITIONS.map((edition) => {
          const unavailable = edition.id === 'illustrated' && !art;
          return <button key={edition.id} className="place-choice" aria-pressed={scene.region.theme === edition.id} disabled={unavailable} onClick={() => update((current) => chooseEdition(current, edition.id), 'edition')}>
            {edition.id === 'illustrated' ? art ? <img src={art.src} alt="" className="aspect-[3/4] w-full bg-[#f5f0e5] object-contain" /> : <div className="flex aspect-[3/4] items-center justify-center bg-[#eeeae0] px-2 text-center text-xs text-[#7b827b]">Tennessee is the first edition</div> : <StateEditionPreview print={print} edition={edition.id} boundary={boundary} />}
            <span className="mt-2 block text-sm font-medium leading-tight">{edition.name}</span><span className="mt-1 block text-xs leading-4 text-[#657167]">{unavailable ? 'Not yet illustrated' : edition.description}</span>
          </button>;
        }) : CITY_VERSIONS.map((version) => <button key={version.id} className="place-choice" disabled={version.id === 'on-water' && waterAvailable !== true} aria-pressed={scene.layoutId === version.id} onClick={() => update((current) => applyLayout(current, getLayout(version.id)), 'version')}>
          <CityVersionPreview scene={scene} mapPreview={mapPreview} layout={version.id} />
          <span className="mt-2 block text-sm font-medium">{version.name}</span>
          {version.id === 'on-water' && waterAvailable !== true && <span className="mt-1 block text-xs leading-4 text-[#657167]">{waterAvailable === false ? 'Needs a wider water view' : 'Checking shoreline…'}</span>}
        </button>)}
      </div>
      {state && !art && <p className="mt-3 text-sm text-[#687267]">Curious about the illustrated edition? <Link href="/maps/tennessee?edition=illustrated" className="underline underline-offset-4">Explore Tennessee →</Link></p>}
      {illustrated && <p className="mt-3 text-sm leading-6 text-[#687267]">A pictorial interpretation of Tennessee, with fixed illustrated landmarks. Personalize the caption below.</p>}
    </section>
    {!illustrated && <section className="my-6" aria-label="Map colors">
      <div className="mb-3 flex justify-between text-sm"><h2>Color</h2><span className="text-[#687267]">{getPalette(scene.paletteId).name}</span></div>
      <div className="flex flex-wrap gap-3">{palettes.map((palette) => <button key={palette.id} onClick={() => update((current) => applyPalette(current, palette), 'palette')} aria-label={palette.name} aria-pressed={scene.paletteId === palette.id} title={palette.name} className={`h-10 w-10 rounded-full border-[3px] ${scene.paletteId === palette.id ? 'border-[#173f35] ring-2 ring-[#cdd9ce] ring-offset-2' : 'border-white shadow-sm'}`} style={{ background: `linear-gradient(135deg, ${palette.colors.water} 50%, ${palette.colors.land} 50%)` }} />)}</div>
    </section>}
    <div className="mt-6">
      <details><summary>Edit wording</summary><div><StudioPanels scene={scene} update={update} active="title" /></div></details>
      {!illustrated && <details onToggle={(event) => onAdjustArea(event.currentTarget.open)}><summary>{state ? 'Map detail & shape' : 'Adjust map area & shape'}</summary><div><StudioPanels scene={scene} update={update} active="view" /></div></details>}
      {illustrated && <p className="mt-4 text-sm text-[#687267]">Landscape composition · Warm paper & rust lettering</p>}
    </div>
  </>;
}
