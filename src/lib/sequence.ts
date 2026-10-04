import type { Clip, Moment } from './types';
import { validSelection } from './trim';

export interface Shot { clip: Clip; moment: Moment; start: number; length: number }
export function sequence(clips: Clip[], moments: Moment[]): Shot[] {
  let start = 0;
  return moments.flatMap(moment => {
    const clip = clips.find(c => c.id === moment.clipId);
    if (!clip || !validSelection(moment, clip.duration)) return [];
    const length = moment.out - moment.in;
    const shot = { clip, moment, start, length }; start += length;
    return [shot];
  });
}
export function locate(shots: Shot[], value: number) {
  if (!shots.length) return null;
  const last = shots[shots.length - 1], total = last.start + last.length;
  const position = Math.max(0, Math.min(total, Number.isFinite(value) ? value : 0));
  const found = shots.findIndex(s => position < s.start + s.length);
  const index = found < 0 ? shots.length - 1 : found, shot = shots[index];
  return { index, position, sourceTime: shot.moment.in + position - shot.start };
}

export function moveMoment(moments: Moment[], fromId: string, toId: string) {
  const from = moments.findIndex(m => m.id === fromId), to = moments.findIndex(m => m.id === toId);
  if (from < 0 || to < 0 || from === to) return moments;
  const next = [...moments], [moved] = next.splice(from, 1); next.splice(to, 0, moved);
  return next;
}
