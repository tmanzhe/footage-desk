'use client';

import { useState } from 'react';
import ClipEditor from './clip-editor';
import type { Clip, Moment } from '@/lib/types';
import { localPlan, type Suggestion } from '@/lib/planner';

interface Props { clips: Clip[]; disabled: boolean; onSave: (clip: Clip) => void; onAdd: (moments: Moment[]) => void }
type Candidate = Suggestion & { id: string; selected: boolean };

export default function CutPlanner({ clips, disabled, onSave, onAdd }: Props) {
  const [prompt, setPrompt] = useState(''), [target, setTarget] = useState(15);
  const [candidates, setCandidates] = useState<Candidate[]>([]), [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const current = candidates.find(c => c.id === editing), clip = clips.find(c => c.id === current?.clipId);
  const selected = candidates.filter(c => c.selected && clips.some(clip => clip.id === c.clipId));
  const duration = selected.reduce((sum, c) => sum + c.out - c.in, 0);

  function suggest() {
    const plan = localPlan(clips, prompt, target);
    setCandidates(plan.map(s => ({ ...s, id: crypto.randomUUID(), selected: true })));
    setMessage(plan.length ? 'Review these center trims before adding them. This mode matches clip details; it does not watch your videos.' : 'No matching clip details. Try a tag or name from your library, or leave the brief blank for a starter cut.');
  }

  return <section className="planner" aria-label="Cut planner">
    <div className="planner-heading"><div><div className="eyebrow">A FIRST CUT, WITHOUT THE BLANK PAGE</div><h2>What are we making?</h2></div><span className="local-badge">LOCAL PLANNER</span></div>
    <label className="planner-brief">Describe your cut<textarea rows={2} maxLength={1000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A warm coffee montage with morning light…" /></label>
    <div className="planner-controls"><label>Target length <strong>{target}s</strong><input type="range" min={5} max={120} step={5} value={target} onChange={e => setTarget(Number(e.target.value))} /></label><button className="button primary" disabled={disabled || !clips.length} onClick={suggest}>Suggest moments ↗</button></div>
    <p className="muted">Uses names, tags, and notes. All processing stays in your browser. Target length is a maximum.</p>
    <p role="status" className="muted">{message}</p>
    {!!candidates.length && <><div className="suggestions">{candidates.map(candidate => {
      const source = clips.find(c => c.id === candidate.clipId); if (!source) return null;
      return <article className="suggestion" key={candidate.id}><label className="suggestion-check"><input type="checkbox" checked={candidate.selected} onChange={e => setCandidates(old => old.map(c => c.id === candidate.id ? { ...c, selected: e.target.checked } : c))} aria-label={`Include ${candidate.title}`} /><img src={source.thumbnail} alt="" /></label><div><h3>{candidate.title}</h3><p>{source.name} · {candidate.in.toFixed(1)}–{candidate.out.toFixed(1)}s</p><p className="muted">{candidate.reason}</p></div><button className="button secondary small" disabled={disabled} onClick={() => setEditing(candidate.id)}>Preview & trim</button></article>;
    })}</div><div className="planner-actions"><span>{selected.length} selected · {duration.toFixed(1)}s</span><button className="button primary" disabled={disabled || !selected.length} onClick={() => {
      onAdd(selected.map(({ id, clipId, in: start, out, title }) => ({ id, clipId, in: start, out, title })));
      setCandidates([]); setMessage(`${selected.length} moments added to your rough cut.`);
    }}>Add selected to cut ＋</button></div></>}
    {current && clip && <ClipEditor key={current.id} clip={clip} moment={current} onSave={onSave} onClose={() => setEditing(null)} actionLabel="Keep this trim" onAdd={moment => {
      setCandidates(old => old.map(c => c.id === current.id ? { ...c, in: moment.in, out: moment.out, title: moment.title || clip.name } : c)); setEditing(null);
    }} />}
  </section>;
}
