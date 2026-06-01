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
