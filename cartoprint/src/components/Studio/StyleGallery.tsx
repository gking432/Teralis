'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { TitleOverlay } from '@/components/Studio/TitleOverlay';
import { applyLayoutToTitle, applyPalette, type PrintScene } from '@/lib/print/scene';
import { getLayout } from '@/lib/print/layouts';
import { PALETTES, type Palette } from '@/lib/print/palettes';
import { getPrintInkColor } from '@/lib/print/colorSchemes';
import { makePrintable } from '@/lib/print/contrast';
import { percent, printGeometry } from '@/lib/print/geometry';
import type { BorderWeight } from '@/lib/print/printRender';
import {
  printableTitleTextColor,
  resolveTitleColors,
  swappedTitleColors,
  titleBackdropColor,
  type TitleDesign,
  type TitlePanel,
} from '@/lib/print/title';

interface StyleGalleryProps {
  scene: PrintScene;
  mapImage: string | null;
  waterAvailable?: boolean;
  update: (next: PrintScene | ((current: PrintScene) => PrintScene), label?: string) => void;
  onClose: () => void;
  onFinish: (scene: PrintScene) => void;
}

type GalleryStep = 'composition' | 'color';

const LABEL_OPTIONS = [
  { id: 'footer', name: 'Footer', blurb: 'A slim band below the map.' },
  { id: 'poster', name: 'Poster', blurb: 'A larger editorial footer.' },
  { id: 'plaque', name: 'Corner', blurb: 'A compact label on the map.' },
  { id: 'overlay', name: 'Movable', blurb: 'Transparent type you can drag and rotate.' },
  { id: 'bare', name: 'No label', blurb: 'Pure map, without wording.' },
] as const;

const BORDER_OPTIONS: Array<{ value: BorderWeight; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Medium' },
  { value: 'thick', label: 'Wide' },
];

const PANEL_OPTIONS: Array<{ value: TitlePanel; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'none', label: 'Transparent' },
];

function friendlyPlaceType(value: string): string {
  const normalised = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return normalised || 'place';
}

export function StyleGallery({ scene, mapImage, update, onClose, onFinish }: StyleGalleryProps) {
  const [step, setStep] = useState<GalleryStep>('color');
  const [colorComplete, setColorComplete] = useState(false);
  const [updating, setUpdating] = useState(false);
  const previousImage = useRef(mapImage);
  const placeType = friendlyPlaceType(scene.place.placeType || scene.place.kind);

  useEffect(() => {
    if (mapImage && mapImage !== previousImage.current) {
      previousImage.current = mapImage;
      setUpdating(false);
    }
  }, [mapImage]);

  function chooseLabel(layoutId: string) {
    setUpdating(true);
    update((current) => {
      const layout = getLayout(layoutId);
      const nextTitle = applyLayoutToTitle(current.title, layout);
      return {
        ...current,
        layoutId,
        title: {
          ...nextTitle,
          // Wording colors are a separate choice and survive repositioning.
          textColor: current.title.textColor,
          panelColor: current.title.panelColor,
          backdropColor: undefined,
        },
        updatedAt: Date.now(),
      };
    }, `label-${layoutId}`);
  }

  function chooseBorder(border: BorderWeight) {
    setUpdating(true);
    update((current) => ({
      ...current,
      detail: { ...current.detail, border },
      updatedAt: Date.now(),
    }), `border-${border}`);
  }

  function updateTitle(patch: Partial<TitleDesign>, label: string) {
    update((current) => ({
      ...current,
      title: { ...current.title, ...patch },
      updatedAt: Date.now(),
    }), label);
  }

  function choosePalette(palette: Palette) {
    setUpdating(true);
    update((current) => applyPalette(current, palette), `palette-${palette.id}`);
  }

  function setCustomColor(channel: 'land' | 'water' | 'roads', value: string) {
    setUpdating(true);
    update((current) => {
      const land = channel === 'land' ? value : current.colors.land;
      return {
        ...current,
        paletteId: 'custom',
        colors: {
          ...current.colors,
          [channel]: channel === 'land' ? land : makePrintable(value, land),
          ...(channel === 'land' ? {
            water: makePrintable(current.colors.water, land),
            roads: makePrintable(current.colors.roads, land),
          } : {}),
        },
      };
    }, `custom-${channel}`);
  }

  function sceneWithoutLabel(current: PrintScene): PrintScene {
    return {
      ...current,
      layoutId: 'bare',
      title: { ...current.title, enabled: false },
      updatedAt: Date.now(),
    };
  }

  function skipStep() {
    if (step === 'color') {
      setColorComplete(true);
      setStep('composition');
      return;
    }
    const next = sceneWithoutLabel(scene);
    update(next, 'skip-label');
    onFinish(next);
  }

  function nextStep() {
    if (step === 'color') {
      setColorComplete(true);
      setStep('composition');
      return;
    }
    onFinish(scene);
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#101a17] text-[#f7f4eb]" role="dialog" aria-modal="true" aria-label="Customize print composition and color">
      <header className="flex h-[62px] flex-none items-center justify-between border-b border-white/10 px-4 md:px-7">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#c7d1ca]/55">Print studio</div>
          <div className="truncate font-display text-[18px] tracking-[0.04em]">{scene.place.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-full border border-white/12 p-1 sm:flex">
            <StepButton active={step === 'color'} onClick={() => setStep('color')}>1 · Color</StepButton>
            <StepButton active={step === 'composition'} disabled={!colorComplete} onClick={() => setStep('composition')}>2 · Label & border</StepButton>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-[18px] text-white/70 transition-colors hover:border-white/50 hover:text-white" aria-label="Close print studio">×</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative flex h-[43dvh] min-h-[285px] flex-none items-center justify-center overflow-hidden px-5 py-5 lg:h-auto lg:min-h-0 lg:flex-1 lg:px-10 lg:py-8">
          <div className="studio-topography absolute inset-0 opacity-55" aria-hidden />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,82,73,0.18),transparent_62%)]" aria-hidden />
          <ActualPrintPreview scene={scene} mapImage={mapImage} update={update} showTitle={step === 'composition'} />
          <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-[#101a17]/28 transition-opacity ${updating ? 'opacity-100' : 'opacity-0'}`}>
            <span className="rounded-full bg-[#101a17]/88 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-white/75">Updating your map…</span>
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-[0.16em] text-white/35 lg:bottom-4">
            Your actual {placeType} · drag the label directly
          </div>
        </section>

        <aside className="flex min-h-0 flex-1 flex-col border-t border-[#d9d8d1] bg-[#fbfaf6] text-[#14201d] lg:w-[500px] lg:flex-none lg:border-l lg:border-t-0 xl:w-[540px]">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-7 lg:py-6">
            {step === 'composition' ? (
              <CompositionStep scene={scene} onLabel={chooseLabel} onBorder={chooseBorder} onTitle={updateTitle} />
            ) : (
              <ColorStep scene={scene} onChoose={choosePalette} onCustomColor={setCustomColor} />
            )}
          </div>
          <footer className="flex flex-none items-center justify-between gap-3 border-t border-[#deddd6] px-4 py-3 sm:px-6 lg:px-7">
            <button type="button" onClick={skipStep} className="rounded-sm border border-[#cdd2cc] px-4 py-2.5 text-[11px] text-[#59645e] transition-colors hover:border-[#173f35] hover:text-[#173f35]">
              {step === 'color' ? 'Skip color' : 'Skip label'}
            </button>
            <button type="button" onClick={nextStep} className="rounded-sm bg-[#173f35] px-5 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0f2f27]">
              {step === 'color' ? 'Next: label & border →' : 'Next: finish →'}
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function StepButton({ active, disabled = false, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-full px-3 py-1.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${active ? 'bg-[#f7f4eb] text-[#14201d]' : 'text-white/55 hover:text-white'}`}>{children}</button>;
}

function CompositionStep({ scene, onLabel, onBorder, onTitle }: {
  scene: PrintScene;
  onLabel: (layoutId: string) => void;
  onBorder: (border: BorderWeight) => void;
  onTitle: (patch: Partial<TitleDesign>, label: string) => void;
}) {
  const title = scene.title;
  const resolvedLabelColors = resolveTitleColors(title, scene.colors);

  function changeTextColor(textColor: string) {
    onTitle({
      textColor: printableTitleTextColor(title, scene.colors, textColor),
    }, 'label-text-color');
  }

  function changePanelColor(panelColor: string) {
    onTitle({
      panelColor,
      // Keep a manual text choice visible when its backing changes instead of
      // letting the resolver silently substitute an unrelated fallback.
      ...(title.textColor ? {
        textColor: makePrintable(title.textColor, panelColor),
      } : {}),
    }, 'label-panel-color');
  }

  function swapLabelColors() {
    onTitle(swappedTitleColors(title, scene.colors), 'label-swap-colors');
  }
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[#8b5c43]">Composition</div>
      <h2 className="mt-1 font-display text-[27px] leading-none">Label and border</h2>
      <p className="mt-3 text-[12px] leading-5 text-[#66716b]">Color stays exactly as it is. Pick a safe starting position, then drag and resize the label on your print. You can edit the wording later.</p>

      <section className="mt-5">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#59645e]">Label location</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LABEL_OPTIONS.map((option) => {
            const active = option.id === 'bare'
              ? !title.enabled
              : title.enabled && (scene.layoutId === option.id || (option.id === 'overlay' && title.slot === 'free'));
            return (
              <button key={option.id} type="button" aria-pressed={active} onClick={() => onLabel(option.id)} className={`rounded-sm border p-3 text-left transition-colors ${active ? 'border-[#173f35] bg-[#eaf0ec] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d7d8d2] bg-white hover:border-[#849587]'}`}>
                <LabelGlyph id={option.id} colors={scene.colors} />
                <span className="mt-2 block text-[11px] font-medium">{option.name}</span>
                <span className="mt-0.5 block text-[9px] leading-3.5 text-[#77807b]">{option.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 border-t border-[#deddd6] pt-4">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#59645e]">Border width</h3>
        <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-sm border border-[#d7d8d2]">
          {BORDER_OPTIONS.map((option, index) => <button key={option.value} type="button" aria-pressed={scene.detail.border === option.value} onClick={() => onBorder(option.value)} className={`px-2 py-2.5 text-[10px] ${index ? 'border-l border-[#d7d8d2]' : ''} ${scene.detail.border === option.value ? 'bg-[#173f35] text-white' : 'bg-white text-[#66716b] hover:bg-[#eef1ed]'}`}>{option.label}</button>)}
        </div>
      </section>

      {title.enabled && (
        <section className="mt-5 border-t border-[#deddd6] pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#59645e]">Wording</h3>
          <div className="mt-2 grid gap-2">
            <LabelTextField label="Title" value={title.text} onChange={(text) => onTitle({ text }, 'label-title')} />
            <LabelTextField label="Subtitle" value={title.subtitle} onChange={(subtitle) => onTitle({ subtitle }, 'label-subtitle')} />
            <LabelTextField label="Small line" value={title.detail} onChange={(detail) => onTitle({ detail }, 'label-detail')} />
          </div>

          <h3 className="mt-5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#59645e]">Label treatment</h3>
          <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-sm border border-[#d7d8d2]">
            {PANEL_OPTIONS.map((option, index) => <button key={option.value} type="button" aria-pressed={title.panel === option.value} onClick={() => onTitle({ panel: option.value }, 'label-backing')} className={`px-2 py-2.5 text-[10px] ${index ? 'border-l border-[#d7d8d2]' : ''} ${title.panel === option.value ? 'bg-[#173f35] text-white' : 'bg-white text-[#66716b] hover:bg-[#eef1ed]'}`}>{option.label}</button>)}
          </div>
          {title.panel === 'none' && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-[#d7d8d2] bg-white p-3">
              <div>
                <div className="text-[11px] font-medium">Automatic contrast</div>
                <p className="mt-0.5 text-[9px] leading-4 text-[#77807b]">Text inverts against the sampled map color.</p>
              </div>
              <button type="button" onClick={() => onTitle({ textColor: undefined }, 'label-auto-color')} className={`rounded-full px-3 py-1.5 text-[10px] ${!title.textColor ? 'bg-[#173f35] text-white' : 'border border-[#cdd2cc] text-[#173f35]'}`}>Auto</button>
            </div>
          )}
          <div className={`mt-3 grid gap-3 ${title.panel === 'solid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <GalleryColor label="Text" value={resolvedLabelColors.text} onChange={changeTextColor} />
            {title.panel === 'solid' && <GalleryColor label="Backing" value={resolvedLabelColors.panel} onChange={changePanelColor} />}
          </div>
          {title.panel === 'solid' && (
            <button
              type="button"
              onClick={swapLabelColors}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-3 rounded-sm border border-[#cdd2cc] bg-white px-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[#173f35] transition-colors hover:border-[#173f35] hover:bg-[#eef1ed]"
              aria-label="Swap text and backing colors"
            >
              <span className="flex items-center" aria-hidden>
                <span className="h-4 w-4 border border-black/10" style={{ backgroundColor: resolvedLabelColors.text }} />
                <span className="mx-1 text-[14px]">⇄</span>
                <span className="h-4 w-4 border border-black/10" style={{ backgroundColor: resolvedLabelColors.panel }} />
              </span>
              Swap text and backing
            </button>
          )}
          <p className="mt-2 text-[9px] leading-4 text-[#77807b]">
            {title.panel === 'none'
              ? `Text is checked against the map color beneath it (${titleBackdropColor(title, scene.colors)}).`
              : 'Low-contrast choices are shifted only as much as needed to remain print-safe.'}
          </p>
          {(scene.layoutId === 'overlay' || title.slot === 'free') && (
            <label className="mt-4 block text-[11px] font-medium text-[#59645e]">
              Rotation <span className="float-right tabular-nums text-[#77807b]">{Math.round(title.rotation)}°</span>
              <input type="range" min={-20} max={20} step={1} value={title.rotation} onChange={(event) => onTitle({ rotation: Number(event.target.value) }, 'label-rotation')} className="studio-range mt-2 w-full" />
            </label>
          )}
        </section>
      )}
    </div>
  );
}

function LabelGlyph({ id, colors }: { id: string; colors: PrintScene['colors'] }) {
  const footer = id === 'footer' || id === 'poster';
  return (
    <span className="relative block h-10 w-full overflow-hidden border border-black/10" style={{ backgroundColor: colors.land }} aria-hidden>
      <span className="absolute inset-0 opacity-60" style={{ backgroundImage: `repeating-linear-gradient(18deg,transparent 0 7px,${colors.roads} 7px 8px)` }} />
      {id !== 'bare' && <span className={footer ? `absolute inset-x-0 bottom-0 ${id === 'poster' ? 'h-[34%]' : 'h-[23%]'}` : 'absolute left-[8%] top-[12%] h-[30%] w-[48%]'} style={{ backgroundColor: colors.land, opacity: id === 'overlay' ? 0.7 : 1 }} />}
    </span>
  );
}

function ColorStep({ scene, onChoose, onCustomColor }: { scene: PrintScene; onChoose: (palette: Palette) => void; onCustomColor: (channel: 'land' | 'water' | 'roads', value: string) => void }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[#8b5c43]">Color</div>
      <h2 className="mt-1 font-display text-[27px] leading-none">Choose the ink</h2>
      <p className="mt-3 text-[12px] leading-5 text-[#66716b]">Only paper, streets, and water change. Your label position and border stay fixed.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {PALETTES.map((palette) => <button key={palette.id} type="button" aria-pressed={scene.paletteId === palette.id} onClick={() => onChoose(palette)} className={`flex items-center gap-3 rounded-sm border p-2.5 text-left transition-colors ${scene.paletteId === palette.id ? 'border-[#173f35] bg-[#eaf0ec]' : 'border-[#d7d8d2] bg-white hover:border-[#849587]'}`}>
          <span className="grid h-9 w-9 shrink-0 grid-cols-3 overflow-hidden rounded-full border border-black/10"><span style={{ backgroundColor: palette.colors.land }} /><span style={{ backgroundColor: palette.colors.roads }} /><span style={{ backgroundColor: palette.colors.water }} /></span>
          <span className="min-w-0"><span className="block truncate text-[11px] font-medium">{palette.name}</span><span className="block truncate text-[9px] text-[#77807b]">{palette.blurb}</span></span>
        </button>)}
      </div>
      <details className="mt-5 border-t border-[#deddd6] pt-4">
        <summary className="cursor-pointer text-[11px] text-[#59645e] underline underline-offset-4">Create a custom palette</summary>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <GalleryColor label="Paper" value={scene.colors.land} onChange={(value) => onCustomColor('land', value)} />
          <GalleryColor label="Streets" value={scene.colors.roads} onChange={(value) => onCustomColor('roads', value)} />
          <GalleryColor label="Water" value={scene.colors.water} onChange={(value) => onCustomColor('water', value)} />
        </div>
        <p className="mt-3 text-[10px] leading-4 text-[#77807b]">Unsafe combinations are automatically moved to the nearest printable color.</p>
      </details>
    </div>
  );
}

function GalleryColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase());

  useEffect(() => {
    setDraft(value.toUpperCase());
  }, [value]);

  function commitDraft() {
    const raw = draft.trim();
    const normalized = /^#[0-9a-f]{6}$/i.test(raw)
      ? raw.toLowerCase()
      : /^#[0-9a-f]{3}$/i.test(raw)
        ? `#${raw.slice(1).split('').map((character) => character + character).join('')}`.toLowerCase()
        : value;
    setDraft(normalized.toUpperCase());
    if (normalized !== value.toLowerCase()) onChange(normalized);
  }

  return (
    <label className="block text-[9px] uppercase tracking-[0.12em] text-[#77807b]">
      {label}
      <span className="mt-2 flex min-h-12 items-center gap-2 rounded-sm border border-[#d7d8d2] bg-white p-2 focus-within:border-[#173f35]">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          type="text"
          aria-label={`${label} hex color`}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(value.toUpperCase());
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-[10px] uppercase tracking-normal text-[#59645e] outline-none"
        />
      </span>
    </label>
  );
}

function LabelTextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid grid-cols-[72px_1fr] items-center gap-2"><span className="text-[9px] uppercase tracking-[0.1em] text-[#77807b]">{label}</span><input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-[#d7d8d2] bg-white px-3 py-2 text-[11px] outline-none focus:border-[#173f35]" /></label>;
}

function colorDistance(a: string, b: string): number {
  const parse = (value: string) => value.replace('#', '').match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [0, 0, 0];
  const left = parse(a);
  const right = parse(b);
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function ActualPrintPreview({ scene, mapImage, update, showTitle }: { scene: PrintScene; mapImage: string | null; update: StyleGalleryProps['update']; showTitle: boolean }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const previewTitle = showTitle ? scene.title : { ...scene.title, enabled: false };
  const geometry = printGeometry(scene.orientation, scene.detail.border, previewTitle);
  const paper = scene.colors.land || '#ffffff';
  const ink = getPrintInkColor(scene.colors);

  function sampledBackdrop(title: TitleDesign): string | undefined {
    const image = imageRef.current;
    if (!image?.complete || !image.naturalWidth) return undefined;
    const centerX = title.x + title.w / 2;
    const centerY = title.y + title.h / 2;
    const map = geometry.mapRect;
    if (centerX < map.x || centerX > map.x + map.w || centerY < map.y || centerY > map.y + map.h) return paper;
    const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.round(((centerX - map.x) / map.w) * image.naturalWidth)));
    const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.round(((centerY - map.y) / map.h) * image.naturalHeight)));
    const canvas = sampleRef.current ?? document.createElement('canvas');
    sampleRef.current = canvas;
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.clearRect(0, 0, 1, 1);
    context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function handleTitleChange(title: TitleDesign) {
    const backdropColor = title.panel === 'none' ? sampledBackdrop(title) : undefined;
    const onWater = backdropColor ? colorDistance(backdropColor, scene.colors.water) < colorDistance(backdropColor, paper) : false;
    update((current) => ({ ...current, title: { ...title, backdropColor, onWater } }), 'title-drag-gallery');
  }

  return (
    <div ref={sheetRef} className="relative z-10 max-h-full max-w-full overflow-hidden shadow-[0_34px_90px_rgba(0,0,0,0.55)]" style={{ aspectRatio: `1 / ${geometry.ratio}`, height: scene.orientation === 'landscape' ? 'auto' : '100%', width: scene.orientation === 'landscape' ? 'min(92%, 920px)' : 'auto', backgroundColor: paper }} data-testid="style-gallery-preview">
      {geometry.borderFracW > 0 && <div className="absolute" style={{ left: percent(geometry.mapFrameRect.x), top: percent(geometry.mapFrameRect.y), width: percent(geometry.mapFrameRect.w), height: percent(geometry.mapFrameRect.h), backgroundColor: ink }} />}
      <div className="absolute overflow-hidden" style={{ left: percent(geometry.mapRect.x), top: percent(geometry.mapRect.y), width: percent(geometry.mapRect.w), height: percent(geometry.mapRect.h), backgroundColor: paper }}>
        {mapImage ? <img ref={imageRef} src={mapImage} alt="" className="h-full w-full object-fill" /> : <div className="grid h-full w-full place-items-center bg-black/5 text-[9px] uppercase tracking-[0.16em] text-black/35">Preparing map</div>}
      </div>
      {showTitle && <TitleOverlay design={scene.title} colors={scene.colors} containerRef={sheetRef as RefObject<HTMLElement>} onChange={handleTitleChange} editable />}
    </div>
  );
}
