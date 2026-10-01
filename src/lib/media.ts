import type { Clip, Moment } from './types';

export function waitFor(video: HTMLVideoElement, event: string, timeout = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Video loading timed out. Try a smaller file or an H.264 MP4.')), timeout);
    const success = () => done();
    const failure = () => done(new Error('This video cannot be decoded by your browser. Try an H.264 MP4.'));
    function done(error?: Error) {
      clearTimeout(timer); video.removeEventListener(event, success); video.removeEventListener('error', failure);
      if (error) reject(error); else resolve();
    }
    video.addEventListener(event, success, { once: true }); video.addEventListener('error', failure, { once: true });
  });
}

export async function seek(video: HTMLVideoElement, position: number) {
  if (Math.abs(video.currentTime - position) < .015 && video.readyState >= 2) return;
  const pending = waitFor(video, 'seeked');
  const decoded = video.requestVideoFrameCallback ? new Promise<void>(resolve => {
    const timer = setTimeout(() => { video.cancelVideoFrameCallback(handle); resolve(); }, 1500);
    const handle = video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
  }) : Promise.resolve();
  video.currentTime = position; await Promise.all([pending, decoded]);
}

function drawFit(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  ctx.fillStyle = '#151b12'; ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const w = video.videoWidth * scale, h = video.videoHeight * scale;
  ctx.drawImage(video, (width - w) / 2, (height - h) / 2, w, h);
}

export async function inspect(blob: Blob): Promise<Pick<Clip, 'duration' | 'width' | 'height' | 'thumbnail'>> {
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const url = URL.createObjectURL(blob);
  try {
    const loaded = waitFor(video, 'loadeddata'); video.src = url; await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Could not read video duration. Try converting it to MP4.');
    await seek(video, Math.min(1, video.duration / 3));
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    drawFit(canvas.getContext('2d')!, video, 640, 360);
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, thumbnail: canvas.toDataURL('image/jpeg', .75) };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function recordingType() {
  if (!window.MediaRecorder) return undefined;
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
}

export async function renderCut(clips: Clip[], moments: Moment[], signal: AbortSignal, onProgress: (seconds: number, total: number, index: number) => void) {
  const mime = recordingType();
  if (!mime || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video export needs a current browser such as Chrome or Edge.');
  const video = document.createElement('video'); video.playsInline = true; video.preload = 'auto';
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  const total = moments.reduce((sum, m) => sum + m.out - m.in, 0);
  const audio = new AudioContext(); await audio.resume();
  const source = audio.createMediaElementSource(video), destination = audio.createMediaStreamDestination();
  source.connect(destination);
  const stream = canvas.captureStream(30); destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
  const chunks: Blob[] = []; let activeURL: string | undefined;
  let recordingError: Error | undefined;
  const finished = new Promise<void>(resolve => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => resolve();
    recorder.onerror = () => { recordingError = new Error('Video recording failed.'); resolve(); };
  });
  try {
    let completed = 0;
    for (const [index, moment] of moments.entries()) {
      if (signal.aborted) break;
      const clip = clips.find(c => c.id === moment.clipId); if (!clip) throw new Error('A clip is missing from the project.');
      if (activeURL) URL.revokeObjectURL(activeURL);
      activeURL = URL.createObjectURL(clip.blob);
      const loaded = waitFor(video, 'loadeddata'); video.src = activeURL; await loaded;
      await seek(video, moment.in); drawFit(ctx, video, 1280, 720);
      if (signal.aborted) break;
      if (recorder.state === 'inactive') recorder.start(250); else recorder.resume();
      await video.play();
      await new Promise<void>((resolve, reject) => {
        let lastTime = video.currentTime, lastAdvance = performance.now();
        const paint = () => {
          if (recordingError || video.error) { reject(recordingError || new Error('Video playback failed.')); return; }
          drawFit(ctx, video, 1280, 720);
          const elapsed = Math.max(0, Math.min(video.currentTime - moment.in, moment.out - moment.in));
          onProgress(completed + elapsed, total, index);
          if (signal.aborted || video.ended || video.currentTime >= moment.out) { video.pause(); resolve(); return; }
          if (video.currentTime !== lastTime) { lastTime = video.currentTime; lastAdvance = performance.now(); }
          if (performance.now() - lastAdvance > 15000) { reject(new Error('Playback stalled. Keep this tab visible and try again.')); return; }
          requestAnimationFrame(paint);
        }; requestAnimationFrame(paint);
      });
      recorder.pause(); completed += moment.out - moment.in;
    }
    if (recorder.state !== 'inactive') { recorder.stop(); await finished; }
    if (recordingError) throw recordingError;
    if (signal.aborted) return null;
    return { blob: new Blob(chunks, { type: mime }), extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    video.pause(); video.removeAttribute('src'); video.load();
    source.disconnect(); stream.getTracks().forEach(track => track.stop());
    if (activeURL) URL.revokeObjectURL(activeURL);
    await audio.close();
  }
}

export async function sampleVideo(index: number) {
  const mime = recordingType(); if (!mime) throw new Error('Sample footage generation needs MediaRecorder. Try Chrome.');
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
  const ctx = canvas.getContext('2d')!;
  const palettes = [['#655a40', '#e8d5a2'], ['#405044', '#bbcf9d'], ['#624643', '#d9b0a0']];
  const [bg, fg] = palettes[index];
  const stream = canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error('Could not record sample footage.'));
  });
  const start = performance.now();
  function frame(now: number) {
    const t = (now - start) / 1000;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 960, 540); ctx.fillStyle = fg; ctx.globalAlpha = .22;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(150 + i * 160 + Math.sin(t + i) * 40, 240 + Math.cos(t * .8 + i) * 130, 100 + i * 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#f6f3e6'; ctx.font = '16px sans-serif'; ctx.fillText('FOOTAGE DESK  /  GENERATED SAMPLE', 65, 70);
    ctx.font = '600 64px sans-serif'; ctx.fillText(['Morning light.', 'A quieter moment.', 'The closing scene.'][index], 65, 295);
    ctx.font = '20px sans-serif'; ctx.fillText('Try trimming this clip and adding it to your cut.', 68, 347);
    ctx.fillStyle = fg; ctx.fillRect(65, 455, Math.min(t / 3, 1) * 830, 4);
    if (t < 3) requestAnimationFrame(frame); else recorder.stop();
  }
  frame(start); recorder.start();
  try { return await done; } finally { stream.getTracks().forEach(track => track.stop()); }
}
