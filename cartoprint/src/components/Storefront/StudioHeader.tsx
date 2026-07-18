'use client';

import Link from 'next/link';

interface StudioHeaderProps {
  step?: 1 | 2 | 3;
  backHref?: string;
  backLabel?: string;
  context?: string;
  tone?: 'ink' | 'paper';
}

const STEPS = ['Design', 'Compose', 'Finish'];

export function StudioHeader({
  step,
  backHref = '/',
  backLabel = 'Studio',
  context,
  tone = 'ink',
}: StudioHeaderProps) {
  const ink = tone === 'ink';

  return (
    <header
      className={`studio-header ${ink ? 'studio-header--ink' : 'studio-header--paper'}`}
    >
      <div className="flex min-w-0 items-center gap-4 md:gap-7">
        <Link href="/" className="studio-wordmark" aria-label="Terralis home">
          Terra<span>lis</span>
        </Link>
        {step && (
          <Link href={backHref} className="studio-back-link">
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
        )}
      </div>

      {step ? (
        <nav className="studio-steps" aria-label="Print design progress">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const state = number < step ? 'complete' : number === step ? 'active' : 'upcoming';
            return (
              <div key={label} className={`studio-step studio-step--${state}`}>
                <span className="studio-step__number">{number < step ? '✓' : number}</span>
                <span className="studio-step__label">{label}</span>
              </div>
            );
          })}
        </nav>
      ) : (
        <div className="hidden text-[10px] uppercase tracking-[0.22em] text-current/55 md:block">
          Custom cartography · Made by you
        </div>
      )}

      <div className="hidden min-w-0 text-right md:block">
        {step ? (
          <>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-40">Current study</div>
            <div className="max-w-[190px] truncate text-[11px] tracking-[0.04em] opacity-75">
              {context || 'Untitled map'}
            </div>
          </>
        ) : (
          <>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-40">Studio edition</div>
            <div className="text-[11px] tracking-[0.04em] opacity-75">Made for somewhere</div>
          </>
        )}
      </div>
    </header>
  );
}
