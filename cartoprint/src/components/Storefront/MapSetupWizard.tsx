'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildCustomizeUrl,
  LocationSearch,
  type LocationSearchResult,
  type RequestedMapKind,
} from '@/components/Storefront/LocationSearch';
import { COLOR_SCHEMES } from '@/lib/print/colorSchemes';

type SetupStep = 'kind' | 'place' | 'confirm' | 'color' | 'title';
type SetupTitleStyle = 'none' | 'footer' | 'glass';

const STEPS: SetupStep[] = ['kind', 'place', 'confirm', 'color', 'title'];
const MAP_KINDS: Array<{ value: RequestedMapKind; label: string; description: string }> = [
  { value: 'city', label: 'City', description: 'A dense street study' },
  { value: 'town', label: 'Town', description: 'Small-place detail' },
  { value: 'state', label: 'State', description: 'Cities and towns included' },
  { value: 'country', label: 'Country', description: 'Regions and capitals' },
];
const TITLE_STYLES: Array<{ value: SetupTitleStyle; label: string; description: string }> = [
  { value: 'none', label: 'Map only', description: 'No title or words' },
  { value: 'footer', label: 'Contemporary footer', description: 'A clean title below the map' },
  { value: 'glass', label: 'Glass label', description: 'A translucent title over the map' },
];

export function MapSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('kind');
  const [kind, setKind] = useState<RequestedMapKind>('city');
  const [place, setPlace] = useState<LocationSearchResult | null>(null);
  const [palette, setPalette] = useState('signal-navy');
  const [titleStyle, setTitleStyle] = useState<SetupTitleStyle>('none');
  const stepIndex = STEPS.indexOf(step);

  function chooseKind(nextKind: RequestedMapKind) {
    setKind(nextKind);
    setPlace(null);
    setStep('place');
  }

  function createMap() {
    if (!place) return;
    router.push(buildCustomizeUrl(place, {
      setup: '1',
      palette,
      titleStyle,
      requestedKind: kind,
      ...(kind === 'country' ? { o: 'landscape' } : {}),
    }));
  }

  return (
    <div className="border border-white/16 bg-[#f7f4eb] text-[#14201d] shadow-[0_30px_90px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between border-b border-[#14201d]/12 px-5 py-4 sm:px-7">
        <div className="text-[8px] uppercase tracking-[0.2em] text-[#6e7a73]">Create your print</div>
        <div className="flex items-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <span
              key={item}
              className={`h-1.5 rounded-full transition-all ${index === stepIndex ? 'w-7 bg-[#c44d35]' : index < stepIndex ? 'w-3 bg-[#173f35]' : 'w-3 bg-[#d5d8d2]'}`}
            />
          ))}
        </div>
      </div>

      <div className="min-h-[355px] p-5 sm:p-7">
        {step === 'kind' && (
          <WizardPanel
            eyebrow="First, the place"
            title="What kind of map are you looking for?"
            description="We will choose the right map detail automatically."
          >
            <div className="grid grid-cols-2 gap-2">
              {MAP_KINDS.map((option) => (
                <WizardChoice
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  active={kind === option.value}
                  onClick={() => chooseKind(option.value)}
                />
              ))}
            </div>
          </WizardPanel>
        )}

        {step === 'place' && (
          <WizardPanel
            eyebrow={`Your ${kind}`}
            title={`What's the name of the ${kind}?`}
            description={`Search for the exact ${kind} you want to turn into a print.`}
          >
            <LocationSearch
              key={kind}
              autoFocus
              requestedKind={kind}
              onSelect={(result) => {
                setPlace(result);
                setStep('confirm');
              }}
              placeholder={`Search for a ${kind}`}
            />
            <WizardBack onClick={() => setStep('kind')}>Change map type</WizardBack>
          </WizardPanel>
        )}

        {step === 'confirm' && place && (
          <WizardPanel
            eyebrow="Confirm the place"
            title="Does this look right?"
            description="We will use this exact geographic area as the starting point."
          >
            <div className="border border-[#cfd4ce] bg-white p-5">
              <div className="text-[8px] uppercase tracking-[0.18em] text-[#c44d35]">{kind}</div>
              <div className="mt-2 font-display text-[34px] font-light leading-none">{place.primary}</div>
              <div className="mt-2 text-[10px] leading-5 text-[#6e7a73]">{place.secondary}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setPlace(null); setStep('place'); }} className="border border-[#cfd4ce] bg-white px-4 py-3 text-[9px] uppercase tracking-[0.14em] hover:border-[#173f35]">
                No, search again
              </button>
              <button type="button" onClick={() => setStep('color')} className="bg-[#173f35] px-4 py-3 text-[9px] uppercase tracking-[0.14em] text-white hover:bg-[#c44d35]">
                Yes, use this place
              </button>
            </div>
          </WizardPanel>
        )}

        {step === 'color' && (
          <WizardPanel
            eyebrow="Choose a mood"
            title="What color should your print be?"
            description="This is only a starting point. Every color can be edited later."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COLOR_SCHEMES.filter((scheme) => scheme.value !== 'map-default').slice(0, 6).map((scheme) => (
                <button
                  key={scheme.value}
                  type="button"
                  aria-pressed={palette === scheme.value}
                  onClick={() => setPalette(scheme.value)}
                  className={`border p-3 text-left transition-colors ${palette === scheme.value ? 'border-[#173f35] bg-[#e9eee9] shadow-[inset_0_0_0_1px_#173f35]' : 'border-[#d5d8d2] bg-white hover:border-[#87988d]'}`}
                >
                  <span className="mb-3 flex h-7 overflow-hidden border border-black/10">
                    <span className="flex-1" style={{ backgroundColor: scheme.colors.land }} />
                    <span className="flex-1" style={{ backgroundColor: scheme.colors.roads }} />
                    <span className="flex-1" style={{ backgroundColor: scheme.colors.water }} />
                  </span>
                  <span className="block text-[8px] uppercase tracking-[0.12em]">{scheme.label}</span>
                </button>
              ))}
            </div>
            <WizardActions
              back={() => setStep('confirm')}
              next={() => setStep('title')}
              nextLabel="Choose title"
            />
          </WizardPanel>
        )}

        {step === 'title' && (
          <WizardPanel
            eyebrow="Finish the composition"
            title="What kind of title do you want?"
            description="You can change the wording, colors, and placement on the next screen."
          >
            <div className="grid gap-2">
              {TITLE_STYLES.map((option) => (
                <WizardChoice
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  active={titleStyle === option.value}
                  onClick={() => setTitleStyle(option.value)}
                  horizontal
                />
              ))}
            </div>
            <WizardActions
              back={() => setStep('color')}
              next={createMap}
              nextLabel="Create my map"
            />
          </WizardPanel>
        )}
      </div>
    </div>
  );
}

function WizardPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.2em] text-[#c44d35]">{eyebrow}</div>
      <h2 className="mt-3 max-w-xl font-display text-[32px] font-light leading-[0.98] tracking-[-0.02em] sm:text-[38px]">{title}</h2>
      <p className="mt-3 max-w-lg text-[10px] leading-5 text-[#6e7a73]">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function WizardChoice({
  label,
  description,
  active,
  onClick,
  horizontal = false,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  horizontal?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${horizontal ? 'flex min-h-[62px] items-center justify-between gap-4' : 'min-h-[88px]'} w-full border p-3 text-left transition-colors ${active ? 'border-[#173f35] bg-[#173f35] text-white' : 'border-[#d5d8d2] bg-white hover:border-[#87988d]'}`}
    >
      <span className="block text-[9px] uppercase tracking-[0.14em]">{label}</span>
      <span className={`${horizontal ? 'mt-0 text-right' : 'mt-2'} block text-[9px] leading-4 opacity-60`}>{description}</span>
    </button>
  );
}

function WizardActions({ back, next, nextLabel }: { back: () => void; next: () => void; nextLabel: string }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#14201d]/12 pt-4">
      <WizardBack onClick={back}>Back</WizardBack>
      <button type="button" onClick={next} className="bg-[#173f35] px-5 py-3 text-[9px] uppercase tracking-[0.15em] text-white hover:bg-[#c44d35]">
        {nextLabel} →
      </button>
    </div>
  );
}

function WizardBack({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-4 text-[8px] uppercase tracking-[0.14em] text-[#6e7a73] underline decoration-[#adb6b0] underline-offset-4 hover:text-[#173f35]">
      ← {children}
    </button>
  );
}
