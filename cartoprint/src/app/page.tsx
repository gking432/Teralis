'use client';

import { useRef, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';
import { useOrderStore } from '@/store/orderStore';
import { Header } from '@/components/Header/Header';
import { ControlPanel } from '@/components/Panel/ControlPanel';
import { MapView, MapViewHandle } from '@/components/Map/MapView';
import { SelectionBar } from '@/components/SelectionBar/SelectionBar';
import { PrintModal } from '@/components/PrintModal/PrintModal';
import { searchLocation } from '@/lib/geo/nominatim';

export default function MapBuilderPage() {
  const mapViewRef = useRef<MapViewHandle>(null);

  const {
    view,
    layers,
    selection,
    isIsolated,
    panelOpen,
    toggleLayer,
    toggleIsolation,
    setSelection,
    setIsolated,
    clearSelection,
    applyTemplate,
    togglePanel,
  } = useMapStore();

  const { openModal } = useOrderStore();

  const handleReset = useCallback(() => {
    mapViewRef.current?.flyTo([-98.58, 39.83], 4);
    clearSelection();
  }, [clearSelection]);

  const handleSearch = useCallback(
    async (query: string) => {
      try {
        const results = await searchLocation(query);
        if (results.length > 0) {
          const result = results[0];
          const bbox = result.boundingbox;

          if (bbox) {
            mapViewRef.current?.fitBounds(bbox);
          }

          if (result.geojson) {
            const name = result.display_name.split(',').slice(0, 2).join(', ');
            setSelection({
              name,
              type: result.type || result.class || 'region',
              fullName: result.display_name,
              geojson: result.geojson,
              bbox,
            });
          }
        }
      } catch (err) {
        console.error('Search failed:', err);
      }
    },
    [setSelection]
  );

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      applyTemplate(templateId);
      mapViewRef.current?.flyTo([-98.58, 39.83], 4);
    },
    [applyTemplate]
  );

  const handleZoomToSelection = useCallback(() => {
    if (selection?.bbox) {
      mapViewRef.current?.fitBounds(selection.bbox);
    }
  }, [selection]);

  const handleIsolateSelection = useCallback(() => {
    if (selection) {
      setIsolated(true);
    }
  }, [selection, setIsolated]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Header zoom={view.zoom} onReset={handleReset} onOrderPrint={openModal} />

      <ControlPanel
        layers={layers}
        isIsolated={isIsolated}
        selection={selection}
        panelOpen={panelOpen}
        onSearch={handleSearch}
        onToggleLayer={toggleLayer}
        onToggleIsolation={toggleIsolation}
        onApplyTemplate={handleApplyTemplate}
        onTogglePanel={togglePanel}
      />

      <div
        className={`fixed top-header right-0 bottom-0 transition-all duration-300 ${
          panelOpen ? 'left-panel' : 'left-0'
        }`}
      >
        <MapView ref={mapViewRef} panelOpen={panelOpen} />
      </div>

      <MapInfoBar panelOpen={panelOpen} view={view} />

      {selection && (
        <SelectionBar
          selection={selection}
          onZoomTo={handleZoomToSelection}
          onIsolate={handleIsolateSelection}
          onClear={clearSelection}
        />
      )}

      <PrintModal />
    </div>
  );
}

function MapInfoBar({
  panelOpen,
  view,
}: {
  panelOpen: boolean;
  view: { center: [number, number]; zoom: number };
}) {
  return (
    <div
      className={`fixed bottom-6 bg-panel border border-border px-[18px] py-2.5 text-xs text-text-muted z-[997] flex gap-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-300 ${
        panelOpen ? 'left-[calc(320px+24px)]' : 'left-6'
      }`}
    >
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
    </div>
  );
}
