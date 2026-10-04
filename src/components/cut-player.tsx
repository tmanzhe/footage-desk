'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Moment } from '@/lib/types';
import { time } from '@/lib/types';
import { locate, sequence } from '@/lib/sequence';

export default function CutPlayer({ clips, moments, disabled }: { clips: Clip[]; moments: Moment[]; disabled: boolean }) {
  const shots = useMemo(() => sequence(clips, moments), [clips, moments]);
  const video = useRef<HTMLVideoElement>(null), ready = useRef(false), advancing = useRef(false);
  const intendedPlay = useRef(false), desiredTime = useRef<number | null>(null), generation = useRef(0);
  const [index, setIndex] = useState(0), [position, setPosition] = useState(0), [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [muted, setMuted] = useState(false);
  const shot = shots[index], last = shots[shots.length - 1], total = last ? last.start + last.length : 0;

  function pause() { intendedPlay.current = false; setPlaying(false); video.current?.pause(); }
  async function play() {
    if (!video.current || !ready.current || !intendedPlay.current) return;
    const token = generation.current;
    try { await video.current.play(); }
    catch (e) {
      if (token !== generation.current || !intendedPlay.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      pause(); setError('Playback could not start. Try pressing Play again, or check the source video.');
    }
  }

  useEffect(() => {
    const player = video.current; if (!player || !shot) return;
    generation.current++; ready.current = false; advancing.current = false; player.pause(); setLoading(true); setError('');
    const url = URL.createObjectURL(shot.clip.blob);
    const loaded = () => {
      ready.current = true;
      player.currentTime = Math.min(desiredTime.current ?? shot.moment.in, Math.max(0, shot.clip.duration - .001));
      desiredTime.current = null; setLoading(false); void play();
    };
    const failed = () => { setLoading(false); pause(); setError('This shot could not be decoded. Open its source clip or try an H.264 MP4.'); };
    const timer = setTimeout(() => { if (!ready.current) failed(); }, 20000);
    player.addEventListener('loadeddata', loaded, { once: true }); player.addEventListener('error', failed);
    player.src = url; player.load();
    return () => { generation.current++; clearTimeout(timer); ready.current = false; player.pause(); player.removeEventListener('loadeddata', loaded); player.removeEventListener('error', failed); player.removeAttribute('src'); player.load(); URL.revokeObjectURL(url); };
  }, [shot]);

  useEffect(() => { if (disabled) pause(); }, [disabled]);
  useEffect(() => {
    if (!playing || !shot) return;
    let frame = 0;
    const update = () => {
      const player = video.current;
      if (!player || !intendedPlay.current) return;
      if (ready.current && !player.seeking && !advancing.current) {
        if (player.ended || player.currentTime >= shot.moment.out - .015) {
          advancing.current = true; player.pause();
          if (index + 1 < shots.length) {
            desiredTime.current = shots[index + 1].moment.in; setPosition(shots[index + 1].start); setIndex(index + 1);
          } else { setPosition(total); pause(); }
          return;
        }
        setPosition(shot.start + Math.max(0, Math.min(shot.length, player.currentTime - shot.moment.in)));
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update); return () => cancelAnimationFrame(frame);
  }, [playing, shot, shots, index, total]);

  function jump(value: number, keepPlaying = false) {
    const target = locate(shots, value); if (!target) return;
    if (!keepPlaying) pause();
    desiredTime.current = target.sourceTime; setPosition(target.position); setError('');
    if (target.index === index && video.current && ready.current) {
      video.current.currentTime = Math.min(target.sourceTime, Math.max(0, shots[index].clip.duration - .001));
      desiredTime.current = null; advancing.current = false;
      if (keepPlaying) void play();
    } else setIndex(target.index);
  }

  if (!shot) return null;
  return <section className="cut-player" aria-label="Full cut preview">
    <div className="cut-screen"><video ref={video} playsInline muted={muted} aria-label="Rough cut video" onClick={() => {
      if (disabled) return;
      if (playing) pause(); else { intendedPlay.current = true; setPlaying(true); if (position >= total - .02) jump(0, true); else void play(); }
    }} /><span className="cut-shot-label">{index + 1}/{shots.length} · {shot.moment.title || shot.clip.name}</span>{loading && <span className="cut-loading" role="status">Loading shot…</span>}</div>
    <div className="cut-transport"><button className="button primary" disabled={disabled || !!error} onClick={() => {
      if (playing) pause(); else { intendedPlay.current = true; setPlaying(true); if (position >= total - .02) jump(0, true); else void play(); }
    }}>{playing ? 'Ⅱ Pause' : position >= total - .02 ? '↻ Replay cut' : '▶ Play cut'}</button><button className="button secondary" disabled={disabled} onClick={() => jump(0)}>Restart</button><span>{time(position)} / {time(total)}</span><button className="button secondary cut-mute" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button></div>
    <input className="cut-scrubber" aria-label="Scrub rough cut" type="range" min={0} max={total} step={.01} value={position} disabled={disabled} onChange={e => jump(Number(e.target.value))} />
    <div className="cut-shots">{shots.map((s, i) => <button key={s.moment.id} className={i === index ? 'current' : ''} style={{ flexGrow: s.length }} disabled={disabled} onClick={() => jump(s.start)} aria-label={`Jump to shot ${i + 1}: ${s.moment.title || s.clip.name}`} aria-current={i === index ? 'true' : undefined}><img src={s.clip.thumbnail} alt="" /><span>{i + 1} · {s.length.toFixed(1)}s</span></button>)}</div>
    <p className="muted" role="status">{error || 'Click a shot or slide the bar to scrub. Preview may pause briefly when switching source files.'}</p>
  </section>;
}
