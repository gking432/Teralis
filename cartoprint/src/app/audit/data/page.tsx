'use client';

/**
 * Machine-readable catalog audit.
 *
 * /audit renders pictures for human judgment; this page reports the facts
 * behind them for every sellable print, through BOTH entry paths a customer
 * can arrive by (catalog link and search result). It exists because checking
 * maps one at a time is how regressions survive: a change that helps one
 * state and empties another shows up here as a diff, not as a customer email.
 */

import { useEffect, useState } from 'react';
import { getCityCatalogPrints, getFeaturedCatalogPrint, getStateCatalogPrints } from '@/lib/catalog/prints';
import { buildPlaceCatalogPrint } from '@/lib/catalog/placeFromQuery';
import { createCityProductScene } from '@/lib/catalog/cityProduct';
import { designsForState, sceneForCollectionDesign } from '@/lib/catalog/stateCollection';
import { createPrintScene, sceneDensity } from '@/lib/print/scene';
import { layoutDecorations } from '@/lib/print/decorations';
import { checkPrintReadiness } from '@/lib/print/readiness';

export default function AuditDataPage() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const out: string[] = [];
    const states = getStateCatalogPrints();

    out.push('REGION\tKIND\tMARKS\tTREES\tPEAKS\tWATER\tSTAR\tLABELS\tDESIGNS\tSUBTITLE\tREADY\tSEARCH_MATCH');
    for (const print of [...states, getFeaturedCatalogPrint()]) {
      const scene = createPrintScene(print, 'portrait');
      const drawn = layoutDecorations(scene);
      const count = (test: (kind: string) => boolean) => drawn.filter((d) => test(d.kind)).length;
      const trees = count((k) => k === 'forest');
      const peaks = count((k) => k === 'mountains' || k === 'hills');
      const water = count((k) => k === 'waves');
      const star = count((k) => k === 'star');
      const labels = count((k) => k === 'text');
      const designs = designsForState(print.slug, print.center).map((d) => d.id[0]).join('');
      const ready = checkPrintReadiness(scene).ready ? 'y' : 'NO';

      // The same place as a search result must produce the same print.
      const searched = buildPlaceCatalogPrint({
        name: print.name,
        displayName: `${print.name}, United States`,
        kind: print.kind,
        placeType: print.kind,
        bbox: print.bbox.map(Number) as [number, number, number, number],
        center: print.center,
      });
      const searchScene = createPrintScene(searched, 'portrait');
      const same = searchScene.illustration.decorations.length === scene.illustration.decorations.length
        && searchScene.title.subtitle === scene.title.subtitle;

      out.push([
        print.slug, print.kind, drawn.length, trees, peaks, water, star, labels,
        designs, scene.title.subtitle, ready, same ? 'y' : 'MISMATCH',
      ].join('\t'));
    }

    out.push('');
    out.push('CITY\tSTATE\tROADS\tPLACES\tEVERY_STREET\tDECOR\tREADY');
    for (const print of getCityCatalogPrints()) {
      const scene = createCityProductScene(print, 'slate');
      const density = sceneDensity(scene);
      out.push([
        print.slug, print.defaultSubtitle, scene.detail.roads, scene.detail.places,
        density.everyStreet ? 'y' : 'n', scene.illustration.decorations.length,
        checkPrintReadiness(scene).ready ? 'y' : 'NO',
      ].join('\t'));
    }

    out.push('');
    out.push('THEME COVERAGE (marks drawn per design, per state)');
    out.push('REGION\tDOODLE\tHERITAGE\tTOPO');
    for (const print of states) {
      const perTheme = ['doodle-atlas', 'heritage', 'topographic'].map((id) => {
        const design = designsForState(print.slug, print.center).find((d) => d.id === id);
        if (!design) return '—';
        return String(layoutDecorations(sceneForCollectionDesign(print, design)).length);
      });
      out.push([print.slug, ...perTheme].join('\t'));
    }

    setLines(out);
  }, []);

  return <pre id="audit-data" data-done={lines.length > 0}>{lines.join('\n')}</pre>;
}
