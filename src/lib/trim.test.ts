import { describe, expect, test } from 'bun:test';
import { moveTrimHandle, validSelection } from './trim';

describe('trimming', () => {
  test('handles stop at the clip boundaries', () => {
    expect(moveTrimHandle(10, 2, 8, 'in', -5)).toEqual({ in: 0, out: 8 });
    expect(moveTrimHandle(10, 2, 8, 'out', 15)).toEqual({ in: 2, out: 10 });
  });
  test('handles cannot cross', () => {
    expect(moveTrimHandle(10, 2, 8, 'in', 9)).toEqual({ in: 7.9, out: 8 });
    expect(moveTrimHandle(10, 2, 8, 'out', 1)).toEqual({ in: 2, out: 2.1 });
  });
  test('fractional endpoints remain usable', () => {
    for (const duration of [.3, 2.968756, 120]) {
      for (const edge of ['in', 'out'] as const) {
        for (const value of [-100, 0, duration / 2, duration, duration + 100]) {
          expect(validSelection(moveTrimHandle(duration, 0, duration, edge, value), duration)).toBe(true);
        }
      }
    }
  });
  test('rejects invalid selections', () => {
    expect(validSelection({ in: 4, out: 3 }, 10)).toBe(false);
    expect(validSelection({ in: 0, out: 11 }, 10)).toBe(false);
    expect(validSelection({ in: NaN, out: 3 }, 10)).toBe(false);
  });
});
