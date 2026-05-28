'use client';

import { useState } from 'react';
import { SearchBar } from './SearchBar';
import {
  DETAIL_LABELS,
  PRESET_OPTIONS,
  SCALE_BAND_LABELS,
  getControlHint,
} from '@/lib/map/builder';
import type {
  BorderDensity,
  BuilderState,
  FeatureSetting,
  FocusMode,
  LabelDensity,
  LayerGroup as LayerGroupType,
  LayerState,
  MapPreset,
  MapSelection,
  NatureDensity,
  RoadDensity,
} from '@/types/map';

interface ControlPanelProps {
  builder: BuilderState;
  layers: LayerState;
  selection: MapSelection | null;
  panelOpen: boolean;
  onSearch: (query: string) => void;
  onSetPreset: (preset: MapPreset) => void;
  onSetLabelDensity: (density: LabelDensity) => void;
  onSetRoadDensity: (density: RoadDensity) => void;
  onSetNatureDensity: (density: NatureDensity) => void;
  onSetBorderDensity: (density: BorderDensity) => void;
  onResetDetailsToGuided: () => void;
  onSetFocusMode: (mode: FocusMode) => void;
  onSetAdvancedOverride: (group: LayerGroupType, value: FeatureSetting) => void;
  onClearAdvancedOverrides: () => void;
  onClearSelection: () => void;
  onTogglePanel: () => void;
}

const ADVANCED_GROUPS: Array<{ key: LayerGroupType; label: string }> = [
  { key: 'countries', label: 'Country Borders' },
  { key: 'states', label: 'State Borders' },
  { key: 'counties', label: 'County Borders' },
  { key: 'capitals', label: 'Capitals' },
  { key: 'cities', label: 'Cities' },
  { key: 'towns', label: 'Towns' },
  { key: 'statelabels', label: 'State Labels' },
  { key: 'countrylabels', label: 'Country Labels' },
  { key: 'highways', label: 'Highways' },
  { key: 'mainroads', label: 'Major Roads' },
  { key: 'allroads', label: 'Streets' },
  { key: 'roadlabels', label: 'Street Labels' },
  { key: 'water', label: 'Lakes' },
  { key: 'rivers', label: 'Rivers' },
  { key: 'riverlabels', label: 'River Labels' },
  { key: 'waterlabels', label: 'Lake Labels' },
  { key: 'terrain', label: 'Terrain' },
];

const PLACE_LABEL_GROUPS: LayerGroupType[] = ['capitals', 'cities', 'towns'];

export function ControlPanel({
  builder,
  layers,
  selection,
  panelOpen,
  onSearch,
  onSetPreset,
  onSetLabelDensity,
  onSetRoadDensity,
  onSetNatureDensity,
  onSetBorderDensity,
  onResetDetailsToGuided,
  onSetFocusMode,
  onSetAdvancedOverride,
  onClearAdvancedOverrides,
  onClearSelection,
  onTogglePanel,
}: ControlPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const placeLabelsVisible = layers.capitals || layers.cities || layers.towns;

  const setPlaceLabelsVisible = (visible: boolean) => {
    if (visible && builder.labels === 'none') {
      onSetLabelDensity('major');
    }

    PLACE_LABEL_GROUPS.forEach((group) => {
      onSetAdvancedOverride(group, visible ? 'auto' : 'off');
    });
  };

  return (
    <>
      <aside
        className={`fixed top-header left-0 bottom-0 z-40 w-panel bg-panel/95 backdrop-blur border-r border-border shadow-[0_10px_30px_rgba(0,0,0,0.08)] overflow-y-auto panel-scroll transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : '-translate-x-panel'
        }`}
      >
      <div className="min-h-full">
        <div className="grid gap-3 p-4">
          <div>
            <div className="text-[11px] tracking-[1.5px] uppercase text-text-muted mb-1">
              Customize
            </div>
            <h2 className="font-display text-[24px] font-light leading-tight">
              Map Details
            </h2>
          </div>

          <div>
            <SearchBar onSearch={onSearch} />
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
              {selection
                ? `${selection.name} selected. ${selection.type}.`
                : 'Click a country, state, county, or city on the map to isolate it. Zoom in first when you want smaller places.'}
            </p>
            <p className="text-[11px] text-text-light mt-2 leading-relaxed">
              The live map stays simplified for editing. Click Preview to render the print-ratio
              version with your selected detail.
            </p>
          </div>

          <QuickSection label="Style">
            <ChipRow
              value={builder.preset}
              options={PRESET_OPTIONS.map((preset) => ({
                value: preset.id,
                label: preset.name,
              }))}
              onChange={(value) => onSetPreset(value as MapPreset)}
            />
          </QuickSection>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
          <StatusPill label="Scale" value={SCALE_BAND_LABELS[builder.scaleBand]} />
          <StatusPill label="Focus" value={focusModeLabel(builder.focusMode)} />
          {selection && <StatusPill label="Selected" value={selection.name} />}
          {builder.detailMode === 'custom' && <StatusPill label="Detail" value="Custom" />}
          {selection && (
            <button
              onClick={onClearSelection}
              className="text-[11px] tracking-[1px] uppercase text-text-muted hover:text-text"
            >
              Clear Selection
            </button>
          )}
          <button
            onClick={() => setDetailsOpen((open) => !open)}
            className="ml-auto text-[11px] tracking-[1px] uppercase text-text-muted hover:text-text"
          >
            {detailsOpen ? 'Hide Controls' : 'Show Controls'}
          </button>
        </div>

        {detailsOpen && (
          <div className="border-t border-border px-4 py-4 bg-[linear-gradient(180deg,#fff_0%,#fbfbf8_100%)]">
            {selection && selection.type !== 'viewport' && (
              <div className="mb-4 border border-border-light bg-white/75 p-3 text-[11px] text-text-muted leading-relaxed">
                Add or remove detail inside <span className="text-text">{selection.name}</span>.
                Use <span className="text-text">Labels {'>'} All Towns</span> for maximum town
                labels, and use roads, water, and borders to simplify or enrich the print.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <SegmentedField
                label="Labels"
                value={builder.labels}
                onChange={(value) => onSetLabelDensity(value as LabelDensity)}
                options={[
                  { value: 'none', label: DETAIL_LABELS.labels.none },
                  { value: 'major', label: DETAIL_LABELS.labels.major },
                  { value: 'more', label: DETAIL_LABELS.labels.more },
                  { value: 'dense', label: DETAIL_LABELS.labels.dense },
                ]}
                hint={getControlHint('labels', builder.labels, builder.scaleBand, selection)}
              />

              <SegmentedField
                label="Roads"
                value={builder.roads}
                onChange={(value) => onSetRoadDensity(value as RoadDensity)}
                options={[
                  { value: 'none', label: DETAIL_LABELS.roads.none },
                  { value: 'highways', label: DETAIL_LABELS.roads.highways },
                  { value: 'major', label: DETAIL_LABELS.roads.major },
                  { value: 'streets', label: DETAIL_LABELS.roads.streets },
                ]}
                hint={getControlHint('roads', builder.roads, builder.scaleBand, selection)}
              />

              <SegmentedField
                label="Water"
                value={builder.nature}
                onChange={(value) => onSetNatureDensity(value as NatureDensity)}
                options={[
                  { value: 'none', label: DETAIL_LABELS.nature.none },
                  { value: 'water', label: DETAIL_LABELS.nature.water },
                  { value: 'terrain', label: DETAIL_LABELS.nature.terrain },
                ]}
                hint={getControlHint('nature', builder.nature, builder.scaleBand, selection)}
              />

              <SegmentedField
                label="Borders"
                value={builder.borders}
                onChange={(value) => onSetBorderDensity(value as BorderDensity)}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'state', label: 'State Borders' },
                  { value: 'county', label: 'County Borders' },
                ]}
                hint={getControlHint('borders', builder.borders, builder.scaleBand, selection)}
              />
            </div>

            <div className="mt-4">
              <QuickSection label="Label Visibility">
                <div className="grid gap-2">
                  <LabelVisibilityToggle
                    label="City Labels"
                    description="City, capital, town, and village names"
                    checked={placeLabelsVisible}
                    onChange={setPlaceLabelsVisible}
                  />
                  <LabelVisibilityToggle
                    label="Street Labels"
                    description="Street and road names"
                    checked={layers.roadlabels}
                    onChange={(visible) => onSetAdvancedOverride('roadlabels', visible ? 'auto' : 'off')}
                  />
                  <LabelVisibilityToggle
                    label="Lake Labels"
                    description="Lake and waterbody names"
                    checked={layers.waterlabels}
                    onChange={(visible) => onSetAdvancedOverride('waterlabels', visible ? 'auto' : 'off')}
                  />
                </div>
                <p className="mt-2 text-[11px] text-text-light">
                  Lakes stay on the map; these switches only hide or show names.
                </p>
              </QuickSection>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <QuickSection label="Focus">
                <ChipRow
                  value={builder.focusMode}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'outline', label: 'Outline' },
                    { value: 'fade', label: 'Fade' },
                    { value: 'crop', label: 'Crop' },
                  ]}
                  disabled={!selection}
                  onChange={(value) => onSetFocusMode(value as FocusMode)}
                />
              </QuickSection>

              {builder.detailMode === 'custom' && (
                <button
                  onClick={onResetDetailsToGuided}
                  className="text-[11px] tracking-[1px] uppercase text-text-muted hover:text-text"
                >
                  Reset Auto Detail
                </button>
              )}

              <button
                onClick={() => setAdvancedOpen((open) => !open)}
                className="ml-auto text-[11px] tracking-[1px] uppercase text-text-muted hover:text-text"
              >
                {advancedOpen ? 'Hide Advanced' : 'Advanced'}
              </button>
            </div>

            {advancedOpen && (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ADVANCED_GROUPS.map((group) => (
                  <AdvancedOverrideRow
                    key={group.key}
                    label={group.label}
                    effective={layers[group.key]}
                    value={builder.advancedOverrides[group.key] || 'auto'}
                    onChange={(value) => onSetAdvancedOverride(group.key, value)}
                  />
                ))}
                <button
                  onClick={onClearAdvancedOverrides}
                  className="text-[11px] tracking-[1px] uppercase text-text-muted hover:text-text text-left"
                >
                  Reset Advanced Overrides
                </button>
              </div>
            )}
          </div>
        )}
      </div>
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

function QuickSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium tracking-[1.5px] uppercase text-text-muted mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipRow({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? 'opacity-50' : ''}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => !disabled && onChange(option.value)}
          className={`px-2.5 py-2 border text-[11px] transition-all ${
            value === option.value ? 'border-text bg-bg text-text' : 'border-border text-text-muted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SegmentedField({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  hint: string | null;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium tracking-[1.5px] uppercase text-text-muted mb-2.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-2 border text-[11px] transition-all ${
              value === option.value ? 'border-text bg-bg text-text' : 'border-border text-text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-[11px] text-text-light mt-2">{hint}</p>}
    </div>
  );
}

function LabelVisibilityToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-4 border p-3 text-left transition-all ${
        checked ? 'border-text bg-bg text-text' : 'border-border bg-white/60 text-text-muted'
      }`}
    >
      <div>
        <div className="text-sm">{label}</div>
        <div className="mt-1 text-[11px] leading-relaxed text-text-light">{description}</div>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-all ${
          checked ? 'border-text bg-text' : 'border-border bg-bg'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}

function AdvancedOverrideRow({
  label,
  effective,
  value,
  onChange,
}: {
  label: string;
  effective: boolean;
  value: FeatureSetting;
  onChange: (value: FeatureSetting) => void;
}) {
  return (
    <div className="border border-border-light p-3">
      <div className="text-sm">{label}</div>
      <div className="text-[11px] text-text-light mt-1 mb-2">
        Effective: {effective ? 'Visible' : 'Hidden'}
      </div>
      <div className="flex gap-1">
        {(['auto', 'on', 'off'] as FeatureSetting[]).map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`px-2 py-1.5 border text-[10px] tracking-[1px] uppercase ${
              value === option ? 'border-text bg-bg text-text' : 'border-border text-text-muted'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ready' | 'needs-adjustment' | 'blocked';
}) {
  const toneClass =
    tone === 'ready'
      ? 'bg-[#f5faf5]'
      : tone === 'blocked'
        ? 'bg-[#fff2f2]'
        : tone === 'needs-adjustment'
          ? 'bg-[#fff8ec]'
          : '';

  return (
    <div className={`px-2.5 py-1 border border-border-light text-[10px] tracking-[1px] uppercase text-text-muted ${toneClass}`}>
      {label}: <span className="text-text">{value}</span>
    </div>
  );
}


function focusModeLabel(mode: FocusMode): string {
  switch (mode) {
    case 'outline':
      return 'Outline';
    case 'fade':
      return 'Fade';
    case 'crop':
      return 'Crop';
    default:
      return 'None';
  }
}
