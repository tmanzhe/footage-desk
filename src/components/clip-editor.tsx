'use client';

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import type { Clip, Moment, Selection } from '@/lib/types';
import { time } from '@/lib/types';
import { moveTrimHandle, validSelection } from '@/lib/trim';

interface Props {
  clip: Clip;
  moment?: Moment;
  onClose: () => void;
  onSave: (clip: Clip) => void;
  onAdd: (moment: Moment) => void;
  onDelete?: () => void;
  actionLabel?: string;
}

export default function ClipEditor({ clip, moment, onClose, onSave, onAdd, onDelete, actionLabel = '＋ Add moment to cut' }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), strip = useRef<HTMLDivElement>(null);
  const [url, setURL] = useState('');
  const [selection, setSelection] = useState<Selection>({ in: moment?.in ?? 0, out: moment?.out ?? clip.duration });
  const [playhead, setPlayhead] = useState(0);
  const [name, setName] = useState(clip.name), [tags, setTags] = useState(clip.tags.join(', ')), [notes, setNotes] = useState(clip.notes);
  const [title, setTitle] = useState(moment?.title || ''), [message, setMessage] = useState('');
  const valid = validSelection(selection, clip.duration);

  useEffect(() => {
    const objectURL = URL.createObjectURL(clip.blob); setURL(objectURL);
    dialog.current?.showModal();
    return () => { URL.revokeObjectURL(objectURL); };
  }, [clip.blob]);

  function move(edge: 'in' | 'out', value: number) {
    const next = moveTrimHandle(clip.duration, selection.in, selection.out, edge, value);
    setSelection(next);
    if (video.current) {
      video.current.pause(); video.current.currentTime = Math.min(next[edge], Math.max(0, clip.duration - .001));
      setPlayhead(video.current.currentTime);
    }
  }
  function pointer(edge: 'in' | 'out', event: PointerEvent<HTMLButtonElement>) {
    const bounds = strip.current?.getBoundingClientRect(); if (!bounds) return;
    move(edge, (event.clientX - bounds.left) / bounds.width * clip.duration);
  }
  function keyboard(edge: 'in' | 'out', event: KeyboardEvent<HTMLButtonElement>) {
    const value = selection[edge], step = event.shiftKey ? 1 : .1;
    const keys: Record<string, number> = { ArrowLeft: value - step, ArrowDown: value - step, ArrowRight: value + step, ArrowUp: value + step, Home: 0, End: clip.duration };
    if (event.key in keys) { event.preventDefault(); move(edge, keys[event.key]); }
  }
  function save() {
    onSave({ ...clip, name: name.trim() || 'Untitled clip', tags: [...new Set(tags.split(',').map(s => s.trim()).filter(Boolean))], notes: notes.trim() });
  }
  function close() { video.current?.pause(); dialog.current?.close(); }

  return <dialog ref={dialog} id="editor" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="editor-header"><div><span className="eyebrow">CLIP INSPECTOR</span><h2>{name}</h2></div><button className="icon-button" aria-label="Close inspector" onClick={close}>✕</button></div>
    <div className="editor-layout">
      <div className="player-column">
        <video id="preview" ref={video} src={url || undefined} controls playsInline
          onLoadedData={() => { if (video.current && moment) video.current.currentTime = moment.in; }}
          onTimeUpdate={() => { if (video.current) { setPlayhead(video.current.currentTime); if (moment && video.current.currentTime >= selection.out) video.current.pause(); } }} />
        <div className="trim-header"><span>SELECT YOUR MOMENT</span><span>{valid ? `${(selection.out - selection.in).toFixed(1)}s selected` : 'Choose a valid range'}</span></div>
        <div className="trim-timeline" ref={strip} aria-label="Clip timeline" style={{ backgroundImage: `url(${clip.thumbnail})` }}
          onClick={event => {
            if ((event.target as HTMLElement).closest('.trim-handle') || !video.current || !strip.current) return;
            const bounds = strip.current.getBoundingClientRect();
            video.current.currentTime = Math.max(0, Math.min(clip.duration - .001, (event.clientX - bounds.left) / bounds.width * clip.duration));
            setPlayhead(video.current.currentTime);
          }}>
          <div className="trim-selection" style={{ marginLeft: `${selection.in / clip.duration * 100}%`, width: `${(selection.out - selection.in) / clip.duration * 100}%` }} />
          <div className="trim-playhead" style={{ left: `${playhead / clip.duration * 100}%` }} />
          {(['in', 'out'] as const).map(edge => <button key={edge} className="trim-handle" role="slider" aria-label={edge === 'in' ? 'Trim start' : 'Trim end'}
            aria-valuemin={edge === 'in' ? 0 : Math.min(clip.duration, selection.in + .1)}
            aria-valuemax={edge === 'in' ? Math.max(0, selection.out - .1) : clip.duration}
            aria-valuenow={selection[edge]} aria-valuetext={`${selection[edge].toFixed(2)} seconds`}
            style={{ left: `${selection[edge] / clip.duration * 100}%` }} onKeyDown={event => keyboard(edge, event)}
            onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); pointer(edge, event); }}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pointer(edge, event); }}
            onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><span>{edge.toUpperCase()}</span></button>)}
        </div>
        <div className="timeline-times"><span>0:00</span><span>{time(clip.duration)}</span></div>
        <p className="muted">Drag the IN and OUT handles to trim. Click the strip to preview a point. Arrow keys move a focused handle.</p>
        <div className="trim-controls">
          <label>In <input type="number" min="0" max={clip.duration} step="0.01" value={Number(selection.in.toFixed(2))} onChange={e => setSelection({ ...selection, in: Number(e.target.value) })} /></label>
          <button className="button small secondary" onClick={() => move('in', video.current?.currentTime || 0)}>Set in at playhead</button>
          <label>Out <input type="number" min="0" max={clip.duration} step="0.01" value={Number(selection.out.toFixed(2))} onChange={e => setSelection({ ...selection, out: Number(e.target.value) })} /></label>
          <button className="button small secondary" onClick={() => move('out', video.current?.currentTime || 0)}>Set out at playhead</button>
        </div>
      </div>
      <div className="details-column">
        <label>Clip name<input maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Tags <span>separate with commas</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="coffee, close-up, morning" maxLength={500} /></label>
        <label>Notes<textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What makes this shot a keeper?" maxLength={5000} /></label>
        <label>Moment title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Opening shot" maxLength={160} /></label>
        <button className="button primary full" disabled={!valid} onClick={() => {
          save(); onAdd({ id: moment?.id || crypto.randomUUID(), clipId: clip.id, ...selection, title: title.trim() }); setMessage('Moment saved. Open Rough cut to arrange and export it.');
        }}>{actionLabel}</button>
        <button className="button secondary full" onClick={() => { save(); setMessage('Clip details saved.'); }}>Save clip details</button>
        {onDelete && <button className="delete-button" onClick={() => {
          if (confirm(`Remove “${clip.name}” and its moments? Your original file stays on your device.`)) { video.current?.pause(); onDelete(); }
        }}>Remove clip from library</button>}
        <p role="status" className="muted">{message}</p>
      </div>
    </div>
  </dialog>;
}
