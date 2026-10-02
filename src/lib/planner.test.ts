import { expect, test } from 'bun:test';
import { localPlan, validatePlan, type ClipInfo } from './planner';
const clips: ClipInfo[] = [
  { id: 'a', name: 'Coffee pour', tags: ['cafe'], notes: '', duration: 20, favorite: false },
  { id: 'b', name: 'Street', tags: [], notes: 'Walking home', duration: 10, favorite: true },
];
test('local planner matches details and keeps trims in bounds', () => {
  const plan = localPlan(clips, 'make a coffee reel', 15);
  expect(plan).toHaveLength(1); expect(plan[0].clipId).toBe('a');
  expect(plan[0].in).toBe(7); expect(plan[0].out).toBe(13);
  expect(localPlan(clips, 'surfing', 15)).toEqual([]);
});
test('local starter cut respects target and favorites', () => {
  const plan = localPlan(clips, 'make a short montage', 5);
  expect(plan[0].clipId).toBe('b');
  expect(plan.reduce((sum, s) => sum + s.out - s.in, 0)).toBeLessThanOrEqual(5);
});
test('rejects invented IDs, bad ranges, overlap, and excess duration', () => {
  const shot = { clipId: 'a', in: 1, out: 5, title: 'Opening', reason: 'A pour.' };
  expect(validatePlan({ moments: [shot] }, clips, 10)).toEqual([shot]);
  for (const bad of [{ ...shot, clipId: 'fake' }, { ...shot, out: 25 }, { ...shot, in: NaN }, { ...shot, in: -1 }]) expect(() => validatePlan({ moments: [bad] }, clips, 30)).toThrow();
  expect(() => validatePlan({ moments: [shot, shot] }, clips, 30)).toThrow();
  expect(() => validatePlan({ moments: [shot] }, clips, 2)).toThrow();
});
