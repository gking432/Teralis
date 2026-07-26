import type { BorderWeight } from '@/lib/print/printRender';
import type { TitleAlign, TitlePanel, TitleSlot } from '@/lib/print/title';

/**
 * Layout, and only layout: where the words sit and how the sheet is framed.
 *
 * Kept deliberately small. Every entry here is a composition that works on its
 * own terms, so the user cannot land on one that hides the title behind the
 * densest part of the map — which is what happened when a translucent label
 * was offered as a generic placement and dropped over downtown.
 */

export type AutoPlacement = 'water';

export interface Layout {
  id: string;
  name: string;
  blurb: string;
  titleSlot: TitleSlot;
  titlePanel: TitlePanel;
  align: TitleAlign;
  border: BorderWeight;
  /**
   * Placement that has to be computed from the artwork rather than fixed in
   * advance — the label goes wherever the map leaves room for it.
   */
  autoPlace?: AutoPlacement;
  /** Layouts with no title at all still need to be selectable. */
  titleEnabled: boolean;
}

export const LAYOUTS: Layout[] = [
  {
    id: 'footer',
    name: 'Footer',
    blurb: 'Title in a band below the map',
    titleSlot: 'footer',
    titlePanel: 'solid',
    align: 'center',
    border: 'thin',
    titleEnabled: true,
  },
  {
    id: 'poster',
    name: 'Poster',
    blurb: 'Tall band, larger type',
    titleSlot: 'footer-tall',
    titlePanel: 'solid',
    align: 'center',
    border: 'medium',
    titleEnabled: true,
  },
  {
    id: 'plaque',
    name: 'Plaque',
    blurb: 'Small label in the corner',
    titleSlot: 'top-left',
    titlePanel: 'solid',
    align: 'left',
    border: 'thin',
    titleEnabled: true,
  },
  {
    id: 'on-water',
    name: 'On water',
    blurb: 'Set into the largest lake or bay',
    titleSlot: 'free',
    // No panel: the words sit directly on the water in a colour that contrasts
    // it, which is the whole point of the treatment.
    titlePanel: 'none',
    align: 'center',
    border: 'none',
    autoPlace: 'water',
    titleEnabled: true,
  },
  {
    id: 'bare',
    name: 'Bare',
    blurb: 'Map only, no words',
    titleSlot: 'footer',
    titlePanel: 'solid',
    align: 'center',
    border: 'none',
    titleEnabled: false,
  },
];

export const DEFAULT_LAYOUT = LAYOUTS[0];

export function getLayout(id: string | undefined | null): Layout {
  return LAYOUTS.find((layout) => layout.id === id) ?? DEFAULT_LAYOUT;
}
