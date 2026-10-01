const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = seconds => { const n = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const uid = () => crypto.randomUUID();
const state = { clips: [], moments: [], filter: 'all', view: 'library', editing: null, importing: false, exporting: false, cancel: false };
const urls = new Map();
let database;
let exportAudio;
let exportSource;
const exportVideo = document.createElement('video');
exportVideo.playsInline = true;
exportVideo.preload = 'auto';
let statusTimer;
function status(message, persistent = false) {
  clearTimeout(statusTimer); $('status').textContent = message;
  if (!persistent) statusTimer = setTimeout(() => { $('status').textContent = ''; }, 8000);
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('footage-desk', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('project');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function persist() {
  if (!database) { status('Browser storage is unavailable. Download a backup before closing this page.', true); return; }
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction('project', 'readwrite');
      tx.objectStore('project').put({ clips: state.clips, moments: state.moments }, 'current');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } catch (error) { status('Could not save to browser storage. Download a project backup before closing this page.', true); console.error(error); }
}
function urlFor(clip) {
  if (!urls.has(clip.id)) urls.set(clip.id, URL.createObjectURL(clip.blob));
  return urls.get(clip.id);
}
function switchView(view) {
  state.view = view;
  $('libraryView').hidden = view !== 'library'; $('cutView').hidden = view !== 'cut';
  $('libraryNav').classList.toggle('active', view === 'library'); $('cutNav').classList.toggle('active', view === 'cut');
  $('pageLabel').textContent = view === 'library' ? 'Clip library' : 'Rough cut'; render();
}
function render() {
  const query = $('searchInput').value.trim().toLowerCase();
  const shown = state.clips.filter(clip => {
    if (state.filter === 'favorites' && !clip.favorite) return false;
    if (state.filter === 'used' && !state.moments.some(m => m.clipId === clip.id)) return false;
    return `${clip.name} ${clip.tags.join(' ')} ${clip.notes}`.toLowerCase().includes(query);
  });
  $('libraryCount').textContent = state.clips.length; $('cutCount').textContent = state.moments.length;
  $('totalClips').textContent = String(state.clips.length).padStart(2, '0');
  $('totalDuration').textContent = time(state.clips.reduce((a, c) => a + c.duration, 0));
  $('totalMoments').textContent = String(state.moments.length).padStart(2, '0');
  $('resultsCount').textContent = state.clips.length ? `(${shown.length})` : '';
  $('emptyState').hidden = !!state.clips.length;
  $('clipGrid').innerHTML = shown.map(clip => `<article class="clip-card"><button class="thumbnail" data-open="${clip.id}" aria-label="Open ${escape(clip.name)}"><img src="${clip.thumbnail}" alt="" loading="lazy"><span class="play-icon">▶</span><span class="duration">${time(clip.duration)}</span></button><div class="card-body"><div class="card-title-row"><button class="card-title" data-open="${clip.id}">${escape(clip.name)}</button><button class="favorite ${clip.favorite ? 'on' : ''}" data-favorite="${clip.id}" aria-label="${clip.favorite ? 'Unfavorite' : 'Favorite'} ${escape(clip.name)}" aria-pressed="${clip.favorite}">${clip.favorite ? '★' : '☆'}</button></div><p class="card-meta">${clip.width} × ${clip.height} &nbsp; · &nbsp; ${(clip.blob.size / 1048576).toFixed(1)} MB</p><div class="tags">${clip.tags.length ? clip.tags.slice(0, 4).map(tag => `<span class="tag">${escape(tag)}</span>`).join('') : '<span class="no-tags">Open to add tags & notes</span>'}</div></div></article>`).join('');
  if (state.clips.length && !shown.length) $('clipGrid').innerHTML = '<p class="muted">No clips match this search or filter.</p>';
  const duration = state.moments.reduce((a, m) => a + m.out - m.in, 0);
  $('cutDuration').textContent = state.moments.length ? `· ${time(duration)}` : '';
  $('cutEmpty').hidden = !!state.moments.length; $('exportNote').hidden = !state.moments.length;
  $('exportButton').disabled = !state.moments.length || state.exporting;
  $('timeline').innerHTML = state.moments.map((moment, index) => {
    const clip = state.clips.find(c => c.id === moment.clipId);
    return `<article class="timeline-item"><span class="timeline-number">${String(index + 1).padStart(2, '0')}</span><img src="${clip.thumbnail}" alt=""><div class="timeline-info"><h3>${escape(moment.title || clip.name)}</h3><p>${escape(clip.name)} · ${moment.in.toFixed(1)}s–${moment.out.toFixed(1)}s · ${time(moment.out - moment.in)}</p></div><div class="timeline-actions"><button data-preview="${moment.id}" aria-label="Preview moment">▶</button><button data-up="${moment.id}" ${index === 0 ? 'disabled' : ''} aria-label="Move moment up">↑</button><button data-down="${moment.id}" ${index === state.moments.length - 1 ? 'disabled' : ''} aria-label="Move moment down">↓</button><button data-remove="${moment.id}" aria-label="Remove moment">✕</button></div></article>`;
  }).join('');
}
function waitFor(element, event, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Video loading timed out. Try a smaller file or a different video format.')), timeout);
    const success = () => done();
    const failure = () => done(new Error('This video cannot be decoded by your browser. Try an H.264 MP4.'));
    function done(error) { clearTimeout(timer); element.removeEventListener(event, success); element.removeEventListener('error', failure); error ? reject(error) : resolve(); }
    element.addEventListener(event, success, { once: true }); element.addEventListener('error', failure, { once: true });
  });
}
async function seek(video, position) {
  if (Math.abs(video.currentTime - position) < 0.015 && video.readyState >= 2) return;
  const pending = waitFor(video, 'seeked'); video.currentTime = position; await pending;
}
async function inspect(blob) {
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const url = URL.createObjectURL(blob);
  try {
    const loaded = waitFor(video, 'loadeddata'); video.src = url; await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Could not read video duration. Try converting it to MP4.');
    await seek(video, Math.min(1, video.duration / 3));
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d'); drawFit(ctx, video, 640, 360);
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.75) };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
function drawFit(ctx, video, width, height) {
  ctx.fillStyle = '#151b12'; ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const w = video.videoWidth * scale, h = video.videoHeight * scale;
  ctx.drawImage(video, (width - w) / 2, (height - h) / 2, w, h);
}
async function importFiles(files) {
  if (state.importing || state.exporting) { status('Wait for the current import or render to finish.'); return; }
  const videos = [...files].filter(f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv)$/i.test(f.name));
  if (!videos.length) { status('Choose video files such as MP4, MOV, or WebM.'); return; }
  state.importing = true; $('importButton').disabled = true; $('demoButton').disabled = true;
  let count = 0; const failures = [];
  try {
    for (const [index, file] of videos.entries()) {
      status(`Importing ${index + 1}/${videos.length}: ${file.name}`, true);
      try {
        const details = await inspect(file);
        state.clips.push({ id: uid(), name: file.name.replace(/\.[^.]+$/, ''), tags: [], notes: '', favorite: false, blob: file, ...details });
        count++; render();
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    await persist();
    status(`${count} clip${count === 1 ? '' : 's'} imported.${failures.length ? ` ${failures.join(' ')}` : ' Open a clip to find your first moment.'}`);
  } finally { state.importing = false; $('importButton').disabled = false; $('demoButton').disabled = false; $('fileInput').value = ''; }
}
let previewStop;
function openEditor(id, moment) {
  const clip = state.clips.find(c => c.id === id); if (!clip) return;
  state.editing = id;
  $('editorTitle').textContent = clip.name; $('nameInput').value = clip.name;
  $('tagsInput').value = clip.tags.join(', '); $('notesInput').value = clip.notes;
  $('inInput').value = moment ? moment.in.toFixed(1) : '0.0'; $('outInput').value = moment ? moment.out.toFixed(1) : clip.duration.toFixed(1);
  $('inInput').max = clip.duration; $('outInput').max = clip.duration;
  $('momentInput').value = moment?.title || ''; $('editorStatus').textContent = '';
  $('preview').src = urlFor(clip); $('editor').showModal(); updateSelection();
  if (previewStop) $('preview').removeEventListener('timeupdate', previewStop);
  previewStop = null;
  if (moment) {
    $('preview').addEventListener('loadeddata', async () => {
      try { await seek($('preview'), moment.in); await $('preview').play(); } catch { /* Player controls remain available. */ }
    }, { once: true });
    previewStop = () => { if ($('preview').currentTime >= moment.out) $('preview').pause(); };
    $('preview').addEventListener('timeupdate', previewStop);
  }
}
function getSelection() {
  const clip = state.clips.find(c => c.id === state.editing);
  const start = Number($('inInput').value), end = Math.min(Number($('outInput').value), clip?.duration || 0);
  if (!clip || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.1) return null;
  return { in: start, out: end };
}
function updateSelection() {
  const selection = getSelection(); const clip = state.clips.find(c => c.id === state.editing);
  $('selectionDuration').textContent = selection ? `${(selection.out - selection.in).toFixed(1)}s selected` : 'Choose a valid range';
  $('addMoment').disabled = !selection;
  $('rangeFill').style.marginLeft = selection ? `${selection.in / clip.duration * 100}%` : '0';
  $('rangeFill').style.width = selection ? `${(selection.out - selection.in) / clip.duration * 100}%` : '0';
}
function updateDetails() {
  const clip = state.clips.find(c => c.id === state.editing); if (!clip) return;
  clip.name = $('nameInput').value.trim() || 'Untitled clip';
  clip.tags = [...new Set($('tagsInput').value.split(',').map(s => s.trim()).filter(Boolean))];
  clip.notes = $('notesInput').value.trim(); $('editorTitle').textContent = clip.name; render();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function recordingType() {
  if (!window.MediaRecorder) return null;
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
}
async function sampleVideo(index) {
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
  const ctx = canvas.getContext('2d');
  const palettes = [['#655a40', '#e8d5a2'], ['#405044', '#bbcf9d'], ['#624643', '#d9b0a0']];
  const [bg, fg] = palettes[index];
  const stream = canvas.captureStream(30); const mime = recordingType();
  const recorder = new MediaRecorder(stream, { mimeType: mime }); const chunks = [];
  const done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => resolve(new Blob(chunks, { type: mime })); });
  const start = performance.now();
  function frame(now) {
    const t = (now - start) / 1000;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = fg; ctx.globalAlpha = .22;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(150 + i * 160 + Math.sin(t + i) * 40, 240 + Math.cos(t * .8 + i) * 130, 100 + i * 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#f6f3e6'; ctx.font = '16px sans-serif'; ctx.fillText('FOOTAGE DESK  /  GENERATED SAMPLE', 65, 70);
    ctx.font = '600 64px sans-serif'; ctx.fillText(['Morning light.', 'A quieter moment.', 'The closing scene.'][index], 65, 295);
    ctx.font = '20px sans-serif'; ctx.fillText('Try trimming this clip and adding it to your cut.', 68, 347);
    ctx.fillStyle = fg; ctx.fillRect(65, 455, Math.min(t / 3, 1) * 830, 4);
    if (t < 3) requestAnimationFrame(frame); else recorder.stop();
  }
  frame(start); recorder.start();
  const blob = await done; stream.getTracks().forEach(track => track.stop()); return blob;
}
async function loadDemo() {
  if (state.importing || state.exporting) return;
  if (!recordingType()) { status('Sample footage generation needs a browser with MediaRecorder, such as Chrome.'); return; }
  $('demoButton').disabled = true; $('importButton').disabled = true; state.importing = true;
  try {
    for (let i = 0; i < 3; i++) {
      status(`Creating sample clip ${i + 1}/3. Keep this tab visible…`, true);
      const blob = await sampleVideo(i); const details = await inspect(blob);
      state.clips.push({ id: uid(), blob, ...details, name: ['Morning light', 'A quieter moment', 'The closing scene'][i], tags: ['sample', ['warm', 'green', 'soft'][i]], notes: 'Generated animated sample footage. Replace it with your own videos.', favorite: i === 0 }); render();
    }
    await persist(); status('Three generated sample clips are ready. Open one, select a moment, and add it to your cut.');
  } catch (error) { status(`Could not create samples: ${error.message}`); }
  finally { state.importing = false; $('demoButton').disabled = false; $('importButton').disabled = false; }
}
for (const id of ['importButton', 'emptyImport']) $(id).onclick = () => $('fileInput').click();
$('fileInput').onchange = event => importFiles(event.target.files);
$('demoButton').onclick = loadDemo; $('libraryNav').onclick = () => switchView('library');
$('cutNav').onclick = () => switchView('cut'); $('browseButton').onclick = () => switchView('library');
$('searchInput').oninput = render;
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b === button)); render(); });
$('clipGrid').onclick = async event => {
  const open = event.target.closest('[data-open]'); if (open) openEditor(open.dataset.open);
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) { const clip = state.clips.find(c => c.id === favorite.dataset.favorite); clip.favorite = !clip.favorite; render(); await persist(); }
};
$('closeEditor').onclick = () => $('editor').close(); $('editor').addEventListener('close', () => { $('preview').pause(); if (previewStop) $('preview').removeEventListener('timeupdate', previewStop); });
for (const id of ['inInput', 'outInput']) $(id).oninput = updateSelection;
$('setIn').onclick = () => { $('inInput').value = $('preview').currentTime.toFixed(1); updateSelection(); };
$('setOut').onclick = () => { $('outInput').value = $('preview').currentTime.toFixed(1); updateSelection(); };
$('saveDetails').onclick = async () => { updateDetails(); await persist(); $('editorStatus').textContent = 'Clip details saved.'; };
$('addMoment').onclick = async () => {
  const selection = getSelection(); if (!selection) return;
  updateDetails(); state.moments.push({ id: uid(), clipId: state.editing, ...selection, title: $('momentInput').value.trim() });
  await persist(); render(); $('editorStatus').textContent = 'Moment added. Open Rough cut to arrange and export it.';
};
$('deleteClip').onclick = async () => {
  const clip = state.clips.find(c => c.id === state.editing);
  if (!confirm(`Remove “${clip.name}” and its moments from this project? Your original file stays on your device.`)) return;
  state.clips = state.clips.filter(c => c.id !== clip.id); state.moments = state.moments.filter(m => m.clipId !== clip.id);
  if (urls.has(clip.id)) { URL.revokeObjectURL(urls.get(clip.id)); urls.delete(clip.id); }
  $('editor').close(); render(); await persist(); status('Clip removed from this project.');
};
$('timeline').onclick = async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  const action = ['preview', 'up', 'down', 'remove'].find(a => button.dataset[a]); if (!action) return;
  const index = state.moments.findIndex(m => m.id === button.dataset[action]); const moment = state.moments[index];
  if (action === 'preview') { openEditor(moment.clipId, moment); return; }
  if (action === 'remove') state.moments.splice(index, 1);
  else { const target = index + (action === 'up' ? -1 : 1); [state.moments[index], state.moments[target]] = [state.moments[target], state.moments[index]]; }
  render(); await persist();
};
$('exportButton').hidden = true; $('cancelExport').onclick = () => { state.cancel = true; };
$('exportDialog').addEventListener('cancel', event => { event.preventDefault(); state.cancel = true; });
$('backupButton').hidden = true; $('restoreButton').hidden = true;
let dragDepth = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth++; $('dropOverlay').hidden = false; } });
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropOverlay').hidden = true; });
document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('dropOverlay').hidden = true; importFiles(event.dataTransfer.files); });
window.addEventListener('beforeunload', event => { if (state.exporting || state.importing) { event.preventDefault(); event.returnValue = ''; } });
try {
  database = await openDatabase();
  const saved = await new Promise((resolve, reject) => { const request = database.transaction('project').objectStore('project').get('current'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  if (saved) { state.clips = saved.clips; state.moments = saved.moments; }
} catch (error) { status('Browser storage is unavailable. Download a backup before closing this page.', true); }
render();
