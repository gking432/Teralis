export type PreviewTitleLayout =
  | 'classic-bottom'
  | 'compact-bottom'
  | 'top-left'
  | 'side-rail'
  | 'minimal-corner'
  | 'freeform';

export type TitleStyle = 'standard' | 'inverted' | 'translucent';

export interface PreviewTitleSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  detail: string;
  layout: PreviewTitleLayout;
  inverted: boolean;
  style?: TitleStyle;
  // Resolved hex color to use for glass/translucent text. Caller computes this
  // from glassFill ('land'|'ink') + the active color scheme so the canvas
  // renderer doesn't need to re-derive it.
  glassTextColor?: string;
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
  { value: 'freeform', label: 'Custom Place', desc: 'Drag, resize, and rotate freely' },
];

export const DEFAULT_TITLE_LAYOUT: PreviewTitleLayout = 'classic-bottom';

export function isFooterTitleLayout(layout: PreviewTitleLayout): boolean {
  return layout === 'classic-bottom' || layout === 'compact-bottom';
}

export function effectiveTitleStyle(s: Pick<PreviewTitleSettings, 'inverted' | 'style'>): TitleStyle {
  return s.style ?? (s.inverted ? 'inverted' : 'standard');
}

export interface TitleBlockSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  detail: string;
  layout: PreviewTitleLayout;
  style: TitleStyle;
  glassFill: 'land' | 'ink'; // which scheme color to use for glass/translucent text
  x: number;       // left edge, normalized [0,1] relative to print width (freeform only)
  y: number;       // top edge, normalized [0,1] relative to print height (freeform only)
  w: number;       // width, normalized [0,1] (freeform only)
  h: number;       // height, normalized [0,1] (freeform only)
  rotation: number; // degrees (freeform only)
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
    layout: 'classic-bottom',
    style: 'standard',
    glassFill: 'land',
    x: 0,
    y: 0.79,
    w: 1.0,
    h: 0.15,
    rotation: 0,
  };
}
