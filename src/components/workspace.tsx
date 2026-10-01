'use client';

import { useEffect, useRef, useState } from 'react';
import ClipEditor from './clip-editor';
import type { Clip, Moment } from '@/lib/types';
import { time } from '@/lib/types';
import { download, inspect, renderCut, sampleVideo } from '@/lib/media';
import { createBackup, restoreBackup } from '@/lib/backup';
import { loadProject, openDatabase, saveProject } from '@/lib/storage';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

export default function Workspace() {
  const [clips, setClips] = useState<Clip[]>([]), [moments, setMoments] = useState<Moment[]>([]);
  const [view, setView] = useState<'library' | 'cut'>('library');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'used'>('all'), [query, setQuery] = useState('');
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [dropping, setDropping] = useState(false);
  const [editing, setEditing] = useState<{ id: string; moment?: Moment } | null>(null);
  const [exporting, setExporting] = useState(false), [progress, setProgress] = useState({ seconds: 0, total: 0, index: 0 });
  const files = useRef<HTMLInputElement>(null), restore = useRef<HTMLInputElement>(null), exportDialog = useRef<HTMLDialogElement>(null);
  const db = useRef<IDBDatabase | null>(null), controller = useRef<AbortController | null>(null), busyRef = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        const database = await openDatabase();
        if (!mounted) { database.close(); return; }
        db.current = database; const saved = await loadProject(database);
        if (!mounted) return;
        if (saved) { setClips(saved.clips); setMoments(saved.moments); }
      } catch { if (mounted) setStatus('Browser storage is unavailable. Download a backup before closing this page.'); }
      if (mounted) setReady(true);
    }
    void initialize();
    return () => { mounted = false; db.current?.close(); db.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !db.current) return;
    const database = db.current;
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveProject(database, { clips, moments })).catch(() => setStatus('Could not save to browser storage. Download a backup before closing this page.'));
  }, [clips, moments, ready]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (busy || exporting) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [busy, exporting]);

  useEffect(() => {
    if (exporting && !exportDialog.current?.open) exportDialog.current?.showModal();
    if (!exporting && exportDialog.current?.open) exportDialog.current?.close();
  }, [exporting]);

  const shown = clips.filter(clip => {
    if (filter === 'favorites' && !clip.favorite) return false;
    if (filter === 'used' && !moments.some(m => m.clipId === clip.id)) return false;
    return `${clip.name} ${clip.tags.join(' ')} ${clip.notes}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const activeClip = clips.find(c => c.id === editing?.id);
  const cutDuration = moments.reduce((sum, moment) => sum + moment.out - moment.in, 0);
  const disabled = busy || exporting || !ready;

  function begin() { if (busyRef.current || exporting || !ready) return false; busyRef.current = true; setBusy(true); return true; }
  function finish() { busyRef.current = false; setBusy(false); }

  async function importFiles(source: FileList | File[]) {
    if (!begin()) return;
    const videos = [...source].filter(f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv)$/i.test(f.name));
    let count = 0; const failures: string[] = [];
    try {
      for (const [index, file] of videos.entries()) {
        setStatus(`Importing ${index + 1}/${videos.length}: ${file.name}`);
        try {
          const details = await inspect(file);
          const clip: Clip = { id: crypto.randomUUID(), blob: file, ...details, name: file.name.replace(/\.[^.]+$/, ''), tags: [], notes: '', favorite: false };
          setClips(old => [...old, clip]); count++;
        } catch (error) { failures.push(`${file.name}: ${errorMessage(error)}`); }
      }
      setStatus(videos.length ? `${count} clips imported.${failures.length ? ` ${failures.join(' ')}` : ' Open one to select your first moment.'}` : 'Choose video files such as MP4, MOV, or WebM.');
    } finally { finish(); if (files.current) files.current.value = ''; }
  }

  async function demo() {
    if (!begin()) return;
    try {
      for (let i = 0; i < 3; i++) {
        setStatus(`Creating sample clip ${i + 1}/3. Keep this tab visible…`);
        const blob = await sampleVideo(i), details = await inspect(blob);
        const clip: Clip = { id: crypto.randomUUID(), blob, ...details, name: ['Morning light', 'A quieter moment', 'The closing scene'][i], tags: ['sample', ['warm', 'green', 'soft'][i]], notes: 'Generated animated sample footage. Replace it with your own videos.', favorite: i === 0 };
        setClips(old => [...old, clip]);
      }
      setStatus('Three generated samples are ready. Open one and drag the trim handles to select a moment.');
    } catch (error) { setStatus(errorMessage(error)); }
    finally { finish(); }
  }

  async function exportCut() {
    if (disabled || !moments.length) return;
    controller.current = new AbortController(); setProgress({ seconds: 0, total: cutDuration, index: 0 }); setExporting(true);
    try {
      const result = await renderCut(clips, moments, controller.current.signal, (seconds, total, index) => setProgress({ seconds, total, index }));
      if (result) { download(result.blob, `footage-desk-cut-${new Date().toISOString().slice(0, 10)}.${result.extension}`); setStatus('Your rough cut is ready. The video download has started.'); }
      else setStatus('Render cancelled. Your project is still here.');
    } catch (error) { setStatus(`Export failed: ${errorMessage(error)}`); }
    finally { setExporting(false); }
  }

  async function backup() {
    if (!begin()) return;
    try { setStatus('Preparing backup with your video files…'); download(await createBackup({ clips, moments }), 'footage-desk-project.json'); setStatus('Backup downloaded with your footage, tags, notes, and cut.'); }
    catch (error) { setStatus(`Backup failed: ${errorMessage(error)}`); }
    finally { finish(); }
  }

  async function restoreFile(file?: File) {
    if (!file || !begin()) return;
    try {
      setStatus('Restoring project…'); const project = await restoreBackup(file);
      setClips(old => [...old, ...project.clips]); setMoments(old => [...old, ...project.moments]);
      setStatus(`Restored ${project.clips.length} clips and ${project.moments.length} moments. Existing clips were kept.`);
    } catch (error) { setStatus(`Restore failed: ${errorMessage(error)}`); }
    finally { finish(); if (restore.current) restore.current.value = ''; }
  }

  function reorder(index: number, delta: number) {
    setMoments(old => { const next = [...old], target = index + delta; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  return <div onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropping(true); } }}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }}
    onDrop={event => { event.preventDefault(); setDropping(false); void importFiles(event.dataTransfer.files); }}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Footage Desk home"><span className="brand-icon">▧</span> footage desk<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <button className={`nav ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}><span>▦</span> Clip library <span className="count">{clips.length}</span></button>
      <button className={`nav ${view === 'cut' ? 'active' : ''}`} onClick={() => setView('cut')}><span>▤</span> Rough cut <span className="count">{moments.length}</span></button>
      <div className="sidebar-note"><span className="local-dot" /> Your footage stays here<p>Stored in this browser.<br />No uploads. No account.</p></div>
      <div className="sidebar-bottom">A little less searching.<br />A lot more making.</div>
    </aside>
    <main>
      <header className="topbar"><span>Workspace <span className="breadcrumb">/</span> <strong>{view === 'library' ? 'Clip library' : 'Rough cut'}</strong></span><span className="local-badge">LOCAL STUDIO</span></header>
      <section className="heading"><div><div className="eyebrow">FROM CAMERA ROLL TO FIRST CUT</div><h1>Your next story<br />starts here<span>.</span></h1><p>Find the good moments. Leave the rest.</p></div><div className="heading-actions"><button className="button secondary" disabled={disabled} onClick={() => void demo()}>Try sample footage</button><button className="button primary" disabled={disabled} onClick={() => files.current?.click()}><span>＋</span> Import footage</button></div></section>
      <input ref={files} type="file" accept="video/*" multiple hidden onChange={event => { if (event.target.files) void importFiles(event.target.files); }} />
      <div id="status" role="status" aria-live="polite">{!ready ? 'Opening your workspace…' : status}</div>
      <section className="stats"><div><span>{String(clips.length).padStart(2, '0')}</span><p>clips in your library</p></div><div><span>{time(clips.reduce((a, c) => a + c.duration, 0))}</span><p>of footage to explore</p></div><div><span>{String(moments.length).padStart(2, '0')}</span><p>moments in your cut</p></div><div className="stats-tip"><span>THE SMALL STUDIO MINDSET</span><p>A great edit starts with<br />knowing what you have.</p></div></section>
      {view === 'library' ? <section>
        <div className="section-toolbar"><h2>The library <span>{clips.length ? `(${shown.length})` : ''}</span></h2><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, tags, or notes…" aria-label="Search footage" /></label></div>
        <div className="filters">{([['all', 'All footage'], ['favorites', '★ Favorites'], ['used', 'In your cut']] as const).map(([value, label]) => <button key={value} className={`chip ${filter === value ? 'selected' : ''}`} onClick={() => setFilter(value)}>{label}</button>)}<span className="filter-note">Drop videos anywhere to import</span></div>
        <div className="clip-grid">{shown.map(clip => <article className="clip-card" key={clip.id}>
          <button className="thumbnail" aria-label={`Open ${clip.name}`} onClick={() => setEditing({ id: clip.id })}><img src={clip.thumbnail} alt="" loading="lazy" /><span className="play-icon">▶</span><span className="duration">{time(clip.duration)}</span></button>
          <div className="card-body"><div className="card-title-row"><button className="card-title" onClick={() => setEditing({ id: clip.id })}>{clip.name}</button><button className={`favorite ${clip.favorite ? 'on' : ''}`} aria-label={`${clip.favorite ? 'Unfavorite' : 'Favorite'} ${clip.name}`} aria-pressed={clip.favorite} onClick={() => setClips(old => old.map(c => c.id === clip.id ? { ...c, favorite: !c.favorite } : c))}>{clip.favorite ? '★' : '☆'}</button></div><p className="card-meta">{clip.width} × {clip.height} &nbsp; · &nbsp; {(clip.blob.size / 1048576).toFixed(1)} MB</p><div className="tags">{clip.tags.length ? clip.tags.slice(0, 4).map(tag => <span className="tag" key={tag}>{tag}</span>) : <span className="no-tags">Open to add tags & notes</span>}</div></div>
        </article>)}</div>
        {!!clips.length && !shown.length && <p className="muted">No clips match this search or filter.</p>}
        {!clips.length && <div className="empty"><div className="empty-icon">＋</div><h3>Give your footage a home.</h3><p>Import videos from your camera, phone, or desktop.<br />Tag the keepers and build something worth sharing.</p><button className="button primary" disabled={disabled} onClick={() => files.current?.click()}>Import your first clips</button><span>MP4, MOV, and WebM · playback depends on your browser</span></div>}
      </section> : <section>
        <div className="section-toolbar"><div><h2>Your rough cut <span>{moments.length ? `· ${time(cutDuration)}` : ''}</span></h2><p className="muted">The best bits, in the order you want them.</p></div><button className="button primary" disabled={disabled || !moments.length} onClick={() => void exportCut()}>Export video ↗</button></div>
        {moments.map((moment, index) => {
          const clip = clips.find(c => c.id === moment.clipId); if (!clip) return null;
          return <article className="timeline-item" key={moment.id}><span className="timeline-number">{String(index + 1).padStart(2, '0')}</span><img src={clip.thumbnail} alt="" /><div className="timeline-info"><h3>{moment.title || clip.name}</h3><p>{clip.name} · {moment.in.toFixed(1)}s–{moment.out.toFixed(1)}s · {time(moment.out - moment.in)}</p></div><div className="timeline-actions"><button aria-label="Preview moment" onClick={() => setEditing({ id: clip.id, moment })}>▶</button><button disabled={index === 0} aria-label="Move moment up" onClick={() => reorder(index, -1)}>↑</button><button disabled={index === moments.length - 1} aria-label="Move moment down" onClick={() => reorder(index, 1)}>↓</button><button aria-label="Remove moment" onClick={() => setMoments(old => old.filter(m => m.id !== moment.id))}>✕</button></div></article>;
        })}
        {!moments.length && <div className="empty"><div className="empty-icon">▤</div><h3>Every story starts with a moment.</h3><p>Open a clip, drag the trim handles,<br />then add that moment to your cut.</p><button className="button secondary" onClick={() => setView('library')}>Browse footage</button></div>}
        {!!moments.length && <p className="export-note">Exports a 720p video in real time. Keep this tab visible while it renders. Portrait clips are fitted inside a 16:9 frame.</p>}
      </section>}
      <footer><span>MADE FOR THE FIRST DRAFT.</span><button disabled={disabled} onClick={() => void backup()}>Download project backup ↓</button><button disabled={disabled} onClick={() => restore.current?.click()}>Restore backup</button><input ref={restore} type="file" accept=".json,application/json" hidden onChange={e => void restoreFile(e.target.files?.[0])} /><span className="footer-right">Make room for the good stuff.</span></footer>
    </main>
    {activeClip && editing && <ClipEditor key={`${activeClip.id}-${editing.moment?.id || 'clip'}`} clip={activeClip} moment={editing.moment} onClose={() => setEditing(null)}
      onSave={updated => setClips(old => old.map(c => c.id === updated.id ? updated : c))} onAdd={moment => setMoments(old => [...old, moment])}
      onDelete={() => { setClips(old => old.filter(c => c.id !== activeClip.id)); setMoments(old => old.filter(m => m.clipId !== activeClip.id)); setEditing(null); setStatus('Clip removed from this project.'); }} />}
    <dialog ref={exportDialog} id="exportDialog" onCancel={e => { e.preventDefault(); controller.current?.abort(); }}><div className="export-modal"><div className="eyebrow">YOUR STORY, COMING TOGETHER</div><h2>Rendering your cut.</h2><p>{progress.seconds ? `Clip ${progress.index + 1}/${moments.length} · ${time(progress.seconds)} / ${time(progress.total)}` : 'Preparing footage…'}</p><progress max={100} value={progress.total ? progress.seconds / progress.total * 100 : 0} /><p className="muted">Keep this tab visible. Rendering takes about as long as your cut.</p><button className="button secondary" onClick={() => controller.current?.abort()}>Cancel render</button></div></dialog>
    {dropping && <div id="dropOverlay"><span>＋</span><h2>Drop your next story here.</h2><p>Videos stay on your device.</p></div>}
  </div>;
}
