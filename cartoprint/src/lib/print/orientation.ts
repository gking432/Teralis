export type Orientation = 'portrait' | 'landscape' | 'square';

/** Height-to-width ratio of the printed sheet. */
export const ORIENTATION_RATIO: Record<Orientation, number> = {
  portrait: 4 / 3,
  landscape: 3 / 4,
  square: 1,
};

export const ORIENTATIONS: Orientation[] = ['portrait', 'landscape', 'square'];

export function isValidOrientation(value: string | null | undefined): value is Orientation {
  return value === 'portrait' || value === 'landscape' || value === 'square';
}
