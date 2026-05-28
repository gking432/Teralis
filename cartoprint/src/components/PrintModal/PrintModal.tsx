'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useMapStore } from '@/store/mapStore';
import { useOrderStore } from '@/store/orderStore';
import {
  PrintPreviewMap,
  type PreviewCompositionMode,
  type PreviewColorSettings,
  type PreviewLabelSettings,
  type PreviewTitleLayout,
  type PreviewTitleSettings,
  type PreviewTownLabelMode,
} from '@/components/PrintModal/PrintPreviewMap';
import type { MapSelection } from '@/types/map';

type PreviewEditorStep = 'labels' | 'colors' | 'design';

const WHITE_LAND = '#ffffff';
const MAP_DEFAULT_COLORS: PreviewColorSettings = {
  land: '#fafaf8',
  water: '#ffffff',
  roads: '#8a8a84',
  useMapDefault: true,
};
const DEFAULT_LABEL_SETTINGS: PreviewLabelSettings = {
  cityLabels: false,
  townLabels: 'none',
  streetLabels: false,
  lakeLabels: false,
  riverLabels: false,
  regionLabels: false,
};

const COLOR_SCHEMES: { value: string; label: string; desc: string; colors: PreviewColorSettings }[] = [
  {
    value: 'map-default',
    label: 'Map Default',
    desc: 'Exactly what you saw before preview',
    colors: MAP_DEFAULT_COLORS,
  },
  {
    value: 'midnight',
    label: 'Midnight',
    desc: 'Deep navy streets and water',
    colors: { land: WHITE_LAND, water: '#07122a', roads: '#07122a' },
  },
  {
    value: 'sepia',
    label: 'Brown Paper',
    desc: 'Off-white land, brown water, warm streets',
    colors: { land: '#fbf7ef', water: '#6f4a2b', roads: '#9a6a3a' },
  },
  {
    value: 'charcoal',
    label: 'Charcoal',
    desc: 'Soft black streets and water',
    colors: { land: WHITE_LAND, water: '#252525', roads: '#252525' },
  },
  {
    value: 'slate',
    label: 'Slate',
    desc: 'Cool grey-blue streets and water',
    colors: { land: WHITE_LAND, water: '#54616f', roads: '#54616f' },
  },
  {
    value: 'forest',
    label: 'Forest',
    desc: 'Deep green streets and water',
    colors: { land: WHITE_LAND, water: '#1f3d34', roads: '#1f3d34' },
  },
];

const TITLE_LAYOUTS: { value: PreviewTitleLayout; label: string; desc: string }[] = [
  { value: 'classic-bottom', label: 'Poster Footer', desc: 'Large title block below the map' },
  { value: 'compact-bottom', label: 'Clean Footer', desc: 'Smaller centered title bar' },
  { value: 'top-left', label: 'Gallery Label', desc: 'Floating label in the corner' },
  { value: 'side-rail', label: 'Side Rail', desc: 'Editorial vertical title' },
  { value: 'minimal-corner', label: 'Quiet Corner', desc: 'Small title for map-first prints' },
];

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District Of Columbia',
};

const STATE_ESTABLISHED_YEARS: Record<string, string> = {
  alabama: '1819',
  alaska: '1959',
  arizona: '1912',
  arkansas: '1836',
  california: '1850',
  colorado: '1876',
  connecticut: '1788',
  delaware: '1787',
  florida: '1845',
  georgia: '1788',
  hawaii: '1959',
  idaho: '1890',
  illinois: '1818',
  indiana: '1816',
  iowa: '1846',
  kansas: '1861',
  kentucky: '1792',
  louisiana: '1812',
  maine: '1820',
  maryland: '1788',
  massachusetts: '1788',
  michigan: '1837',
  minnesota: '1858',
  mississippi: '1817',
  missouri: '1821',
  montana: '1889',
  nebraska: '1867',
  nevada: '1864',
  'new hampshire': '1788',
  'new jersey': '1787',
  'new mexico': '1912',
  'new york': '1788',
  'north carolina': '1789',
  'north dakota': '1889',
  ohio: '1803',
  oklahoma: '1907',
  oregon: '1859',
  pennsylvania: '1787',
  'rhode island': '1790',
  'south carolina': '1788',
  'south dakota': '1889',
  tennessee: '1796',
  texas: '1845',
  utah: '1896',
  vermont: '1791',
  virginia: '1788',
  washington: '1889',
  'west virginia': '1863',
  wisconsin: '1848',
  wyoming: '1890',
  'district of columbia': '1790',
  'district columbia': '1790',
};

const COUNTRY_ESTABLISHED_YEARS: Record<string, string> = {
  'united states': '1776',
  'united states america': '1776',
  usa: '1776',
  canada: '1867',
  mexico: '1810',
  australia: '1901',
  'united kingdom': '1707',
  france: '843',
  germany: '1871',
  italy: '1861',
  spain: '1479',
  ireland: '1922',
  brazil: '1822',
  argentina: '1816',
  japan: '660 BCE',
};

function sameColors(a: PreviewColorSettings, b: PreviewColorSettings): boolean {
  return (
    Boolean(a.useMapDefault) === Boolean(b.useMapDefault) &&
    a.land === b.land &&
    a.water === b.water &&
    a.roads === b.roads
  );
}

function getEditableColorSettings(colors: PreviewColorSettings): PreviewColorSettings {
  return {
    land: colors.land || MAP_DEFAULT_COLORS.land,
    water: colors.water || MAP_DEFAULT_COLORS.water,
    roads: colors.roads || MAP_DEFAULT_COLORS.roads,
  };
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeLookupName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(state|commonwealth|province|country|republic|kingdom|of|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getSourceScope(selection: MapSelection | null | undefined): 'city' | 'state' | 'country' | 'other' {
  if (!selection) return 'other';
  const value = `${selection.type} ${selection.name} ${selection.fullName}`.toLowerCase();
  if (/city|town|village|municipality|hamlet/.test(value)) return 'city';
  if (/state|province|territory|county/.test(value)) return 'state';
  if (/country|nation/.test(value)) return 'country';
  return 'other';
}

function formatCoordinatePair(center: [number, number]): string {
  const [lng, lat] = center;
  const latDirection = lat >= 0 ? 'N' : 'S';
  const lngDirection = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)} ${latDirection}  ${Math.abs(lng).toFixed(4)} ${lngDirection}`;
}

function getBBoxCenter(bbox: MapSelection['bbox'] | null | undefined): [number, number] | null {
  if (!bbox) return null;
  const south = Number(bbox[0]);
  const north = Number(bbox[1]);
  const west = Number(bbox[2]);
  const east = Number(bbox[3]);
  if ([south, north, west, east].some((value) => Number.isNaN(value))) return null;
  return [(west + east) / 2, (south + north) / 2];
}

function isGenericSnapshotName(value: string | undefined): boolean {
  return !value || /snapshot|current map|custom map/i.test(value);
}

function getTitleSource(snapshot: MapSelection | null, selection: MapSelection | null): MapSelection | null {
  return snapshot && !isGenericSnapshotName(snapshot.name) ? snapshot : selection;
}

function getEstablishedLine(source: MapSelection | null | undefined): string {
  if (!source) return '';
  const scope = getSourceScope(source);
  const name = normalizeLookupName(source.name || source.fullName.split(',')[0] || '');
  const fullNamePart = normalizeLookupName(source.fullName.split(',')[0] || source.name || '');

  if (scope === 'state') {
    const year = STATE_ESTABLISHED_YEARS[name] || STATE_ESTABLISHED_YEARS[fullNamePart];
    return year ? `EST. ${year}` : '';
  }

  if (scope === 'country') {
    const year = COUNTRY_ESTABLISHED_YEARS[name] || COUNTRY_ESTABLISHED_YEARS[fullNamePart];
    return year ? `EST. ${year}` : '';
  }

  return '';
}

function shouldFindVisiblePlaceTitle(snapshot: MapSelection | null, selection: MapSelection | null): boolean {
  const source = getTitleSource(snapshot, selection);
  const scope = getSourceScope(source);
  return !source || scope === 'city' || scope === 'other';
}

function getRecommendedTitleText(
  snapshot: MapSelection | null,
  selection: MapSelection | null,
  center: [number, number]
): Pick<PreviewTitleSettings, 'title' | 'subtitle' | 'detail'> {
  const source = getTitleSource(snapshot, selection);
  const scope = getSourceScope(source);
  const titleCenter = getBBoxCenter(source?.bbox) || center;
  const fullNameParts = (source?.fullName || source?.name || '')
    .split(',')
    .map((part) => titleCase(part.trim()))
    .filter(Boolean);
  const title = titleCase(!isGenericSnapshotName(source?.name) ? source?.name || fullNameParts[0] || '' : '');
  const normalizedTitle = title.toLowerCase();
  const subtitle =
    fullNameParts.find((part) => {
      const normalizedPart = part.toLowerCase();
      return normalizedPart !== normalizedTitle && !/united states|usa|u\.s\./.test(normalizedPart);
    }) || '';

  return {
    title,
    subtitle,
    detail: scope === 'city' ? formatCoordinatePair(titleCenter) : getEstablishedLine(source),
  };
}

function getFeatureName(feature: GeoJSON.Feature): string {
  const value = feature.properties?.name;
  return typeof value === 'string' ? value : '';
}

function getFeatureState(feature: GeoJSON.Feature): string {
  const value = feature.properties?.state;
  if (typeof value !== 'string') return '';
  return STATE_NAMES[value.toUpperCase()] || titleCase(value);
}

function getFeatureRank(feature: GeoJSON.Feature): number {
  const value = feature.properties?.rank;
  return typeof value === 'number' ? value : 9;
}

function getFeatureCoordinates(feature: GeoJSON.Feature): [number, number] | null {
  if (feature.geometry?.type !== 'Point') return null;
  const [lng, lat] = feature.geometry.coordinates;
  return typeof lng === 'number' && typeof lat === 'number' ? [lng, lat] : null;
}

function getDistanceScore(coordinates: [number, number], center: [number, number]): number {
  return Math.hypot(coordinates[0] - center[0], coordinates[1] - center[1]);
}

function getBestTitleFeature(
  featureCollection: GeoJSON.FeatureCollection,
  center: [number, number]
): GeoJSON.Feature | null {
  return (
    featureCollection.features
      .filter((feature) => getFeatureName(feature) && getFeatureCoordinates(feature))
      .sort((a, b) => {
        const rankDelta = getFeatureRank(a) - getFeatureRank(b);
        if (rankDelta !== 0) return rankDelta;
        return (
          getDistanceScore(getFeatureCoordinates(a)!, center) -
          getDistanceScore(getFeatureCoordinates(b)!, center)
        );
      })[0] || null
  );
}

export function PrintModal() {
  const {
    size,
    frame,
    modalOpen,
    printSnapshot,
    defaultStep,
    defaultTitleEnabled,
    closeModal,
  } = useOrderStore();
  const { view, selection } = useMapStore();
  const [step, setStep] = useState<PreviewEditorStep>('labels');
  const [compositionMode, setCompositionMode] = useState<PreviewCompositionMode>('landscape-print');
  const [resetCropKey, setResetCropKey] = useState(0);
  const [colorSettings, setColorSettings] = useState<PreviewColorSettings>(MAP_DEFAULT_COLORS);
  const [labelSettings, setLabelSettings] = useState<PreviewLabelSettings>(DEFAULT_LABEL_SETTINGS);
  const fallbackTitleText = useMemo(
    () => getRecommendedTitleText(printSnapshot, selection, view.center),
    [printSnapshot, selection, view.center]
  );
  const [recommendedTitleText, setRecommendedTitleText] =
    useState<Pick<PreviewTitleSettings, 'title' | 'subtitle' | 'detail'>>(fallbackTitleText);
  const [titleSettings, setTitleSettings] = useState<PreviewTitleSettings>({
    enabled: false,
    title: '',
    subtitle: '',
    detail: '',
    layout: 'classic-bottom',
  });

  useEffect(() => {
    if (!modalOpen) return;
    setStep(defaultStep);
    setColorSettings(MAP_DEFAULT_COLORS);
    setLabelSettings(DEFAULT_LABEL_SETTINGS);
    setRecommendedTitleText(fallbackTitleText);
    setTitleSettings({
      enabled: defaultTitleEnabled,
      title: fallbackTitleText.title,
      subtitle: fallbackTitleText.subtitle,
      detail: fallbackTitleText.detail,
      layout: 'classic-bottom',
    });
  }, [defaultStep, defaultTitleEnabled, fallbackTitleText, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    const titleCenter = getBBoxCenter(printSnapshot?.bbox) || view.center;
    setRecommendedTitleText(fallbackTitleText);

    if (!printSnapshot?.bbox || !shouldFindVisiblePlaceTitle(printSnapshot, selection)) return;

    fetch('/api/print/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: printSnapshot.bbox,
        geometry: printSnapshot.geojson || selection?.geojson || null,
        towns: true,
      }),
    })
      .then((response) => response.json())
      .then((featureCollection: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        const feature = getBestTitleFeature(featureCollection, titleCenter);
        const coordinates = feature ? getFeatureCoordinates(feature) : null;

        if (!feature || !coordinates) {
          setRecommendedTitleText(fallbackTitleText);
          return;
        }

        setRecommendedTitleText({
          title: titleCase(getFeatureName(feature)),
          subtitle: getFeatureState(feature) || fallbackTitleText.subtitle,
          detail: formatCoordinatePair(coordinates),
        });
      })
      .catch(() => {
        if (!cancelled) setRecommendedTitleText(fallbackTitleText);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackTitleText, modalOpen, printSnapshot, selection?.geojson, view.center]);

  useEffect(() => {
    if (!modalOpen) return;
    setTitleSettings((settings) => ({
      ...settings,
      title: settings.enabled ? settings.title : recommendedTitleText.title,
      subtitle: settings.enabled ? settings.subtitle : recommendedTitleText.subtitle,
      detail: settings.enabled ? settings.detail : recommendedTitleText.detail,
    }));
  }, [modalOpen, recommendedTitleText]);

  const updateLabelSetting = <Key extends keyof PreviewLabelSettings>(
    key: Key,
    value: PreviewLabelSettings[Key]
  ) => {
    setLabelSettings((settings) => ({ ...settings, [key]: value }));
  };

  const updateCustomColorSetting = <Key extends keyof Pick<PreviewColorSettings, 'land' | 'water' | 'roads'>>(
    key: Key,
    value: PreviewColorSettings[Key]
  ) => {
    setColorSettings((settings) => ({ ...getEditableColorSettings(settings), [key]: value }));
  };

  const updateTitleSetting = <Key extends keyof PreviewTitleSettings>(
    key: Key,
    value: PreviewTitleSettings[Key]
  ) => {
    setTitleSettings((settings) => ({ ...settings, [key]: value }));
  };

  const applyRecommendedTitleText = () => {
    setTitleSettings((settings) => ({ ...settings, ...recommendedTitleText, enabled: true }));
  };

  return (
    <Modal
      open={modalOpen}
      onClose={closeModal}
      className="w-[min(1180px,calc(100vw-40px))] max-h-[90vh] p-0"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bg-bg p-8 lg:p-10">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <h2 className="font-display text-[32px] font-light leading-none">Customize Print</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                Build the print artwork here. Choose the crop, colors, and title treatment before
                moving into sizes, frames, and room mockups.
              </p>
            </div>
            <div className="hidden shrink-0 border border-border bg-panel px-4 py-3 text-center text-xs text-text-muted lg:block">
              <div className="font-medium text-text">
                {compositionMode === 'landscape-print' ? 'Landscape' : 'Portrait'}
              </div>
              <div>{titleSettings.enabled ? TITLE_LAYOUTS.find((option) => option.value === titleSettings.layout)?.label : 'Map Only'}</div>
            </div>
          </div>

          <PrintPreviewMap
            size={size}
            snapshot={printSnapshot}
            compositionMode={compositionMode}
            labelSettings={labelSettings}
            colorSettings={colorSettings}
            titleSettings={titleSettings}
            frame={frame}
            resetCropKey={resetCropKey}
          />
        </div>

        <div className="border-l border-border bg-panel p-8">
          <h3 className="mb-2 font-display text-2xl font-light">
            {step === 'design' ? 'Print Design' : 'Edit Preview'}
          </h3>
          <p className="mb-7 text-sm leading-relaxed text-text-muted">
            {step === 'design'
              ? 'Add title wording and pick a layout. Sizing and frame mockups come after this step.'
              : 'Adjust labels and crop here. Every change refreshes the preview on the left.'}
          </p>

          <div className="mb-7 grid grid-cols-3 gap-1.5">
            <StepButton active={step === 'labels'} label="Labels" onClick={() => setStep('labels')} />
            <StepButton active={step === 'colors'} label="Colors" onClick={() => setStep('colors')} />
            <StepButton active={step === 'design'} label="Design" onClick={() => setStep('design')} />
          </div>

          {printSnapshot && (
            <div className="mb-7 border border-border-light bg-bg p-3 text-xs leading-relaxed text-text-muted">
              Captured view: <span className="text-text">{printSnapshot.fullName}</span>
            </div>
          )}

          {step === 'labels' && (
            <>
              <OptionGroup label="Crop + Orientation">
                <div className="grid grid-cols-2 gap-2">
                  <OptionCard
                    selected={compositionMode === 'landscape-print'}
                    onClick={() => setCompositionMode('landscape-print')}
                    title="Landscape"
                    desc="Wide print"
                  />
                  <OptionCard
                    selected={compositionMode === 'portrait-print'}
                    onClick={() => setCompositionMode('portrait-print')}
                    title="Portrait"
                    desc="Tall print"
                  />
                </div>
                <div className="mt-3 border border-border-light bg-bg p-3 text-xs leading-relaxed text-text-muted">
                  Drag or scroll the preview map to crop. The selected orientation controls the print preview shape.
                  <button
                    onClick={() => setResetCropKey((key) => key + 1)}
                    className="mt-2 block text-[11px] uppercase tracking-[1px] text-text hover:text-text-muted"
                  >
                    Reset Crop
                  </button>
                </div>
              </OptionGroup>

              <OptionGroup label="Label Controls">
                <ToggleRow
                  label="City Labels"
                  description="Major city and capital names"
                  checked={labelSettings.cityLabels}
                  onChange={(checked) => updateLabelSetting('cityLabels', checked)}
                />
                <div className="mb-3">
                  <div className="mb-2 text-sm text-text">Town Labels</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['none', 'major', 'all'] as PreviewTownLabelMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => updateLabelSetting('townLabels', mode)}
                        className={`border px-2 py-2 text-xs capitalize transition-all ${
                          labelSettings.townLabels === mode ? 'border-text bg-bg text-text' : 'border-border text-text-muted'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleRow
                  label="Street Labels"
                  description="Street and road names only"
                  checked={labelSettings.streetLabels}
                  onChange={(checked) => updateLabelSetting('streetLabels', checked)}
                />
                <ToggleRow
                  label="Lake Labels"
                  description="Lake and waterbody names"
                  checked={labelSettings.lakeLabels}
                  onChange={(checked) => updateLabelSetting('lakeLabels', checked)}
                />
                <ToggleRow
                  label="River Labels"
                  description="River and waterway names"
                  checked={labelSettings.riverLabels}
                  onChange={(checked) => updateLabelSetting('riverLabels', checked)}
                />
                <ToggleRow
                  label="Region Labels"
                  description="State and country names"
                  checked={labelSettings.regionLabels}
                  onChange={(checked) => updateLabelSetting('regionLabels', checked)}
                />
              </OptionGroup>

              <Button variant="primary" className="w-full py-3.5" onClick={() => setStep('colors')}>
                Next: Colors
              </Button>
            </>
          )}

          {step === 'colors' && (
            <>
              <OptionGroup label="Map Color">
                <div className="grid gap-2">
                  {COLOR_SCHEMES.map((scheme) => (
                    <button
                      key={scheme.value}
                      onClick={() => setColorSettings(scheme.colors)}
                      className={`flex items-center gap-3 border p-3 text-left transition-all ${
                        sameColors(colorSettings, scheme.colors)
                          ? 'border-text bg-bg text-text'
                          : 'border-border bg-white/60 text-text-muted hover:border-text-muted'
                        }`}
                    >
                      <span
                        className="grid h-10 w-16 shrink-0 grid-cols-3 overflow-hidden border border-border-light"
                        style={{ backgroundColor: scheme.colors.land }}
                      >
                        <span style={{ backgroundColor: scheme.colors.land }} />
                        <span style={{ backgroundColor: scheme.colors.water }} />
                        <span style={{ backgroundColor: scheme.colors.roads }} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{scheme.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-text-light">{scheme.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </OptionGroup>

              <OptionGroup label="Choose Custom Color">
                <ColorField
                  label="Land"
                  value={getEditableColorSettings(colorSettings).land}
                  onChange={(value) => updateCustomColorSetting('land', value)}
                />
                <ColorField
                  label="Water"
                  value={getEditableColorSettings(colorSettings).water}
                  onChange={(value) => updateCustomColorSetting('water', value)}
                />
                <ColorField
                  label="Streets"
                  value={getEditableColorSettings(colorSettings).roads}
                  onChange={(value) => updateCustomColorSetting('roads', value)}
                />
                <div className="mt-2 border border-border-light bg-bg p-3 text-xs leading-relaxed text-text-muted">
                  Custom colors let you independently tune the land, streets, and water.
                </div>
              </OptionGroup>

              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1 py-3.5" onClick={() => setStep('labels')}>
                  Back
                </Button>
                <Button variant="primary" className="flex-1 py-3.5" onClick={() => setStep('design')}>
                  Next: Design
                </Button>
              </div>
            </>
          )}

          {step === 'design' && (
            <>
              <OptionGroup label="Print Orientation">
                <div className="grid grid-cols-2 gap-2">
                  <OptionCard
                    selected={compositionMode === 'landscape-print'}
                    onClick={() => setCompositionMode('landscape-print')}
                    title="Landscape"
                    desc="Wide artwork"
                  />
                  <OptionCard
                    selected={compositionMode === 'portrait-print'}
                    onClick={() => setCompositionMode('portrait-print')}
                    title="Portrait"
                    desc="Tall artwork"
                  />
                </div>
              </OptionGroup>

              <OptionGroup label="Title Block">
                <ToggleRow
                  label="Add Titles"
                  description="Add city, state, coordinates, or custom wording to the print"
                  checked={titleSettings.enabled}
                  onChange={(checked) => updateTitleSetting('enabled', checked)}
                />
                <div className="mb-3 border border-border-light bg-bg p-3 text-xs leading-relaxed text-text-muted">
                  Recommended for this view:{' '}
                  <span className="text-text">{recommendedTitleText.title || 'Finding best title...'}</span>
                  {recommendedTitleText.subtitle && (
                    <>
                      {' '}
                      / <span className="text-text">{recommendedTitleText.subtitle}</span>
                    </>
                  )}
                  <button
                    onClick={applyRecommendedTitleText}
                    disabled={!recommendedTitleText.title}
                    className="mt-2 block text-[11px] uppercase tracking-[1px] text-text hover:text-text-muted"
                  >
                    Use Recommendation
                  </button>
                </div>

                <TextField
                  label="Main Title"
                  value={titleSettings.title}
                  disabled={!titleSettings.enabled}
                  placeholder="Madison"
                  onChange={(value) => updateTitleSetting('title', value)}
                />
                <TextField
                  label="Subtitle"
                  value={titleSettings.subtitle}
                  disabled={!titleSettings.enabled}
                  placeholder="Wisconsin"
                  onChange={(value) => updateTitleSetting('subtitle', value)}
                />
                <TextField
                  label="Small Line"
                  value={titleSettings.detail}
                  disabled={!titleSettings.enabled}
                  placeholder="43.0748 N 89.3838 W"
                  onChange={(value) => updateTitleSetting('detail', value)}
                />
              </OptionGroup>

              <OptionGroup label="Title Layout">
                <div className="grid gap-2">
                  {TITLE_LAYOUTS.map((layout) => (
                    <LayoutCard
                      key={layout.value}
                      selected={titleSettings.layout === layout.value}
                      label={layout.label}
                      desc={layout.desc}
                      layout={layout.value}
                      colorSettings={colorSettings}
                      onClick={() => updateTitleSetting('layout', layout.value)}
                    />
                  ))}
                </div>
              </OptionGroup>

              <div className="mb-7 border border-border-light bg-bg p-3 text-xs leading-relaxed text-text-muted">
                Next we can add real sizing, frame mockups, and checkout. For now this step is focused on
                getting the actual print artwork right.
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1 py-3.5" onClick={() => setStep('colors')}>
                  Back
                </Button>
                <Button variant="primary" className="flex-1 py-3.5" onClick={closeModal}>
                  Keep Editing Map
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TextField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-2 block text-sm text-text">{label}</span>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-light focus:border-text disabled:cursor-not-allowed disabled:opacity-45"
      />
    </label>
  );
}

function LayoutCard({
  selected,
  label,
  desc,
  layout,
  colorSettings,
  onClick,
}: {
  selected: boolean;
  label: string;
  desc: string;
  layout: PreviewTitleLayout;
  colorSettings: PreviewColorSettings;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 border p-3 text-left transition-all ${
        selected ? 'border-text bg-bg text-text' : 'border-border bg-white/60 text-text-muted hover:border-text-muted'
      }`}
    >
      <span
        className="relative h-14 w-20 shrink-0 overflow-hidden border border-border-light"
        style={{ backgroundColor: colorSettings.land }}
      >
        <span
          className="absolute inset-x-2 top-2 h-5 rounded-sm"
          style={{ backgroundColor: colorSettings.water }}
        />
        {layout === 'classic-bottom' && (
          <span className="absolute inset-x-0 bottom-0 h-5 border-t" style={{ borderColor: colorSettings.water }}>
            <span className="mx-auto mt-1 block h-1 w-12" style={{ backgroundColor: colorSettings.water }} />
          </span>
        )}
        {layout === 'compact-bottom' && (
          <span className="absolute inset-x-2 bottom-2 h-3 border-t" style={{ borderColor: colorSettings.water }} />
        )}
        {layout === 'top-left' && (
          <span className="absolute left-2 top-2 h-5 w-9 border-l-2" style={{ borderColor: colorSettings.water }} />
        )}
        {layout === 'side-rail' && (
          <span className="absolute bottom-2 left-2 top-2 w-3 border-r" style={{ borderColor: colorSettings.water }} />
        )}
        {layout === 'minimal-corner' && (
          <span className="absolute bottom-2 right-2 h-3 w-8 border-t" style={{ borderColor: colorSettings.water }} />
        )}
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-text-light">{desc}</span>
      </span>
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mb-3 flex items-center justify-between gap-4 border border-border bg-white/60 p-3">
      <span>
        <span className="block text-sm text-text">{label}</span>
        <span className="mt-1 block font-mono text-xs uppercase text-text-light">{value}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-14 cursor-pointer border border-border bg-bg p-1"
      />
    </label>
  );
}

function StepButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`border px-2.5 py-2 text-[11px] uppercase tracking-[1px] transition-all ${
        active ? 'border-text bg-bg text-text' : 'border-border text-text-muted'
      }`}
    >
      {label}
    </button>
  );
}

function ToggleRow({
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
      className={`mb-3 flex w-full items-center justify-between gap-4 border p-3 text-left transition-all ${
        checked ? 'border-text bg-bg text-text' : 'border-border bg-white/60 text-text-muted'
      }`}
    >
      <span>
        <span className="block text-sm">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-text-light">{description}</span>
      </span>
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

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <div className="text-[11px] font-medium tracking-[1.5px] uppercase text-text-muted mb-3">
        {label}
      </div>
      {children}
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3.5 border-[1.5px] cursor-pointer transition-all text-center ${
        selected ? 'border-text bg-bg' : 'border-border hover:border-text-muted'
      }`}
    >
      <div className="text-sm font-medium mb-0.5">{title}</div>
      <div className="text-xs text-text-muted">{desc}</div>
    </button>
  );
}
