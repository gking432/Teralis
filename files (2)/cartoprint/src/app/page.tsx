'use client';

/**
 * CartoPrint — Main Map Builder Page
 *
 * This is the primary page of the app. It renders:
 * - The MapLibre map (full viewport behind the panel)
 * - The left control panel with layer toggles
 * - The header with branding + actions
 * - The selection bar (bottom) when a region is selected
 * - The print modal when "Order Print" is clicked
 *
 * TODO: Port the full logic from /reference/prototype.html into these components.
 * The prototype contains all working code for:
 * - Greyscale conversion (applyGreyscale function)
 * - Layer classification (classifyLayer function)
 * - Style overrides (applyStyleOverrides function)
 * - Isolation masking (applyIsolationMask function)
 * - Region selection via Nominatim reverse geocoding
 * - Terrain hillshade setup
 */

export default function MapBuilderPage() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-header bg-panel border-b border-border flex items-center justify-between px-8 z-50">
        <div className="font-display font-light text-[26px] tracking-[3px] uppercase">
          Carto<span className="font-semibold">Print</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-text-muted">Zoom: 4.0×</span>
          <button className="btn-outline">Reset View</button>
          <button className="btn-primary">Order Print</button>
        </div>
      </header>

      {/* Control Panel */}
      <aside className="fixed top-header left-0 w-panel h-[calc(100vh-var(--header-height))] bg-panel border-r border-border overflow-y-auto z-40 panel-scroll">
        <div className="p-6 border-b border-border-light">
          <h3 className="font-display text-sm font-semibold tracking-[2px] uppercase text-text-muted mb-4">
            Navigate
          </h3>
          <input
            type="text"
            placeholder="Search a location... (press Enter)"
            className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-md text-sm outline-none focus:border-text transition-colors"
          />
        </div>

        {/* TODO: Add TemplateGrid, LayerGroups, SelectionControls */}
        <div className="p-6">
          <p className="text-sm text-text-muted">
            Port components from prototype. See PROJECT_SCOPE.md for component structure.
          </p>
        </div>
      </aside>

      {/* Map Container */}
      <div className="fixed top-header left-panel right-0 bottom-0">
        {/* TODO: Mount MapView component here */}
        <div className="w-full h-full bg-bg flex items-center justify-center">
          <p className="font-display text-lg text-text-muted tracking-[2px]">
            Map loads here — see MapView component
          </p>
        </div>
      </div>
    </div>
  );
}
