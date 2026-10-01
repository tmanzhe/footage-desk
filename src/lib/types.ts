export interface Clip {
  id: string;
  blob: Blob;
  name: string;
  tags: string[];
  notes: string;
  favorite: boolean;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
}
export interface Moment { id: string; clipId: string; in: number; out: number; title: string }
export interface Project { clips: Clip[]; moments: Moment[] }
export interface Selection { in: number; out: number }
export function time(seconds: number) {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
