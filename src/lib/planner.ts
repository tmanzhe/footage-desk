import type { Clip } from './types';

export interface Suggestion { clipId: string; in: number; out: number; title: string; reason: string }
export type ClipInfo = Pick<Clip, 'id' | 'name' | 'duration' | 'tags' | 'notes' | 'favorite'>;

const stopWords = new Set('a an the make create build cut video reel montage of for with and then to my me some seconds second short long'.split(' '));
export function localPlan(clips: ClipInfo[], prompt: string, target: number): Suggestion[] {
  const words = [...new Set(prompt.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter(w => !stopWords.has(w) && !/^\d+$/.test(w));
  const ranked = clips.filter(c => Number.isFinite(c.duration) && c.duration >= .1).map((clip, index) => {
    const text = `${clip.name} ${clip.tags.join(' ')} ${clip.notes}`.toLowerCase();
    const matches = words.filter(w => new RegExp(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, 'u').test(text));
    return { clip, index, matches };
  }).filter(c => !words.length || c.matches.length).sort((a, b) => b.matches.length - a.matches.length || Number(b.clip.favorite) - Number(a.clip.favorite) || a.index - b.index).slice(0, 12);
  let remaining = Math.max(0, Math.min(120, target));
  return ranked.flatMap(({ clip, matches }, index) => {
    const length = Math.min(clip.duration, 6, remaining / Math.max(1, ranked.length - index));
    if (length < .1) return [];
    const start = (clip.duration - length) / 2;
    remaining -= length;
    return [{ clipId: clip.id, in: start, out: start + length, title: clip.name,
      reason: matches.length ? `Matched ${matches.join(', ')} in the clip details. Center trim; review the footage.` : 'Starter shot from the middle of this clip. Review the footage.' }];
  });
}

// Treat model output as untrusted: valid JSON alone does not mean valid edits.
export function validatePlan(value: unknown, clips: ClipInfo[], target: number): Suggestion[] {
  if (!value || typeof value !== 'object' || !('moments' in value) || !Array.isArray(value.moments) || value.moments.length > 12) throw new Error('The planner returned an invalid cut. Try again.');
  const result: Suggestion[] = [];
  let total = 0;
  for (const item of value.moments) {
    if (!item || typeof item !== 'object') throw new Error('Invalid suggested moment.');
    const { clipId, in: start, out: end, title, reason } = item;
    const clip = clips.find(c => c.id === clipId);
    if (!clip || typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > clip.duration || end - start < .1 - 1e-8 || typeof title !== 'string' || title.length > 160 || typeof reason !== 'string' || reason.length > 600) throw new Error('The planner suggested a missing clip or an invalid time range. Try again.');
    if (result.some(s => s.clipId === clipId && start < s.out && end > s.in)) throw new Error('The planner suggested overlapping moments. Try again.');
    total += end - start;
    result.push({ clipId, in: start, out: end, title, reason });
  }
  if (total > target + .05) throw new Error('The suggested cut exceeds your duration. Try again.');
  return result;
}
