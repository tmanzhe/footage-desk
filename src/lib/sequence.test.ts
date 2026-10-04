import { expect, test } from 'bun:test';
import type { Clip, Moment } from './types';
import { locate, moveMoment, sequence } from './sequence';

const clip: Clip = { id: 'clip', name: 'Shot', duration: 20, blob: new Blob(), thumbnail: '', tags: [], notes: '', favorite: false, width: 320, height: 180 };
const moments: Moment[] = [{ id: 'a', clipId: 'clip', in: 5, out: 8, title: '' }, { id: 'b', clipId: 'clip', in: 12, out: 16, title: '' }];
test('maps cut time into source time, including the exact cut boundary', () => {
  const shots = sequence([clip], moments);
  expect(locate(shots, 0)).toEqual({ index: 0, position: 0, sourceTime: 5 });
  expect(locate(shots, 3)).toEqual({ index: 1, position: 3, sourceTime: 12 });
  expect(locate(shots, 5)).toEqual({ index: 1, position: 5, sourceTime: 14 });
  expect(locate(shots, 100)).toEqual({ index: 1, position: 7, sourceTime: 16 });
  expect(locate(shots, -3)?.sourceTime).toBe(5);
});
test('invalid or missing footage does not corrupt the sequence', () => {
  const shots = sequence([clip], [...moments, { ...moments[0], clipId: 'missing' }, { ...moments[0], out: 30 }]);
  expect(shots).toHaveLength(2); expect(shots[1].start).toBe(3);
  expect(locate([], 2)).toBeNull();
});
test('reordering preserves every shot and its trim', () => {
  expect(moveMoment(moments, 'a', 'b')).toEqual([moments[1], moments[0]]);
  expect(moveMoment(moments, 'b', 'a')).toEqual([moments[1], moments[0]]);
  expect(moveMoment(moments, 'missing', 'b')).toBe(moments);
});
