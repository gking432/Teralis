'use client';

import type { PreviewColorSettings } from '@/lib/print/colorSchemes';
import type { PreviewTitleSettings } from '@/lib/print/titleLayouts';

interface TitleOverlayProps {
  titleSettings: PreviewTitleSettings;
  colorSettings: PreviewColorSettings;
  footerHeight: number;
}

export function TitleOverlay({
  titleSettings,
  colorSettings,
  footerHeight,
}: TitleOverlayProps) {
  if (!titleSettings.enabled || !titleSettings.title.trim()) return null;

  const title = titleSettings.title.trim().toUpperCase();
  const subtitle = titleSettings.subtitle.trim().toUpperCase();
  const detail = titleSettings.detail.trim().toUpperCase();
  const ink = colorSettings.useMapDefault
    ? '#07122a'
    : colorSettings.water || colorSettings.roads || '#07122a';
  const panelStyle = {
    backgroundColor: colorSettings.land,
    color: ink,
    borderColor: ink,
  };
  const visibleLineCount = 1 + (subtitle ? 1 : 0) + (detail ? 1 : 0);
  const isLongTitle = title.length > 10;
  const isVeryLongTitle = title.length > 16;
  const isExtremeTitle = title.length > 24;
  const fitRatio = Math.min(1, 11 / Math.max(title.length, 1));
  const footerBaseSize = Math.max(
    28,
    Math.min(86, footerHeight * (visibleLineCount === 1 ? 0.44 : 0.33))
  );
  const compactBaseSize = Math.max(
    18,
    Math.min(58, footerHeight * (visibleLineCount === 1 ? 0.42 : 0.31))
  );
  const titleStyle = {
    fontSize: `${Math.round(footerBaseSize * fitRatio)}px`,
    letterSpacing: isExtremeTitle
      ? '0.08em'
      : isVeryLongTitle
      ? '0.12em'
      : isLongTitle
      ? '0.18em'
      : '0.28em',
  };
  const compactFooterTitleStyle = {
    fontSize: `${Math.round(compactBaseSize * fitRatio)}px`,
    letterSpacing: isExtremeTitle
      ? '0.06em'
      : isVeryLongTitle
      ? '0.1em'
      : isLongTitle
      ? '0.14em'
      : '0.22em',
  };
  const tinyTitleStyle = {
    fontSize: isExtremeTitle ? '12px' : isVeryLongTitle ? '14px' : isLongTitle ? '16px' : '20px',
    letterSpacing: isExtremeTitle
      ? '0.04em'
      : isVeryLongTitle
      ? '0.07em'
      : isLongTitle
      ? '0.1em'
      : '0.14em',
  };

  if (titleSettings.layout === 'compact-bottom') {
    return (
      <div
        className="pointer-events-none relative z-10 flex w-full flex-col items-center justify-center overflow-hidden border-t-2 px-[7%] text-center"
        style={{ ...panelStyle, height: footerHeight }}
      >
        <div className="max-w-full truncate font-display font-light leading-none" style={compactFooterTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-2 max-w-full truncate text-[18px] tracking-[0.26em]">{subtitle}</div>}
        {detail && <div className="mt-1.5 max-w-full truncate text-[14px] tracking-[0.14em]">{detail}</div>}
      </div>
    );
  }

  if (titleSettings.layout === 'top-left') {
    return (
      <div
        className="pointer-events-none absolute left-[4%] top-[4%] z-10 max-w-[30%] overflow-hidden border-l-2 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        style={panelStyle}
      >
        <div className="truncate font-display font-light leading-none" style={tinyTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-1 truncate text-[9px] tracking-[0.16em]">{subtitle}</div>}
        {detail && <div className="mt-0.5 truncate text-[8px] tracking-[0.08em]">{detail}</div>}
      </div>
    );
  }

  if (titleSettings.layout === 'side-rail') {
    return (
      <div
        className="pointer-events-none absolute bottom-[4%] left-[3%] top-[4%] z-10 flex w-[8%] min-w-[54px] flex-col justify-end overflow-hidden border-r px-2 pb-3"
        style={panelStyle}
      >
        <div
          className="origin-bottom-left -rotate-90 whitespace-nowrap font-display font-light leading-none"
          style={tinyTitleStyle}
        >
          {title}
        </div>
        {subtitle && <div className="mt-6 truncate text-[8px] tracking-[0.12em]">{subtitle}</div>}
        {detail && <div className="mt-1 truncate text-[7px] tracking-[0.08em]">{detail}</div>}
      </div>
    );
  }

  if (titleSettings.layout === 'minimal-corner') {
    return (
      <div
        className="pointer-events-none absolute bottom-[4%] right-[4%] z-10 max-w-[30%] overflow-hidden border-t px-2.5 pt-1.5 text-right"
        style={panelStyle}
      >
        <div className="truncate font-display font-light leading-none" style={tinyTitleStyle}>
          {title}
        </div>
        {subtitle && <div className="mt-1 truncate text-[8px] tracking-[0.12em]">{subtitle}</div>}
        {detail && <div className="mt-0.5 truncate text-[7px] tracking-[0.08em]">{detail}</div>}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none relative z-10 flex w-full flex-col items-center justify-center overflow-hidden border-t-[3px] px-[7%] text-center"
      style={{ ...panelStyle, height: footerHeight }}
    >
      <div className="max-w-full truncate font-display font-light leading-none" style={titleStyle}>
        {title}
      </div>
      {subtitle && <div className="mt-2 max-w-full truncate text-[22px] tracking-[0.34em]">{subtitle}</div>}
      {detail && <div className="mt-2 max-w-full truncate text-[15px] tracking-[0.16em]">{detail}</div>}
    </div>
  );
}

export function getTitleBandHeight(
  layout: PreviewTitleSettings['layout'],
  enabled: boolean,
  mapHeight: number,
  isLandscape: boolean
): number {
  if (!enabled) return 0;
  if (layout === 'compact-bottom') {
    return Math.round(mapHeight * (isLandscape ? 0.11 : 0.095));
  }
  if (layout === 'classic-bottom') {
    return Math.round(mapHeight * (isLandscape ? 0.16 : 0.135));
  }
  return 0;
}
