declare module 'martinez-polygon-clipping' {
  export function intersection(subject: unknown, clipping: unknown): unknown;
  export function diff(subject: unknown, clipping: unknown): unknown;
  export function union(subject: unknown, clipping: unknown): unknown;
  export function xor(subject: unknown, clipping: unknown): unknown;
}
