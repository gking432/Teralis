'use client';

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { useMapStore } from '@/store/mapStore';
import { useOrderStore } from '@/store/orderStore';
import { Header } from '@/components/Header/Header';
import { MapView, MapViewHandle } from '@/components/Map/MapView';
import { SelectionBar } from '@/components/SelectionBar/SelectionBar';
import { PrintModal } from '@/components/PrintModal/PrintModal';
import { catalogPrintToSelection, type CatalogPrint } from '@/lib/catalog/prints';
import { pickSearchResult, searchLocation } from '@/lib/geo/nominatim';
import type { PrintRegionScope, PrintSelectedRegion } from '@/types/order';

const SCOPE_ORDER: PrintRegionScope[] = ['country', 'state', 'county', 'city'];

function getScopeIndex(scope: PrintRegionScope): number {
  return SCOPE_ORDER.indexOf(scope);
}

interface MapBuilderProps {
  catalogPrint?: CatalogPrint | null;
  catalogSlug?: string | null;
}

export function MapBuilder({ catalogPrint = null, catalogSlug = null }: MapBuilderProps) {
  const mapViewRef = useRef<MapViewHandle>(null);
  const [catalogLoadState, setCatalogLoadState] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');

  const {
    view,
    selection,
    setSelection,
    requestFitBounds,
    clearSelection,
    setFocusMode,
  } = useMapStore();

  const {
    modalOpen,
    openModal,
    closeModal,
    drilldownSelections,
    removeRegionScope,
    clearSelections,
    setActiveScope,
  } = useOrderStore();

  const autoOpenedForRef = useRef<string | null>(null);

  const catalogStatusLabel = useMemo(() => {
    if (!catalogPrint) return null;
    if (catalogLoadState === 'fallback') return 'Boundary lookup unavailable. Using saved print bounds.';
    if (catalogLoadState === 'loading') return `Loading ${catalogPrint.name} print bounds...`;
    return `${catalogPrint.name} print loaded`;
  }, [catalogLoadState, catalogPrint]);

  useEffect(() => {
    let cancelled = false;

    if (!catalogPrint) {
      closeModal();
      clearSelection();
      clearSelections();
      setFocusMode('none');
      setCatalogLoadState(catalogSlug ? 'fallback' : 'idle');
      autoOpenedForRef.current = null;
      return;
    }

    const staticSelection = catalogPrintToSelection(catalogPrint);
    clearSelections();
    setActiveScope(catalogPrint.kind === 'country' ? 'state' : 'county');
    setFocusMode('none');
    setSelection(staticSelection);
    requestFitBounds(catalogPrint.bbox);
    mapViewRef.current?.flyTo(catalogPrint.center, catalogPrint.defaultZoom);
    setCatalogLoadState('loading');

    if (autoOpenedForRef.current !== catalogPrint.slug) {
      autoOpenedForRef.current = catalogPrint.slug;
      openModal({
        scope: catalogPrint.kind === 'country' ? 'state' : 'county',
        printSnapshot: staticSelection,
        defaultStep: 'colors',
        defaultTitleEnabled: true,
      });
    }

    searchLocation(catalogPrint.searchQuery)
      .then((results) => {
        if (cancelled) return;
        const target = catalogPrint.kind === 'country' ? 'country' : catalogPrint.kind === 'state' ? 'state' : 'city';
        const picked = pickSearchResult(results, target);

        if (!picked?.geojson) {
          setCatalogLoadState('fallback');
          return;
        }

        const liveSelection = catalogPrintToSelection(catalogPrint, picked.geojson);
        setSelection(liveSelection);
        setFocusMode('crop');
        setCatalogLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setCatalogLoadState('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [
    catalogPrint,
    catalogSlug,
    clearSelection,
    clearSelections,
    closeModal,
    openModal,
    requestFitBounds,
    setActiveScope,
    setFocusMode,
    setSelection,
  ]);

  const handleReset = useCallback(() => {
    if (catalogPrint) {
      requestFitBounds(catalogPrint.bbox);
      return;
    }

    mapViewRef.current?.flyTo([-98.58, 39.83], 4);
    clearSelection();
    clearSelections();
    setFocusMode('none');
  }, [catalogPrint, clearSelection, clearSelections, requestFitBounds, setFocusMode]);

  const handlePreview = useCallback(() => {
    openModal({
      printSnapshot: mapViewRef.current?.snapshotView() || null,
    });
  }, [openModal]);

  const handleZoomToSelection = useCallback(() => {
    if (selection?.bbox) {
      mapViewRef.current?.fitBounds(selection.bbox);
    }
  }, [selection]);

  const restoreSelection = useCallback(
    (region: PrintSelectedRegion | null) => {
      if (!region) {
        clearSelection();
        setFocusMode('none');
        return;
      }

      setSelection({
        name: region.name,
        type: region.scope,
        fullName: region.fullName || region.name,
        geojson: region.geojson,
        bbox: region.bbox || null,
      });
      setFocusMode('crop');
      if (region.bbox) {
        requestFitBounds(region.bbox);
      }
    },
    [clearSelection, requestFitBounds, setFocusMode, setSelection]
  );

  const handleBackUp = useCallback(() => {
    const current = drilldownSelections[drilldownSelections.length - 1];
    if (!current) return;
    const parent =
      [...drilldownSelections]
        .filter((region) => getScopeIndex(region.scope) < getScopeIndex(current.scope))
        .at(-1) || null;

    removeRegionScope(current.scope);
    restoreSelection(parent);
    setActiveScope(current.scope);
  }, [drilldownSelections, removeRegionScope, restoreSelection, setActiveScope]);

  const hasBackUpTarget = drilldownSelections.length > 1 && selection?.type !== 'viewport';

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header
        zoom={view.zoom}
        onReset={handleReset}
        onPreview={handlePreview}
      />

      <div className="fixed top-header left-0 right-0 bottom-0">
        <MapView ref={mapViewRef} panelOpen={false} printMode />
      </div>

      {!modalOpen && <MapInfoBar view={view} catalogStatusLabel={catalogStatusLabel} />}

      {selection && !modalOpen && (
        <SelectionBar
          selection={selection}
          onZoomTo={handleZoomToSelection}
          onBackUp={hasBackUpTarget ? handleBackUp : undefined}
          onClear={() => {
            clearSelection();
            clearSelections();
          }}
        />
      )}

      <PrintModal />
    </div>
  );
}

function MapInfoBar({
  view,
  catalogStatusLabel,
}: {
  view: { center: [number, number]; zoom: number };
  catalogStatusLabel: string | null;
}) {
  const clickTarget =
    view.zoom < 5.5 ? 'country' : view.zoom < 7.5 ? 'state' : view.zoom < 10.5 ? 'county' : 'city';

  return (
    <div className="fixed bottom-6 left-6 bg-panel border border-border px-[18px] py-2.5 text-xs text-text-muted z-[997] flex gap-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-1.5">
        <span className="font-medium tracking-[0.5px] uppercase text-[10px]">Lat</span>
        <span>{view.center[1].toFixed(4)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium tracking-[0.5px] uppercase text-[10px]">Lng</span>
        <span>{view.center[0].toFixed(4)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium tracking-[0.5px] uppercase text-[10px]">Zoom</span>
        <span>{view.zoom.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium tracking-[0.5px] uppercase text-[10px]">Tip</span>
        <span>{catalogStatusLabel || `Click a ${clickTarget} to isolate it`}</span>
      </div>
    </div>
  );
}
