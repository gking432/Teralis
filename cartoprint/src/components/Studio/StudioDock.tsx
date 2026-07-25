'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PrintScene } from '@/lib/print/scene';
import { applyLook, reframe, resetFraming } from '@/lib/print/scene';
import { LOOKS, getLook, type Look } from '@/lib/print/looks';
import { LookSwatch } from '@/components/Studio/LookSwatch';
import {
  formatRadius,
  framingPresets,
  radiusFromSlider,
  sliderFromRadius,
} from '@/lib/print/framing';
import { ORIENTATIONS, type Orientation } from '@/lib/print/orientation';
import { SLOT_OPTIONS, type TitlePanel, type TitleSlot } from '@/lib/print/title';
import { checkPalette, makePrintable } from '@/lib/print/contrast';
import { sceneDensity } from '@/lib/print/scene';
import { smallestSizeForEveryStreet, smallestSizeForEveryTown, type DetailBias } from '@/lib/print/density';
import { SIZE_CATALOG, SIZE_LABELS, type SizeLabel } from '@/lib/print/sizeCatalog';
import type { BorderWeight, PrintDetailSettings } from '@/lib/print/printRender';

/**
 * Three moves: Frame, Look, Words.
 *
 * The previous panel had two always-open sections, a four-tab bar, two nested
 * <details> disclosures, and orientation buried three levels deep — with no
 * principle for what lived where. Everything here is grouped by the question
 * the user is actually asking, and every advanced control sits behind exactly
 * one "Fine tune" disclosure.
 *
 * The dock overlays the artwork rather than sitting beside it, so the print
 * stays the largest thing on screen at every viewport size.
 */

export type Move = 'frame' | 'look' | 'words';

interface StudioDockProps {
  scene: PrintScene;
  update: (next: PrintScene | ((current: PrintScene) => PrintScene), label?: string) => void;
  active: Move | null;
  onActiveChange: (move: Move | null) => void;
  /** Reports the dock's height so the stage can keep the whole print visible. */
  onHeightChange?: (height: number) => void;
  /** Three suggested starting points, shown until the user makes a choice. */
  suggestions?: Look[];
}

const MOVES: Array<{ id: Move; label: string; hint: string }> = [
  { id: 'frame', label: 'Frame', hint: 'What the map shows' },
  { id: 'look', label: 'Look', hint: 'How it is drawn' },
  { id: 'words', label: 'Words', hint: 'What it says' },
];

const BORDERS: Array<{ value: BorderWeight; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Medium' },
  { value: 'thick', label: 'Wide' },
];

const WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 0.75, label: 'Fine' },
  { value: 1, label: 'Normal' },
  { value: 1.35, label: 'Bold' },
];

const DETAIL_BIASES: Array<{ value: DetailBias; label: string }> = [
  { value: -1, label: 'Cleaner' },
  { value: 0, label: 'Balanced' },
  { value: 1, label: 'Maximum' },
];

const PANELS: Array<{ value: TitlePanel; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'glass', label: 'Glass' },
  { value: 'none', label: 'None' },
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
        ? 'grid grid-cols-3 gap-1 rounded-sm border border-[#d8d9d3] bg-white p-1'
        : 'pointer-events-auto flex gap-1 rounded-full border border-white/15 bg-[#14201d]/92 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur'}
      aria-label="Design controls"
    >
      {MOVES.map((move) => {
        const isActive = active === move.id;
        return (
          <button
            key={move.id}
            type="button"
            aria-expanded={isActive}
            // In the rail a move is always open, so tapping the active tab must
            // not collapse it into an empty column.
            onClick={() => onActiveChange(isActive && !rail ? null : move.id)}
            className={rail
              ? `rounded-sm px-3 py-2 text-[13px] transition-colors ${
                  isActive ? 'bg-[#173f35] text-white' : 'text-[#44504b] hover:bg-[#eef1ed]'
                }`
              : `rounded-full px-6 py-2.5 text-[13px] transition-colors ${
                  isActive ? 'bg-[#f7f4eb] text-[#14201d]' : 'text-[#dce2dd]/75 hover:bg-white/10 hover:text-white'
                }`}
          >
            {move.label}
          </button>
        );
      })}
    </nav>
  );
}

export function StudioPanels({ scene, update, active, suggestions }: {
  scene: PrintScene;
  update: StudioDockProps['update'];
  active: Move;
  suggestions?: Look[];
}) {
  return (
    <>
      {active === 'frame' && <FramePanel scene={scene} update={update} />}
      {active === 'look' && <LookPanel scene={scene} update={update} suggestions={suggestions} />}
      {active === 'words' && <WordsPanel scene={scene} update={update} />}
    </>
  );
}

/** Mobile presentation: a bottom sheet floating over the artwork. */
export function StudioDock({ scene, update, active, onActiveChange, onHeightChange, suggestions }: StudioDockProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // The artwork must never be hidden behind the controls, so the stage needs
  // to know how much room the dock is taking at any moment.
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
        <div className="pointer-events-auto w-full max-w-[860px] px-3">
          <div className="studio-dock-panel">
            <StudioPanels scene={scene} update={update} active={active} suggestions={suggestions} />
          </div>
        </div>
      )}

      <div className="mb-3 mt-2">
        <MoveTabs active={active} onActiveChange={onActiveChange} />
      </div>
    </div>
  );
}

// --- Frame ------------------------------------------------------------------

function FramePanel({ scene, update }: { scene: PrintScene; update: StudioDockProps['update'] }) {
  const presets = framingPresets(scene.place.placeRadiusMiles);
  const sliderId = useId();

  return (
    <div className="grid gap-5">
      <Field
        label="How much ground"
        help="Measured as a real radius, so it means the same thing in every city."
      >
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => {
            const isActive = !scene.freeViewport
              && Math.abs(scene.radiusMiles - preset.miles) < preset.miles * 0.02;
            return (
              <Choice
                key={preset.miles}
                active={isActive}
                onClick={() => update((current) => reframe(current, preset.miles), 'radius')}
              >
                <span className="block text-[13px]">{preset.label}</span>
                <span className="mt-0.5 block text-[11px] opacity-60">{preset.name}</span>
              </Choice>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-3">
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
            aria-label="Framing radius"
          />
          <span className="w-[68px] text-right text-[13px] tabular-nums">
            {formatRadius(scene.radiusMiles)}
          </span>
        </div>
      </Field>

      <Field label="Shape">
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-3 gap-2">
            {ORIENTATIONS.map((option: Orientation) => (
              <Choice
                key={option}
                active={scene.orientation === option}
                onClick={() => update((current) => ({ ...current, orientation: option }), 'orientation')}
              >
                <span
                  className={`mx-auto mb-1.5 block border border-current ${
                    option === 'portrait' ? 'h-6 w-[18px]' : option === 'landscape' ? 'h-[18px] w-6' : 'h-5 w-5'
                  }`}
                />
                <span className="block text-[12px] capitalize">{option}</span>
              </Choice>
            ))}
          </div>
          <button
            type="button"
            onClick={() => update((current) => resetFraming(current), 'reset')}
            className="studio-ghost-button self-stretch px-4"
          >
            Recenter
          </button>
        </div>
      </Field>

      <Field
        label="Print size"
        help="Bigger paper holds more detail for the same piece of ground, so this changes the artwork — not just the price."
      >
        <div className="grid grid-cols-4 gap-2">
          {SIZE_LABELS.map((size) => {
            const option = SIZE_CATALOG[scene.orientation][size];
            return (
              <Choice
                key={size}
                active={scene.size === size}
                onClick={() => update((current) => ({ ...current, size }), 'size')}
              >
                <span className="block text-[12px] capitalize">{option.displayLabel}</span>
                <span className="mt-0.5 block text-[11px] opacity-60">{option.dimensionStr}</span>
              </Choice>
            );
          })}
        </div>
      </Field>

      <p className="text-[12px] leading-5 text-[#68726c]">
        Drag the map to move it and pinch or scroll to zoom — the print follows exactly.
      </p>
    </div>
  );
}

// --- Look -------------------------------------------------------------------

function LookPanel({ scene, update, suggestions }: {
  scene: PrintScene;
  update: StudioDockProps['update'];
  suggestions?: Look[];
}) {
  const [fineTune, setFineTune] = useState(false);
  const look = getLook(scene.lookId);
  const palette = checkPalette(scene.colors);
  const density = sceneDensity(scene);

  // Say WHY a bigger print would show more, rather than leaving the user to
  // discover it by buying one. Only surfaced when a larger size actually
  // crosses the threshold — never as a generic upsell.
  const wantedSize = scene.place.kind === 'city'
    ? smallestSizeForEveryStreet(scene.radiusMiles, scene.orientation)
    : smallestSizeForEveryTown(scene.radiusMiles, scene.orientation);
  const missing = scene.place.kind === 'city' ? !density.everyStreet : !density.everyTown;
  const upgradeHint = missing && wantedSize && SIZE_LABELS.indexOf(wantedSize) > SIZE_LABELS.indexOf(scene.size)
    ? `A ${SIZE_CATALOG[scene.orientation][wantedSize].dimensionStr} print would fit ${
        scene.place.kind === 'city' ? 'every street' : 'every town'
      } at this framing.`
    : null;

  return (
    <div className="grid gap-5">
      {suggestions && suggestions.length > 0 && (
        <Field
          label={`Three good prints of ${scene.place.name}`}
          help="A starting point picked from the place itself — how much water is in frame, and how much ground."
        >
          <div className="grid grid-cols-3 gap-2">
            {suggestions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => update((current) => applyLook(current, option), `start-${option.id}`)}
                className={`flex min-w-0 flex-col items-center gap-1.5 rounded-sm border p-2 transition-colors ${
                  scene.lookId === option.id
                    ? 'border-[#173f35] bg-[#eef1ed]'
                    : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
                }`}
              >
                <LookSwatch look={option} width={44} />
                <span className="w-full truncate text-center text-[12px]">{option.name}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label={suggestions && suggestions.length > 0 ? 'Or pick any look' : 'Look'}>
        <div className="grid grid-cols-5 gap-2">
          {LOOKS.map((option) => {
            const isActive = scene.lookId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                title={`${option.name} — ${option.blurb}`}
                onClick={() => update((current) => applyLook(current, option), `look-${option.id}`)}
                className={`group rounded-sm border p-1 transition-colors ${
                  isActive ? 'border-[#173f35] bg-[#eef1ed]' : 'border-[#d8d9d3] bg-white hover:border-[#849587]'
                }`}
              >
                <LookSwatch look={option} width={48} />
                <span className="mt-1 block truncate text-[11px] leading-4">{option.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[#68726c]">{look.blurb}</p>
      </Field>

      <Field label="Accent">
        <div className="flex flex-wrap items-center gap-2">
          {look.accents.map((accent) => (
            <button
              key={accent}
              type="button"
              aria-label={`Accent ${accent}`}
              aria-pressed={scene.colors.roads.toLowerCase() === accent.toLowerCase()}
              onClick={() => update((current) => ({
                ...current,
                colors: { ...current.colors, roads: accent },
              }), 'accent')}
              className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${
                scene.colors.roads.toLowerCase() === accent.toLowerCase()
                  ? 'border-[#173f35]'
                  : 'border-transparent shadow-[0_0_0_1px_rgba(20,32,29,0.15)]'
              }`}
              style={{ backgroundColor: accent }}
            />
          ))}
          <span className="ml-1 text-[12px] text-[#68726c]">Picked to work with this look.</span>
        </div>
      </Field>

      <Field label="Detail">
        <Segmented
          options={DETAIL_BIASES.map((bias) => ({ value: String(bias.value), label: bias.label }))}
          value={String(scene.detailBias)}
          onChange={(value) => update(
            (current) => ({ ...current, detailBias: Number(value) as DetailBias }),
            'detail-bias',
          )}
        />
        <p className="mt-2 text-[12px] leading-5 text-[#44504b]">
          {density.description}.{' '}
          <span className="text-[#8a918d]">
            {Math.round(density.milesPerInch * 10) / 10} miles per inch of paper.
          </span>
        </p>
        {upgradeHint && (
          <p className="mt-1.5 text-[12px] leading-5 text-[#8a5a3f]">{upgradeHint}</p>
        )}
      </Field>

      <button
        type="button"
        onClick={() => setFineTune((open) => !open)}
        aria-expanded={fineTune}
        className="justify-self-start text-[12px] text-[#68726c] underline underline-offset-4 hover:text-[#173f35]"
      >
        {fineTune ? 'Hide fine tuning' : 'Fine tune'}
      </button>

      {fineTune && (
        <div className="grid gap-5 border-t border-[#e0ddd4] pt-5">
          <Field label="Line weight">
            <Segmented
              options={WEIGHTS.map((weight) => ({ value: String(weight.value), label: weight.label }))}
              value={String(nearestWeight(scene.strokeWeight))}
              onChange={(value) => update((current) => ({ ...current, strokeWeight: Number(value) }), 'weight')}
            />
          </Field>

          <Field label="Border">
            <Segmented
              options={BORDERS.map((border) => ({ value: border.value, label: border.label }))}
              value={scene.detail.border}
              onChange={(value) => update((current) => ({
                ...current,
                detail: { ...current.detail, border: value as BorderWeight },
              }), 'border')}
            />
          </Field>

          <Field label="Labels">
            <div className="grid gap-1 sm:grid-cols-2">
              {scene.place.kind !== 'city' && (
                <>
                  <Toggle
                    label="City names"
                    active={scene.detail.labels.cities}
                    onChange={() => toggleLabel(update, 'cities')}
                  />
                  <Toggle
                    label="Town names"
                    active={scene.detail.labels.towns}
                    onChange={() => toggleLabel(update, 'towns')}
                  />
                </>
              )}
              <Toggle label="Street names" active={scene.detail.labels.roads} onChange={() => toggleLabel(update, 'roads')} />
              <Toggle label="Lake names" active={scene.detail.labels.water} onChange={() => toggleLabel(update, 'water')} />
              <Toggle label="River names" active={scene.detail.labels.rivers} onChange={() => toggleLabel(update, 'rivers')} />
              <Toggle
                label="Show rivers"
                active={scene.detail.rivers}
                onChange={() => update((current) => ({
                  ...current,
                  detail: { ...current.detail, rivers: !current.detail.rivers },
                }), 'rivers')}
              />
            </div>
          </Field>

          <Field
            label="Custom colours"
            help="Anything is allowed here, but we check it the way it will print."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <ColorField
                label="Paper"
                value={scene.colors.land}
                onChange={(land) => update((current) => ({ ...current, colors: { ...current.colors, land } }), 'color-land')}
              />
              <ColorField
                label="Water"
                value={scene.colors.water}
                onChange={(water) => update((current) => ({ ...current, colors: { ...current.colors, water } }), 'color-water')}
              />
              <ColorField
                label="Streets"
                value={scene.colors.roads}
                onChange={(roads) => update((current) => ({ ...current, colors: { ...current.colors, roads } }), 'color-roads')}
              />
            </div>

            {palette.verdict !== 'good' && (
              <div
                className={`mt-3 flex flex-wrap items-center gap-3 border-l-2 px-3 py-2 text-[12px] leading-5 ${
                  palette.verdict === 'unprintable'
                    ? 'border-[#c1362b] bg-[#fbf0ee] text-[#8f2a21]'
                    : 'border-[#c66b4e] bg-[#faf4f0] text-[#8a4a33]'
                }`}
                role="status"
              >
                <span className="flex-1">{palette.issues.join(' ')}</span>
                <button
                  type="button"
                  className="studio-ghost-button px-3 py-1.5"
                  onClick={() => update((current) => ({
                    ...current,
                    colors: {
                      ...current.colors,
                      water: makePrintable(current.colors.water, current.colors.land),
                      roads: makePrintable(current.colors.roads, current.colors.land),
                    },
                  }), 'fix-contrast')}
                >
                  Fix it
                </button>
              </div>
            )}
          </Field>
        </div>
      )}
    </div>
  );
}

function nearestWeight(weight: number): number {
  return WEIGHTS.reduce((best, option) =>
    Math.abs(option.value - weight) < Math.abs(best - weight) ? option.value : best,
  WEIGHTS[1].value);
}

function toggleLabel(
  update: StudioDockProps['update'],
  key: keyof PrintDetailSettings['labels'],
) {
  update((current) => ({
    ...current,
    detail: {
      ...current.detail,
      labels: { ...current.detail.labels, [key]: !current.detail.labels[key] },
    },
  }), `label-${key}`);
}

// --- Words ------------------------------------------------------------------

function WordsPanel({ scene, update }: { scene: PrintScene; update: StudioDockProps['update'] }) {
  const title = scene.title;

  function setTitle(patch: Partial<typeof title>, label: string) {
    update((current) => ({ ...current, title: { ...current.title, ...patch } }), label);
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-4">
        <Toggle
          label="Show a title"
          active={title.enabled}
          onChange={() => setTitle({ enabled: !title.enabled }, 'title-enabled')}
        />
        <p className="text-right text-[12px] leading-5 text-[#68726c]">
          Double-click the title on the print to edit it there.
        </p>
      </div>

      {title.enabled && (
        <>
          <Field label="Text">
            <div className="grid gap-2">
              <TextField label="Title" value={title.text} onChange={(text) => setTitle({ text }, 'title-text')} />
              <TextField label="Subtitle" value={title.subtitle} onChange={(subtitle) => setTitle({ subtitle }, 'title-sub')} />
              <TextField label="Small line" value={title.detail} onChange={(detail) => setTitle({ detail }, 'title-detail')} />
            </div>
          </Field>

          <Field label="Placement" help="Or drag it anywhere on the print — it snaps to these.">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SLOT_OPTIONS.map((option) => (
                <Choice
                  key={option.slot}
                  active={title.slot === option.slot}
                  onClick={() => setTitle({ slot: option.slot as TitleSlot, align: option.align }, 'title-slot')}
                >
                  <span className="block text-[12px]">{option.label}</span>
                </Choice>
              ))}
            </div>
            {title.slot === 'free' && (
              <p className="mt-2 text-[12px] leading-5 text-[#68726c]">
                Placed by hand. Pick a spot above to snap it back.
              </p>
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Backing">
              <Segmented
                options={PANELS.map((panel) => ({ value: panel.value, label: panel.label }))}
                value={title.panel}
                onChange={(value) => setTitle({ panel: value as TitlePanel }, 'title-panel')}
              />
            </Field>
            <Field label="Alignment">
              <Segmented
                options={[{ value: 'center', label: 'Centred' }, { value: 'left', label: 'Left' }]}
                value={title.align}
                onChange={(value) => setTitle({ align: value as 'left' | 'center' }, 'title-align')}
              />
            </Field>
          </div>

          <p className="text-[12px] leading-5 text-[#68726c]">
            Colours follow your look automatically and are always checked for contrast.
          </p>
        </>
      )}
    </div>
  );
}

// --- Shared controls --------------------------------------------------------

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-medium text-[#14201d]">{label}</h3>
      {help && <p className="mb-2 text-[12px] leading-5 text-[#68726c]">{help}</p>}
      {children}
    </section>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[48px] rounded-sm border px-2 py-2 text-center transition-colors ${
        active
          ? 'border-[#173f35] bg-[#173f35] text-white'
          : 'border-[#d8d9d3] bg-white text-[#14201d] hover:border-[#849587]'
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
    <div
      className="grid overflow-hidden rounded-sm border border-[#d8d9d3]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-2.5 text-[12px] transition-colors ${index ? 'border-l border-[#d8d9d3]' : ''} ${
            value === option.value ? 'bg-[#173f35] text-white' : 'bg-white text-[#44504b] hover:bg-[#eef1ed]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onChange}
      className="flex w-full items-center justify-between gap-3 py-1.5 text-left"
    >
      <span className="text-[13px] text-[#44504b]">{label}</span>
      <span className={`relative h-5 w-9 flex-none rounded-full transition-colors ${active ? 'bg-[#173f35]' : 'bg-[#d4d7d2]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${active ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-sm border border-[#d8d9d3] bg-white px-3 py-2">
      <span>
        <span className="block text-[12px] text-[#44504b]">{label}</span>
        <span className="block font-mono text-[11px] uppercase text-[#8a918d]">{value}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-10 cursor-pointer rounded-sm border border-[#d8d9d3] bg-white p-0.5"
      />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[92px_1fr] items-center rounded-sm border border-[#d8d9d3] bg-white focus-within:border-[#173f35]">
      <span className="px-3 text-[12px] text-[#68726c]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-r-sm border-l border-[#d8d9d3] bg-transparent px-3 py-2.5 text-[14px] outline-none"
      />
    </label>
  );
}
