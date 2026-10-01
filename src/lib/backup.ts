import { inspect } from './media';
import type { Clip, Moment, Project } from './types';

function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob.slice(0, blob.size, blob.type.split(';')[0] || 'video/webm'));
  });
}
export async function createBackup(project: Project) {
  const clips = [];
  for (const { blob, ...details } of project.clips) clips.push({ ...details, data: await dataURL(blob) });
  return new Blob([JSON.stringify({ version: 1, clips, moments: project.moments })], { type: 'application/json' });
}
interface BackupClip { id: string; data: string; name: string; tags: string[]; notes: string; favorite: boolean }
interface Backup { version: number; clips: BackupClip[]; moments: Moment[] }
export async function restoreBackup(file: File): Promise<Project> {
  const project: Backup = JSON.parse(await file.text());
  if (project.version !== 1 || !Array.isArray(project.clips) || !Array.isArray(project.moments)) throw new Error('Not a Footage Desk backup.');
  const clips: Clip[] = [], mapping = new Map<string, string>();
  for (const item of project.clips) {
    if (typeof item.id !== 'string' || mapping.has(item.id) || typeof item.data !== 'string' || !/^data:video\/[a-z0-9.+-]+;base64,/i.test(item.data)) throw new Error('Invalid video in backup.');
    const blob = await (await fetch(item.data)).blob(), details = await inspect(blob), id = crypto.randomUUID(); mapping.set(item.id, id);
    clips.push({ id, blob, ...details, name: String(item.name || 'Restored clip').slice(0, 160), tags: Array.isArray(item.tags) ? item.tags.map(t => String(t).slice(0, 100)).slice(0, 50) : [], notes: String(item.notes || '').slice(0, 5000), favorite: !!item.favorite });
  }
  const moments = project.moments.map(item => {
    const id = mapping.get(item.clipId), clip = clips.find(c => c.id === id);
    if (!clip || !Number.isFinite(item.in) || !Number.isFinite(item.out) || item.in < 0 || item.out > clip.duration + .1 || item.out - item.in < .1 - 1e-6) throw new Error('Invalid moment in backup.');
    return { id: crypto.randomUUID(), clipId: clip.id, in: item.in, out: Math.min(item.out, clip.duration), title: String(item.title || '').slice(0, 160) };
  });
  return { clips, moments };
}
