# Footage Desk

A local video workspace: import footage, tag clips, select moments, arrange a rough cut, and export a video. No account, backend, or API key required.

## Run

From this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://localhost:8765 in current Chrome or Edge. Other browsers may have different playback and recording format support.

## Try it

1. Import an H.264 MP4, or click **Try sample footage** to generate three short animated clips locally.
2. Open a clip. Add tags and notes, and save its details.
3. Drag the IN and OUT handles on the filmstrip to select a section. Click the strip to seek, or use arrow keys on a focused handle. Add the moment to your cut.
4. Open **Rough cut**, arrange the moments, and export. Rendering runs in real time; keep the tab visible.
5. Download a project backup to keep a portable copy of your footage and edits.

## How it works

- Plain HTML, CSS, and JavaScript; no dependencies or build step.
- IndexedDB stores video blobs and project metadata on your device. Browser storage is tied to the origin (host and port); clearing site data deletes the project. Download a backup for important work.
- Object URLs provide local video playback; metadata and thumbnails are extracted in the browser.
- Canvas and MediaRecorder render cuts at 1280×720, nominally 30fps, with audio through Web Audio. Output format is selected from the formats your browser supports (normally WebM).
- Export uses real-time playback, so output can have frame timing variation. It is intended for rough cuts, not frame-accurate finishing. Clips are fitted into a 16:9 frame, with dark bars when needed.
- Backup JSON includes video files encoded as base64; it is larger than the original footage and requires additional memory. Restore adds clips without replacing the existing project.
- Search matches names, tags, and notes. This version does not perform AI visual search or transcription.

## Next useful extension

Add timestamped transcripts and scene embeddings, then search for spoken phrases and visual concepts. The existing clip inspector and cut export provide a useful foundation even without AI services.

## Check trim behavior

```sh
node trim.test.mjs
```
