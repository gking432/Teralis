export type PreviewTitleLayout =
  | 'classic-bottom'
  | 'compact-bottom'
  | 'top-left'
  | 'side-rail'
  | 'minimal-corner';

export interface PreviewTitleSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  detail: string;
  layout: PreviewTitleLayout;
  // When true, the title band paints with ink as the background and land as
  // the text/divider color (the inverse of the default). Useful for matching
  // the ink frame on bordered city prints.
  inverted: boolean;
}

export interface TitleLayoutOption {
  value: PreviewTitleLayout;
  label: string;
  desc: string;
}

export const TITLE_LAYOUTS: TitleLayoutOption[] = [
  { value: 'classic-bottom', label: 'Poster Footer', desc: 'Large title block below the map' },
  { value: 'compact-bottom', label: 'Clean Footer', desc: 'Smaller centered title bar' },
  { value: 'top-left', label: 'Gallery Label', desc: 'Floating label in the corner' },
  { value: 'side-rail', label: 'Side Rail', desc: 'Editorial vertical title' },
  { value: 'minimal-corner', label: 'Quiet Corner', desc: 'Small title for map-first prints' },
];

export const DEFAULT_TITLE_LAYOUT: PreviewTitleLayout = 'classic-bottom';

export function isFooterTitleLayout(layout: PreviewTitleLayout): boolean {
  return layout === 'classic-bottom' || layout === 'compact-bottom';
}

export type TitleStyle = 'standard' | 'inverted' | 'translucent';

export interface TitleBlockSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  detail: string;
  style: TitleStyle;
  x: number;       // left edge, normalized [0,1] relative to print width
  y: number;       // top edge, normalized [0,1] relative to print height
  w: number;       // width, normalized [0,1]
  h: number;       // height, normalized [0,1]
  rotation: number; // degrees
}

export function defaultTitleBlock(
  title: string,
  subtitle: string,
  detail: string,
): TitleBlockSettings {
  return {
    enabled: true,
    title,
    subtitle,
    detail,
    style: 'standard',
    x: 0,
    y: 0.79,
    w: 1.0,
    h: 0.15,
    rotation: 0,
  };
}
