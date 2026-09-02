'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PrintScene } from '@/lib/print/scene';
import {
  applyPalette,
  reframe,
  resetFraming,
  sceneDensity,
  minimumStateRadius,
} from '@/lib/print/scene';
import { getLayout } from '@/lib/print/layouts';
import { PALETTES, getPalette, type Palette } from '@/lib/print/palettes';
import { PaletteSwatch } from '@/components/Studio/DesignSwatch';
import {
  formatRadius,
  framingPresets,
  radiusFromSlider,
  sliderFromRadius,
} from '@/lib/print/framing';
import { ORIENTATIONS, type Orientation } from '@/lib/print/orientation';
import {
  SLOT_OPTIONS,
  titleFontSamples,
  rectForSlot,
  type TitleAlign,
  type TitlePanel,
  type TitleSlot,
  type TitleFont,
} from '@/lib/print/title';
import { checkPalette, makePrintable } from '@/lib/print/contrast';
import { applyStyleRecipe, styleRecipesFor, type StyleRecipe } from '@/lib/print/recipes';
import type { DetailBias } from '@/lib/print/density';
import { trackDemoEvent } from '@/lib/demoAnalytics';
import {
  applyRegionTheme,
  REGION_THEMES,
  type RegionTheme,
} from '@/lib/print/regionDesign';

export type Move = 'view' | 'style' | 'title';

interface StudioDockProps {
  scene: PrintScene;
  update: (next: PrintScene | ((current: PrintScene) => PrintScene), label?: string) => void;
  active: Move | null;
  onActiveChange: (move: Move | null) => void;
  onHeightChange?: (height: number) => void;
  suggestions?: Palette[];
  waterAvailable?: boolean;
  /** Current art direction / colorway, shown on the "Change design" chip. */
  designLabel?: string;
  onOpenDesign?: () => void;
}

export const MOVES: Array<{ id: Move; label: string; question: string }> = [
  { id: 'view', label: 'Composition', question: 'Frame the place and choose how much map the print carries.' },
  { id: 'title', label: 'Title', question: 'Show or hide the map title and choose its lettering.' },
  { id: 'style', label: 'Design', question: 'Change the map style and colors.' },
];

/**
 * The two primary moves. The design itself is chosen on the product page;
 * changing it here is the secondary "Change design" action, not a main tab —
 * the editor must never re-ask a question the storefront already asked.
 */
export const PRIMARY_MOVES = MOVES.filter((move) => move.id !== 'style');

const PANELS: Array<{ value: TitlePanel; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'none', label: 'Transparent' },
];

const DETAIL_OPTIONS: Array<{ value: DetailBias; label: string }> = [
  { value: -1, label: 'Clean' },
  { value: 0, label: 'Detailed' },
  { value: 1, label: 'More detailed' },
];

export function MoveTabs({
  active,
  onActiveChange,
  variant = 'floating',
}: {
  active: Move | null;
  onActiveChange: (move: Move | null) => void;
  variant?: 'floating' | 'rail';
}) {
  const rail = variant === 'rail';
  return (
    <nav
      className={rail
        ? 'grid grid-cols-2 gap-1 rounded-sm border border-[#d8d9d3] bg-white p-1'
        : 'pointer-events-auto flex gap-1 rounded-full border border-white/15 bg-[#14201d]/94 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur'}
      aria-label="Design controls"
    >
      {PRIMARY_MOVES.map((move) => {
        const selected = active === move.id;
        return (
          <button
            key={move.id}
            type="button"
            aria-expanded={selected}
            onClick={() => onActiveChange(selected && !rail ? null : move.id)}
            className={rail
              ? `rounded-sm px-2 py-2 text-[12px] transition-colors ${
                  selected ? 'bg-[#173f35] text-white' : 'text-[#44504b] hover:bg-[#eef1ed]'
                }`
              : `rounded-full px-6 py-2.5 text-[13px] transition-colors ${
                  selected ? 'bg-[#f7f4eb] text-[#14201d]' : 'text-[#dce2dd]/75 hover:bg-white/10 hover:text-white'
                }`}
          >
            {move.label}
          </button>
        );
      })}
    </nav>
  );
}

export function StudioPanels({
  scene,
  update,
  active,
  suggestions,
  waterAvailable,
}: {
  scene: PrintScene;
  update: StudioDockProps['update'];
  active: Move;
  suggestions?: Palette[];
  waterAvailable?: boolean;
}) {
  if (active === 'view') {
    return <ViewPanel scene={scene} update={update} />;
  }
  if (active === 'style') {
    return (
      <StylePanel
        scene={scene}
        update={update}
        suggestions={suggestions}
        waterAvailable={waterAvailable}
      />
    );
  }
  return <TitlePanel scene={scene} update={update} />;
}

export function StudioDock({
  scene,
  update,
  active,
  onActiveChange,
  onHeightChange,
  suggestions,
  waterAvailable,
  designLabel,
  onOpenDesign,
}: StudioDockProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || !onHeightChange) return;
    const report = () => onHeightChange(element.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, active]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center">
      {active && (
        <div className="pointer-events-auto w-full max-w-[760px] px-3">
          <div
            className="studio-dock-panel overflow-y-auto overscroll-contain"
            style={{ maxHeight: active === 'title' ? '48dvh' : '42dvh' }}
          >
            <StudioPanels
              scene={scene}
              update={update}
              active={active}
              suggestions={suggestions}
              waterAvailable={waterAvailable}
            />
          </div>
        </div>
      )}
      <div className="mb-3 mt-2 flex flex-col items-center gap-2">
        {designLabel && onOpenDesign && (
          <button
            type="button"
            onClick={onOpenDesign}
            className="pointer-events-auto rounded-full border border-white/20 bg-[#14201d]/92 px-3.5 py-1.5 text-[11px] text-[#dce2dd]/85 backdrop-blur transition-colors hover:border-white/45 hover:text-white"
          >
            {designLabel} <span className="opacity-55">· Change design</span>
          </button>
        )}
        <MoveTabs active={active} onActiveChange={onActiveChange} />
      </div>
    </div>
  );
}

function ViewPanel({ scene, update }: PanelProps) {
  const isState = scene.place.kind === 'state';
  const stateMinimum = isState ? minimumStateRadius(scene) : 0;
  const presets = isState
    ? [
        { miles: stateMinimum, label: formatRadius(stateMinimum), name: 'Larger state' },
        { miles: stateMinimum * 1.55, label: formatRadius(stateMinimum * 1.55), name: 'More space' },
      ]
    : framingPresets(scene.place.placeRadiusMiles, scene.place.kind);
  const sliderId = useId();
  const density = sceneDensity(scene);
  const detailPromise = scene.place.kind === 'city'
    ? density.everyStreet
      ? 'Every street will remain clear at the selected print size.'
      : density.description.replace('Showing ', '') + ' will remain clear in print.'
    : scene.place.kind === 'state'
      ? scene.region.theme === 'atlas'
        ? scene.detailBias === -1
          ? 'Highways only.'
          : scene.detailBias === 1
          ? 'Highways, main roads, and secondary routes.'
            : 'Highways and main roads.'
        : scene.detailBias === -1
          ? 'Quiet elevation relief with major waterways and open water.'
          : scene.detailBias === 1
            ? 'Stronger relief with the most complete available river and lake detail.'
            : 'Balanced elevation with rivers, lakes, and open water.'
      : density.description.replace('Showing ', '') + ' will remain clear in print.';

  return (
    <div className="grid gap-5">
      <div className="rounded-sm border border-[#dfc8b9] bg-[#fbf4ef] px-4 py-3 text-[11px] leading-5 text-[#754b36]">
        {isState
          ? 'The complete state stays centered and print-safe. Use the slider to change its scale.'
          : 'Drag or zoom the map directly, or start from a preset. The print follows exactly.'}
      </div>
      <Field
        label={isState ? 'Zoom' : 'Framing'}
        help={isState ? 'Make the state larger or add more breathing room.' : 'Pick a starting point, then drag or zoom the map directly.'}
      >
        {!isState && <div className="grid grid-cols-3 gap-2">
          {presets.map((preset) => {
            const selected = !scene.freeViewport
              && Math.abs(scene.radiusMiles - preset.miles) < preset.miles * 0.02;
            return (
              <Choice
                key={preset.miles}
                active={selected}
                onClick={() => update((current) => reframe(current, preset.miles), 'radius')}
              >
                <span className="block text-[12px] font-medium">{preset.name}</span>
                <span className="mt-0.5 block text-[10px] opacity-55">{preset.label}</span>
              </Choice>
            );
          })}
        </div>}
        <div className={`${isState ? '' : 'mt-3'} flex items-center gap-3`}>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={sliderFromRadius(scene.radiusMiles, presets)}
            onChange={(event) => {
              const miles = radiusFromSlider(Number(event.target.value), presets);
              update((current) => reframe(current, miles), 'radius');
            }}
            className="studio-range flex-1"
            aria-label={isState ? 'State zoom' : 'Fine-tune framing'}
          />
          <span className="w-[58px] text-right text-[12px] tabular-nums text-[#68726c]">
            {formatRadius(scene.radiusMiles)}
          </span>
        </div>
        {isState && (
          <div className="mt-1 flex justify-between text-[10px] text-[#7b837e]">
            <span>Larger state</span>
            <span>More breathing room</span>
          </div>
        )}
      </Field>

      <Field label="Shape">
        <div className="flex gap-2">
          <div className="grid flex-1 grid-cols-3 gap-2">
            {ORIENTATIONS.map((orientation: Orientation) => (
              <Choice
                key={orientation}
                active={scene.orientation === orientation}
                onClick={() => update((current) => ({ ...current, orientation }), 'orientation')}
              >
                <span
                  className={`mx-auto mb-1.5 block border border-current ${
                    orientation === 'portrait'
                      ? 'h-6 w-[18px]'
                      : orientation === 'landscape'
                        ? 'h-[18px] w-6'
                        : 'h-5 w-5'
                  }`}
                />
                <span className="block text-[11px] capitalize">{orientation}</span>
              </Choice>
            ))}
          </div>
          {!isState && <button
            type="button"
            onClick={() => update((current) => resetFraming(current), 'reset')}
            className="studio-ghost-button px-4"
          >
            Reset view
          </button>}
        </div>
      </Field>

      {scene.place.kind === 'city' ? (
        <div className="rounded-sm border border-[#cad4cd] bg-[#eef3ef] px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#173f35]">
            Complete street network
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[#44504b]">
            Every available city street is always included. Styles change the linework, never remove it.
          </p>
        </div>
      ) : (
        <Field label="Map detail" help={isState ? 'Choose how much linework the print carries.' : 'The studio caps density before roads or labels can turn into a blur.'}>
          <Segmented
            options={DETAIL_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            value={String(scene.detailBias)}
            onChange={(value) => {
              const detailBias = Number(value) as DetailBias;
              update((current) => ({ ...current, detailBias }), 'detail-bias');
              trackDemoEvent('region_detail_changed', {
                place: scene.place.slug,
                theme: scene.region.theme,
                level: detailBias,
              });
            }}
          />
          <p className="mt-2 text-[12px] leading-5 text-[#44504b]">{capitalize(detailPromise)}</p>
        </Field>
      )}

    </div>
  );
}

function StylePanel({
  scene,
  update,
  suggestions,
  waterAvailable,
}: PanelProps & { suggestions?: Palette[]; waterAvailable?: boolean }) {
  if (scene.place.kind === 'state') {
    return <StateStylePanel scene={scene} update={update} />;
  }
  return <GenericStylePanel scene={scene} update={update} suggestions={suggestions} waterAvailable={waterAvailable} />;
}

function GenericStylePanel({
  scene,
  update,
  suggestions,
  waterAvailable,
}: PanelProps & { suggestions?: Palette[]; waterAvailable?: boolean }) {
  const [mode, setMode] = useState<'looks' | 'colors'>('looks');
  const palette = scene.paletteId === 'custom' ? null : getPalette(scene.paletteId);
  const availableRecipes = styleRecipesFor(scene.place.kind, waterAvailable);
  const selectedRecipe = availableRecipes.find((recipe) => {
    if (recipe.layoutId !== scene.layoutId || recipe.paletteId !== scene.paletteId) return false;
    const layout = getLayout(recipe.layoutId);
    return scene.title.enabled === layout.titleEnabled
      && scene.title.slot === layout.titleSlot
      && scene.title.panel === layout.titlePanel
      && scene.title.align === layout.align;
  });
  const activeLayout = getLayout(scene.layoutId);
  const onWaterUnavailable = activeLayout.autoPlace === 'water'
    && scene.title.autoPlaced
    && !scene.title.onWater;
  const suggestedPaletteIds = new Set(suggestions?.map((option) => option.id) ?? []);

  function chooseRecipe(recipe: StyleRecipe) {
    update((current) => applyStyleRecipe(current, recipe), `recipe-${recipe.id}`);
  }

  function surprise() {
    const available = availableRecipes.filter((recipe) => recipe.id !== selectedRecipe?.id);
    chooseRecipe(available[Math.floor(Math.random() * available.length)] ?? availableRecipes[0]);
  }

  if (mode === 'looks') {
    return (
      <div className="grid gap-4" data-testid="style-picker">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-medium text-[#14201d]">Pick a direction</h3>
            <p className="mt-1 max-w-[34rem] text-[12px] leading-5 text-[#68726c]">
              Start with a complete, print-tested look. You can change its colors next.
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={surprise}
              className="rounded-full border border-[#cdd2cc] px-2.5 py-1.5 text-[10px] text-[#173f35] transition-colors hover:border-[#173f35]"
            >
              Surprise me
            </button>
            <button
              type="button"
              onClick={() => setMode('colors')}
              className="rounded-full bg-[#173f35] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[#0f2f27]"
            >
              Colors →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {availableRecipes.map((recipe) => {
            const selected = recipe.id === selectedRecipe?.id;
            const recommended = suggestedPaletteIds.has(recipe.paletteId);
            return (
              <button
                key={recipe.id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseRecipe(recipe)}
                className={`group overflow-hidden rounded-sm border text-left transition-all ${
                  selected
                    ? 'border-[#173f35] bg-[#eef1ed] shadow-[0_0_0_1px_#173f35]'
                    : 'border-[#d8d9d3] bg-white hover:-translate-y-0.5 hover:border-[#849587] hover:shadow-[0_8px_24px_rgba(20,32,29,0.1)]'
                }`}
              >
                <RecipeSwatch recipe={recipe} />
                <span className="block px-3 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">{recipe.name}</span>
                    {recommended && (
                      <span className="rounded-full bg-[#dfe8e2] px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[#173f35]">
                        Suits this map
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[#68726c]">
                    {recipe.blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {onWaterUnavailable && (
          <p className="text-[12px] leading-5 text-[#8a5a3f]">
            No open water is large enough in this frame, so the title moved to a safe corner.
          </p>
        )}

      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="color-picker">
      <div>
        <button
          type="button"
          onClick={() => setMode('looks')}
          className="text-[11px] text-[#68726c] underline underline-offset-4 hover:text-[#173f35]"
        >
          ← Style directions
        </button>
        <h3 className="mt-2 text-[16px] font-medium text-[#14201d]">Choose a colorway</h3>
        <p className="mt-1 text-[12px] leading-5 text-[#68726c]">
          The composition stays exactly where you put it. Only the ink and paper change.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PALETTES.map((option) => (
          <PaletteButton
            key={option.id}
            palette={option}
            active={scene.paletteId === option.id}
            onClick={() => update((current) => applyPalette(current, option), `palette-${option.id}`)}
          />
        ))}
      </div>

      <details className="group border-t border-[#e0ddd4] pt-2">
        <summary className="cursor-pointer list-none text-[12px] text-[#68726c] underline underline-offset-4">
          Custom colors and accents
        </summary>
        <div className="mt-4 grid gap-5">
          {palette && (
            <Field label="Street accent">
              <div className="flex flex-wrap gap-2">
                {palette.accents.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    aria-label={`Use ${accent} for streets`}
                    aria-pressed={scene.colors.roads.toLowerCase() === accent.toLowerCase()}
                    onClick={() => update((current) => ({
                      ...current,
                      colors: {
                        ...current.colors,
                        roads: makePrintable(accent, current.colors.land),
                      },
                    }), 'accent')}
                    className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 ${
                      scene.colors.roads.toLowerCase() === accent.toLowerCase()
                        ? 'border-[#173f35]'
                        : 'border-transparent shadow-[0_0_0_1px_rgba(20,32,29,0.18)]'
                    }`}
                    style={{ backgroundColor: accent }}
                  />
                ))}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-3 gap-2">
            <ColorField
              label="Paper"
              value={scene.colors.land}
              onChange={(land) => update((current) => ({
                ...current,
                paletteId: 'custom',
                colors: {
                  land,
                  water: makePrintable(current.colors.water, land),
                  roads: makePrintable(current.colors.roads, land),
                },
              }), 'color-paper')}
            />
            <ColorField
              label="Water"
              value={scene.colors.water}
              onChange={(water) => update((current) => ({
                ...current,
                paletteId: 'custom',
                colors: {
                  ...current.colors,
                  water: makePrintable(water, current.colors.land),
                },
              }), 'color-water')}
            />
            <ColorField
              label="Streets"
              value={scene.colors.roads}
              onChange={(roads) => update((current) => ({
                ...current,
                paletteId: 'custom',
                colors: {
                  ...current.colors,
                  roads: makePrintable(roads, current.colors.land),
                },
              }), 'color-roads')}
            />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-[#68726c]">
            Colors are automatically nudged to the nearest print-safe value when necessary.
          </p>
          {checkPalette(scene.colors).verdict !== 'good' && (
            <p className="mt-2 text-[11px] leading-4 text-[#8f2a21]">
              This restored design needs a color adjustment before it can be printed.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

/** Two edition choices. Map density lives only in Composition. */
function StateStylePanel({ scene, update }: PanelProps) {
  const design = scene.region;

  function chooseTheme(theme: RegionTheme) {
    update((current) => {
      const themeMeta = REGION_THEMES.find((entry) => entry.id === theme)!;
      const colored = applyPalette(current, getPalette(themeMeta.palette));
      return {
        ...colored,
        region: applyRegionTheme(current.region, theme),
        title: { ...colored.title, enabled: true, font: themeMeta.font },
        updatedAt: Date.now(),
      };
    }, `region-${theme}`);
    trackDemoEvent('region_theme_selected', { place: scene.place.slug, theme });
  }

  const curatedPalettes = ['bone', 'terracotta', 'forest', 'blueprint', 'slate', 'midnight'].map(getPalette);

  return (
    <div className="grid gap-5">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#a35b3f]">
          {scene.place.kind === 'country' ? 'Country edition' : 'State edition'}
        </div>
        <h3 className="mt-1 font-display text-[28px] font-light leading-none">Choose the map</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {REGION_THEMES.map((theme) => {
          const selected = design.theme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={selected}
              onClick={() => chooseTheme(theme.id)}
              className={`rounded-sm border p-3 text-left transition-all ${selected ? 'border-[#173f35] bg-[#eaf0ec] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d8d9d3] bg-white hover:-translate-y-0.5 hover:border-[#849587]'}`}
            >
              <span className="block text-[13px] font-medium">{theme.name}</span>
              <span className="mt-1 block text-[10px] leading-4 text-[#68726c]">{theme.blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-sm border border-[#cad4cd] bg-[#eef3ef] px-4 py-3 text-[11px] leading-5 text-[#44504b]">
        Use <strong>Composition → Map detail</strong> to change road density in
        Atlas, or relief and water detail in Topographic.
      </div>

      <Field label="Paper and ink" help="Curated pairings keep fine linework printable.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {curatedPalettes.map((palette) => (
            <PaletteButton
              key={palette.id}
              palette={palette}
              active={scene.paletteId === palette.id}
              onClick={() => update((current) => applyPalette(current, palette), `palette-${palette.id}`)}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

function TitlePanel({ scene, update }: PanelProps) {
  const title = scene.title;

  function setTitle(patch: Partial<PrintScene['title']>, label: string) {
    update((current) => ({
      ...current,
      title: { ...current.title, ...patch },
    }), label);
  }

  function chooseSlot(slot: TitleSlot, align: TitleAlign) {
    const rect = rectForSlot(slot);
    setTitle({
      slot,
      align,
      autoPlaced: false,
      onWater: false,
      ...(slot === 'free' ? {} : rect),
    }, 'title-placement');
  }

  const titleBackdrop = title.panel === 'none'
    ? title.onWater ? scene.colors.water : scene.colors.land
    : title.panelColor || (title.onWater ? scene.colors.water : scene.colors.land);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-4">
        <Toggle
          label="Show a title"
          active={title.enabled}
          onChange={() => setTitle({ enabled: !title.enabled }, 'title-enabled')}
        />
        <p className="max-w-[190px] text-right text-[11px] leading-4 text-[#68726c]">
          Drag the title on the print. It snaps into print-safe positions.
        </p>
      </div>

      {title.enabled && (
        <>
          <Field label="Title lettering">
            <div className="grid grid-cols-2 gap-2">
              {titleFontSamples(title.text || scene.place.name).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={title.font === option.value}
                  onClick={() => setTitle({ font: option.value }, 'title-font')}
                  className={`rounded-sm border px-3 py-3 text-left transition-colors ${title.font === option.value ? 'border-[#173f35] bg-[#eaf0ec]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'}`}
                >
                  <span
                    className="block truncate text-[20px] leading-none"
                    style={{
                      fontFamily: option.value === 'hand'
                        ? 'var(--font-hand), cursive'
                        : option.value === 'condensed'
                          ? 'var(--font-condensed), sans-serif'
                          : option.value === 'modern'
                            ? 'var(--font-body), sans-serif'
                            : 'var(--font-display), serif',
                      textTransform: option.value === 'condensed' || option.value === 'modern' ? 'uppercase' : undefined,
                    }}
                  >
                    {option.sample}
                  </span>
                  <span className="mt-2 block text-[9px] uppercase tracking-[0.12em] text-[#68726c]">{option.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <details className="group border-t border-[#e0ddd4] pt-4">
            <summary className="cursor-pointer list-none text-[12px] text-[#68726c] underline underline-offset-4">
              Advanced title placement
            </summary>
            <div className="mt-4 grid gap-4">
              <Field label="Snap position">
                <div className="grid grid-cols-3 gap-2">
                  {SLOT_OPTIONS.map((option) => (
                    <Choice
                      key={option.slot}
                      active={title.slot === option.slot}
                      onClick={() => chooseSlot(option.slot, option.align)}
                    >
                      <span className="block text-[11px]">{option.label}</span>
                    </Choice>
                  ))}
                </div>
                {title.slot === 'free' && (
                  <p className="mt-2 text-[11px] text-[#68726c]">
                    Custom position. Pick a snap position to return to a designed layout.
                  </p>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Backing">
                  <Segmented
                    options={PANELS.map((panel) => ({ value: panel.value, label: panel.label }))}
                    value={title.panel}
                    onChange={(value) => setTitle({ panel: value as TitlePanel }, 'title-panel')}
                  />
                </Field>
                <Field label="Title color">
                  <ColorField
                    label="Ink"
                    value={title.textColor ?? makePrintable(scene.colors.roads, titleBackdrop)}
                    onChange={(textColor) => setTitle({
                      textColor: makePrintable(textColor, titleBackdrop),
                    }, 'title-color')}
                  />
                </Field>
              </div>
            </div>
          </details>
        </>
      )}

    </div>
  );
}

interface PanelProps {
  scene: PrintScene;
  update: StudioDockProps['update'];
}

function RecipeSwatch({ recipe }: { recipe: StyleRecipe }) {
  const palette = getPalette(recipe.paletteId);
  const layout = getLayout(recipe.layoutId);
  const footer = layout.titleSlot === 'footer' || layout.titleSlot === 'footer-tall';
  return (
    <span
      className="relative block aspect-[2/1] w-full overflow-hidden border-b border-black/10"
      style={{ backgroundColor: palette.colors.land }}
      aria-hidden
    >
      <span className="absolute -bottom-[25%] -right-[8%] h-[70%] w-[62%] rounded-[50%]" style={{ backgroundColor: palette.colors.water }} />
      {[18, 36, 55, 74].map((top, index) => (
        <span
          key={`horizontal-${top}`}
          className="absolute left-[-8%] h-px w-[116%]"
          style={{ top: `${top}%`, backgroundColor: palette.colors.roads, transform: `rotate(${index % 2 ? 5 : -6}deg)`, opacity: 0.78 }}
        />
      ))}
      {[19, 39, 61, 82].map((left, index) => (
        <span
          key={`vertical-${left}`}
          className="absolute top-[-12%] h-[124%] w-px"
          style={{ left: `${left}%`, backgroundColor: palette.colors.roads, transform: `rotate(${index % 2 ? -5 : 7}deg)`, opacity: 0.72 }}
        />
      ))}
      {layout.titleEnabled && (
        <span
          className={`absolute ${
            footer
              ? `inset-x-0 bottom-0 ${layout.titleSlot === 'footer-tall' ? 'h-[29%]' : 'h-[20%]'}`
              : layout.autoPlace === 'water'
                ? 'bottom-[17%] right-[9%] h-[12%] w-[45%] border border-white/60 bg-white/15'
                : 'left-[7%] top-[8%] h-[20%] w-[48%] border border-black/10'
          }`}
          style={{ backgroundColor: footer || !layout.autoPlace ? palette.colors.land : undefined }}
        >
          <span
            className="absolute left-[12%] right-[12%] top-[42%] h-px"
            style={{ backgroundColor: layout.autoPlace ? palette.colors.land : palette.colors.roads }}
          />
        </span>
      )}
    </span>
  );
}

function PaletteButton({
  palette,
  active,
  onClick,
}: {
  palette: Palette;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={`${palette.name} — ${palette.blurb}`}
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2.5 rounded-sm border p-2 text-left transition-colors ${
        active
          ? 'border-[#173f35] bg-[#eef1ed]'
          : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
      }`}
    >
      <PaletteSwatch palette={palette} width={38} />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium leading-4">{palette.name}</span>
        <span className="block truncate text-[9px] leading-4 text-[#68726c]">{palette.blurb}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-[12px] font-medium text-[#14201d]">{label}</h3>
        {help && <p className="mt-0.5 text-[11px] leading-4 text-[#7b837e]">{help}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-sm border px-2 py-2 text-center transition-colors ${
        active
          ? 'border-[#173f35] bg-[#173f35] text-white'
          : 'border-[#d8d9d3] bg-white text-[#44504b] hover:border-[#849587]'
      }`}
    >
      {children}
    </button>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-[#d8d9d3]">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 px-2 py-2 text-[10px] transition-colors ${
            index > 0 ? 'border-l border-[#d8d9d3]' : ''
          } ${
            value === option.value
              ? 'bg-[#173f35] text-white'
              : 'bg-white text-[#66706a] hover:bg-[#eef1ed]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onChange}
      className="flex items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-[11px] text-[#44504b] hover:bg-[#eef1ed]"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${active ? 'bg-[#173f35]' : 'bg-[#cfd3cf]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${active ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
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
    <label className="flex items-center gap-2 rounded-sm border border-[#d8d9d3] bg-white p-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0"
      />
      <span className="min-w-0">
        <span className="block text-[9px] uppercase tracking-[0.1em] text-[#7b837e]">{label}</span>
        <span className="block truncate text-[10px] uppercase text-[#44504b]">{value}</span>
      </span>
    </label>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
