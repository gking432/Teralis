'use client';

/**
 * The contact sheet: every sellable print rendered on one page.
 *
 * Validating maps one by one does not scale — this page renders the real
 * artwork for all 51 state collections (any theme) and every city product so
 * a human can review the entire catalog in one scroll. Structural problems
 * are caught automatically by /selftest; this page is for the judgment calls
 * a machine cannot make: composition, density, and whether it looks worth
 * buying. Live map tiles and boundaries are fetched exactly as production
 * does, so what renders here is what a customer receives.
 */

import { useEffect, useRef, useState } from 'react';
import { getCityCatalogPrints, getStateCatalogPrints, type CatalogPrint } from '@/lib/catalog/prints';
import { designsForState, sceneForCollectionDesign, STATE_COLLECTION_DESIGNS } from '@/lib/catalog/stateCollection';
import { createCityProductScene } from '@/lib/catalog/cityProduct';
import { fetchBoundary } from '@/lib/print/boundaryCache';
import { renderScene } from '@/lib/print/renderScene';
import type { IllustrationTheme } from '@/lib/print/decorations';

type ThemeChoice = 'lead' | IllustrationTheme;
type TileStatus = 'queued' | 'rendering' | 'ready' | 'error';

interface Tile {
  key: string;
  label: string;
  sublabel: string;
  status: TileStatus;
  image?: string;
  detail?: string;
}

const RENDER_WIDTH = 300;
const CONCURRENCY = 2;

export default function AuditPage() {
  const [theme, setTheme] = useState<ThemeChoice>('lead');
  const [tiles, setTiles] = useState<Record<string, Tile>>({});
  const runRef = useRef(0);

  const states = getStateCatalogPrints();
  const cities = getCityCatalogPrints();

  useEffect(() => {
    const run = ++runRef.current;
    const jobs: Array<{ key: string; print: CatalogPrint; kind: 'state' | 'city' }> = [
      ...states.map((print) => ({ key: `state:${print.slug}`, print, kind: 'state' as const })),
      ...cities.map((print) => ({ key: `city:${print.slug}`, print, kind: 'city' as const })),
    ];

    setTiles(Object.fromEntries(jobs.map(({ key, print, kind }) => {
      const designs = kind === 'state' ? designsForState(print.slug) : [];
      const chosen = kind === 'state'
        ? (theme === 'lead' ? designs[0] : designs.find((d) => d.id === theme))
        : null;
      return [key, {
        key,
        label: print.name,
        sublabel: kind === 'state' ? (chosen ? chosen.name : '— not sold in this theme —') : 'City · Slate',
        status: kind === 'state' && !chosen ? 'error' as const : 'queued' as const,
        detail: kind === 'state' && !chosen ? 'theme not in collection' : undefined,
      }];
    })));

    let index = 0;
    let active = 0;
    let cancelled = false;

    function next() {
      if (cancelled || runRef.current !== run) return;
      while (active < CONCURRENCY && index < jobs.length) {
        const job = jobs[index++];
        void renderOne(job);
      }
    }

    async function renderOne({ key, print, kind }: typeof jobs[number]) {
      active++;
      try {
        if (kind === 'state') {
          const designs = designsForState(print.slug);
          const design = theme === 'lead' ? designs[0] : designs.find((d) => d.id === theme);
          if (!design) return;
          setTiles((current) => ({ ...current, [key]: { ...current[key], status: 'rendering' } }));
          const record = await fetchBoundary(print.slug, print.center, 'state');
          if (!record?.geometry) throw new Error('no boundary');
          const scene = sceneForCollectionDesign(print, design);
          const image = await renderScene(scene, record.geometry, { width: RENDER_WIDTH });
          if (runRef.current !== run) return;
          setTiles((current) => ({
            ...current,
            [key]: { ...current[key], status: 'ready', image, detail: `${scene.illustration.decorations.length} marks` },
          }));
        } else {
          setTiles((current) => ({ ...current, [key]: { ...current[key], status: 'rendering' } }));
          const scene = createCityProductScene(print, 'slate');
          const image = await renderScene(scene, null, { width: RENDER_WIDTH });
          if (runRef.current !== run) return;
          setTiles((current) => ({ ...current, [key]: { ...current[key], status: 'ready', image } }));
        }
      } catch (error) {
        if (runRef.current !== run) return;
        setTiles((current) => ({
          ...current,
          [key]: { ...current[key], status: 'error', detail: error instanceof Error ? error.message : 'failed' },
        }));
      } finally {
        active--;
        next();
      }
    }

    next();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const list = Object.values(tiles);
  const summary = {
    ready: list.filter((tile) => tile.status === 'ready').length,
    error: list.filter((tile) => tile.status === 'error').length,
    total: list.length,
  };

  return (
    <main className="min-h-screen bg-[#14201d] px-6 py-8 text-[#f7f4eb]">
      <header className="mx-auto flex max-w-[1700px] flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light">Catalog audit</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-white/55">
            Every sellable print, rendered with production data. Structural checks live in /selftest;
            this page is for the eye: composition, density, and whether each map looks worth buying.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/50">
            {summary.ready}/{summary.total} rendered{summary.error > 0 ? ` · ${summary.error} failed` : ''}
          </span>
          <div className="flex border border-white/20 p-1">
            {(['lead', ...STATE_COLLECTION_DESIGNS.map((d) => d.id)] as ThemeChoice[]).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setTheme(choice)}
                aria-pressed={theme === choice}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors ${theme === choice ? 'bg-[#f7f4eb] text-[#14201d]' : 'text-white/60 hover:text-white'}`}
              >
                {choice === 'lead' ? 'Lead design' : choice.replace('doodle-atlas', 'Doodle')}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 grid max-w-[1700px] grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {list.map((tile) => (
          <figure key={tile.key} className={`border p-2 ${tile.status === 'error' ? 'border-[#c1362b]/70 bg-[#2a1512]' : 'border-white/12 bg-white/[0.03]'}`}>
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#f2efe7]">
              {tile.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tile.image} alt={`${tile.label} audit render`} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center px-2 text-center text-[10px] text-[#68736e]">
                  {tile.status === 'error' ? `✕ ${tile.detail ?? 'failed'}` : tile.status === 'rendering' ? 'rendering…' : 'queued'}
                </div>
              )}
            </div>
            <figcaption className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] font-medium">{tile.label}</span>
              <span className="shrink-0 text-[9px] text-white/45">{tile.detail && tile.status === 'ready' ? tile.detail : tile.sublabel}</span>
            </figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
