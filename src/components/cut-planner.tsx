'use client';

import { useEffect, useRef, useState } from 'react';
import ClipEditor from './clip-editor';
import type { Clip, Moment } from '@/lib/types';
import { localPlan, validatePlan, type Suggestion } from '@/lib/planner';
import { sampleFrames } from '@/lib/media';
import type { VisualClip } from '@/lib/ai-planner';

interface Props { clips: Clip[]; disabled: boolean; onSave: (clip: Clip) => void; onAdd: (moments: Moment[]) => void }
type Candidate = Suggestion & { id: string; selected: boolean };

export default function CutPlanner({ clips, disabled, onSave, onAdd }: Props) {
  const [prompt, setPrompt] = useState(''), [target, setTarget] = useState(15);
  const [candidates, setCandidates] = useState<Candidate[]>([]), [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false), [mode, setMode] = useState<'local' | 'ai'>('local');
  const [consent, setConsent] = useState(false), [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/plan', { signal: abort.signal }).then(r => r.json()).then(data => setConfigured(data.configured === true)).catch(() => {});
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (running) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [running]);
  const current = candidates.find(c => c.id === editing), clip = clips.find(c => c.id === current?.clipId);
  const selected = candidates.filter(c => c.selected && clips.some(clip => clip.id === c.clipId));
  const duration = selected.reduce((sum, c) => sum + c.out - c.in, 0);

  async function suggest() {
    if (running || disabled || !clips.length) return;
    if (mode === 'local') {
      const plan = localPlan(clips, prompt, target);
      setCandidates(plan.map(s => ({ ...s, id: crypto.randomUUID(), selected: true })));
      setMessage(plan.length ? 'Review these center trims before adding them. This mode matches clip details; it does not watch your videos.' : 'No matching clip details. Try a tag or name from your library, or leave the brief blank for a starter cut.');
      return;
    }
    if (!configured || !consent || !prompt.trim() || clips.length > 12) return;
    const abort = new AbortController(); controller.current = abort; setRunning(true);
    try {
      const sampled: VisualClip[] = [];
      for (const [index, clip] of clips.entries()) {
        setMessage(`Sampling clip ${index + 1}/${clips.length}. Keep this tab visible…`);
        const frames = await sampleFrames(clip, abort.signal);
        sampled.push({ id: clip.id, name: clip.name, duration: clip.duration, tags: clip.tags.slice(0, 50).map(t => t.slice(0, 100)), notes: clip.notes, favorite: clip.favorite, frames });
      }
      abort.signal.throwIfAborted(); setMessage('AI is looking at the sampled frames and planning your cut…');
      const response = await fetch('/api/plan', { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, target, clips: sampled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'AI analysis failed.');
      const plan = validatePlan(result, sampled, target);
      setCandidates(plan.map(s => ({ ...s, id: crypto.randomUUID(), selected: true })));
      setMessage(plan.length ? 'AI suggestions are ready. Timing is approximate: review and trim each moment before adding it.' : 'AI found no relevant moments in the sampled frames. Try another brief.');
    } catch (error) {
      setMessage(abort.signal.aborted ? 'Analysis cancelled. Your footage and cut are unchanged.' : error instanceof Error ? error.message : 'AI analysis failed.');
    } finally { setRunning(false); controller.current = null; }
  }

  return <section className="planner" aria-label="Cut planner">
    <div className="planner-heading"><div><div className="eyebrow">A FIRST CUT, WITHOUT THE BLANK PAGE</div><h2>What are we making?</h2></div><label className="planner-mode">Planning mode<select value={mode} disabled={running} onChange={e => { setMode(e.target.value as 'local' | 'ai'); setConsent(false); }}><option value="local">Local · clip details</option><option value="ai" disabled={!configured}>AI · sampled frames{!configured ? ' (setup needed)' : ''}</option></select></label></div>
    <label className="planner-brief">Describe your cut<textarea rows={2} disabled={running} maxLength={1000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A warm coffee montage with morning light…" /></label>
    <div className="planner-controls"><label>Target length <strong>{target}s</strong><input type="range" disabled={running} min={5} max={120} step={5} value={target} onChange={e => setTarget(Number(e.target.value))} /></label>{running ? <button className="button secondary" onClick={() => controller.current?.abort()}>Cancel analysis</button> : <button className="button primary" disabled={disabled || !clips.length || (mode === 'ai' && (!consent || !prompt.trim() || clips.length > 12))} onClick={() => void suggest()}>{mode === 'ai' ? 'Analyze & suggest' : 'Suggest moments'} ↗</button>}</div>
    {mode === 'local' ? <p className="muted">Matches names, tags, and notes in your browser. Target length is a maximum. {!configured && 'AI frame analysis needs a server API key; see setup in the README.'}</p> : <><p className="muted">AI sees 3 still frames per clip, without audio. Review approximate trims. {clips.length > 12 ? 'Use a library of 12 clips or fewer for this first version.' : 'Up to 12 clips per request.'}</p><label className="planner-consent"><input type="checkbox" checked={consent} disabled={running} onChange={e => setConsent(e.target.checked)} />Send sampled frames, clip names, tags, notes, and this brief to OpenAI when I click Analyze. Uses my API account.</label></>}
    <p role="status" className="muted">{message}</p>
    {!!candidates.length && <><div className="suggestions">{candidates.map(candidate => {
      const source = clips.find(c => c.id === candidate.clipId); if (!source) return null;
      return <article className="suggestion" key={candidate.id}><label className="suggestion-check"><input type="checkbox" disabled={running} checked={candidate.selected} onChange={e => setCandidates(old => old.map(c => c.id === candidate.id ? { ...c, selected: e.target.checked } : c))} aria-label={`Include ${candidate.title}`} /><img src={source.thumbnail} alt="" /></label><div><h3>{candidate.title}</h3><p>{source.name} · {candidate.in.toFixed(1)}–{candidate.out.toFixed(1)}s</p><p className="muted">{candidate.reason}</p></div><button className="button secondary small" disabled={disabled || running} onClick={() => setEditing(candidate.id)}>Preview & trim</button></article>;
    })}</div><div className="planner-actions"><span>{selected.length} selected · {duration.toFixed(1)}s</span><button className="button primary" disabled={disabled || running || !selected.length} onClick={() => {
      onAdd(selected.map(({ id, clipId, in: start, out, title }) => ({ id, clipId, in: start, out, title })));
      setCandidates([]); setMessage(`${selected.length} moments added to your rough cut.`);
    }}>Add selected to cut ＋</button></div></>}
    {current && clip && <ClipEditor key={current.id} clip={clip} moment={current} onSave={onSave} onClose={() => setEditing(null)} actionLabel="Keep this trim" onAdd={moment => {
      setCandidates(old => old.map(c => c.id === current.id ? { ...c, in: moment.in, out: moment.out, title: moment.title || clip.name } : c)); setEditing(null);
    }} />}
  </section>;
}
