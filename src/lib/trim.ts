import type { Selection } from './types';

export function moveTrimHandle(duration: number, start: number, end: number, edge: 'in' | 'out', value: number): Selection {
  const gap = Math.min(.1, duration);
  start = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, duration - gap));
  end = Math.max(start + gap, Math.min(Number.isFinite(end) ? end : duration, duration));
  if (edge === 'in') start = Math.max(0, Math.min(value, end - gap));
  else end = Math.max(start + gap, Math.min(value, duration));
  return { in: start, out: end };
}

export function validSelection(selection: Selection, duration: number) {
  return Number.isFinite(selection.in) && Number.isFinite(selection.out) && selection.in >= 0 &&
    selection.out <= duration + 1e-6 && selection.out - selection.in >= .1 - 1e-6;
}
