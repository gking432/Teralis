'use client';

import { SearchBar } from './SearchBar';
import { TemplateGrid } from './TemplateGrid';
import { LayerGroup } from './LayerGroup';
import { LayerToggle } from './LayerToggle';
import { SelectionControls } from './SelectionControls';
import type { LayerState, MapSelection, LayerGroup as LayerGroupType } from '@/types/map';

interface ControlPanelProps {
  layers: LayerState;
  isIsolated: boolean;
  selection: MapSelection | null;
  panelOpen: boolean;
  onSearch: (query: string) => void;
  onToggleLayer: (group: LayerGroupType) => void;
  onToggleIsolation: () => void;
  onApplyTemplate: (templateId: string) => void;
  onTogglePanel: () => void;
}

const BorderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="12" height="12" />
  </svg>
);
const StateBorderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="12" height="12" />
    <line x1="8" y1="2" x2="8" y2="14" />
  </svg>
);
const CountyIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="12" height="12" />
    <line x1="6" y1="2" x2="6" y2="14" />
    <line x1="10" y1="2" x2="10" y2="14" />
    <line x1="2" y1="8" x2="14" y2="8" />
  </svg>
);
const CityIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="8" r="3" />
  </svg>
);
const CapitalIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);
const TownIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="8" r="2" />
  </svg>
);
const LabelIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <text x="3" y="12" fontSize="10" fill="currentColor" fontFamily="serif">Aa</text>
  </svg>
);
const HighwayIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="2" y1="8" x2="14" y2="8" />
  </svg>
);
const RoadIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="2" y1="8" x2="14" y2="8" />
  </svg>
);
const StreetIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
    <line x1="2" y1="8" x2="14" y2="8" />
  </svg>
);
const WaterIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M2 8 Q5 5 8 8 Q11 11 14 8" />
    <path d="M2 11 Q5 8 8 11 Q11 14 14 11" />
  </svg>
);
const TerrainIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M2 14 L6 6 L9 10 L11 7 L14 14 Z" />
  </svg>
);
const ParkIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M8 3 L4 9 H6 L3 13 H13 L10 9 H12 Z" />
  </svg>
);

export function ControlPanel({
  layers,
  isIsolated,
  selection,
  panelOpen,
  onSearch,
  onToggleLayer,
  onToggleIsolation,
  onApplyTemplate,
  onTogglePanel,
}: ControlPanelProps) {
  return (
    <>
      <aside
        className={`fixed top-header left-0 w-panel h-[calc(100vh-64px)] bg-panel border-r border-border overflow-y-auto z-40 panel-scroll transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : '-translate-x-panel'
        }`}
      >
        <div className="p-6 border-b border-border-light">
          <h3 className="font-display text-sm font-semibold tracking-[2px] uppercase text-text-muted mb-4">
            Navigate
          </h3>
          <SearchBar onSearch={onSearch} />
        </div>

        <div className="p-6 border-b border-border-light">
          <h3 className="font-display text-sm font-semibold tracking-[2px] uppercase text-text-muted mb-4">
            Quick Start
          </h3>
          <TemplateGrid onSelect={onApplyTemplate} />
        </div>

        <LayerGroup title="Selection">
          <SelectionControls
            isIsolated={isIsolated}
            onToggleIsolation={onToggleIsolation}
            selection={selection}
          />
        </LayerGroup>

        <LayerGroup title="Boundaries">
          <LayerToggle label="Country Borders" icon={BorderIcon} active={layers.countries} onToggle={() => onToggleLayer('countries')} />
          <LayerToggle label="State / Province Lines" icon={StateBorderIcon} active={layers.states} onToggle={() => onToggleLayer('states')} />
          <LayerToggle label="County Lines" icon={CountyIcon} active={layers.counties} onToggle={() => onToggleLayer('counties')} />
        </LayerGroup>

        <LayerGroup title="Places">
          <LayerToggle label="State Capitals" icon={CapitalIcon} active={layers.capitals} onToggle={() => onToggleLayer('capitals')} />
          <LayerToggle label="Major Cities" icon={CityIcon} active={layers.cities} onToggle={() => onToggleLayer('cities')} />
          <LayerToggle label="Towns & Villages" icon={TownIcon} active={layers.towns} onToggle={() => onToggleLayer('towns')} />
          <LayerToggle label="State Labels" icon={LabelIcon} active={layers.statelabels} onToggle={() => onToggleLayer('statelabels')} />
          <LayerToggle label="Country Labels" icon={LabelIcon} active={layers.countrylabels} onToggle={() => onToggleLayer('countrylabels')} />
        </LayerGroup>

        <LayerGroup title="Transportation">
          <LayerToggle label="Highways / Interstates" icon={HighwayIcon} active={layers.highways} onToggle={() => onToggleLayer('highways')} />
          <LayerToggle label="Major Roads" icon={RoadIcon} active={layers.mainroads} onToggle={() => onToggleLayer('mainroads')} />
          <LayerToggle label="All Roads & Streets" icon={StreetIcon} active={layers.allroads} onToggle={() => onToggleLayer('allroads')} />
        </LayerGroup>

        <LayerGroup title="Natural Features">
          <LayerToggle label="Water" icon={WaterIcon} active={layers.water} onToggle={() => onToggleLayer('water')} />
          <LayerToggle label="Terrain / Hillshade" icon={TerrainIcon} active={layers.terrain} onToggle={() => onToggleLayer('terrain')} />
          <LayerToggle label="Parks & Land Cover" icon={ParkIcon} active={layers.landcover} onToggle={() => onToggleLayer('landcover')} />
        </LayerGroup>
      </aside>

      <button
        onClick={onTogglePanel}
        className={`fixed z-40 w-7 h-12 bg-panel border border-border border-l-0 rounded-r-md flex items-center justify-center text-sm text-text-muted cursor-pointer transition-all duration-300 ${
          panelOpen ? 'left-panel' : 'left-0'
        }`}
        style={{ top: 'calc(64px + 16px)' }}
      >
        {panelOpen ? '◂' : '▸'}
      </button>
    </>
  );
}
