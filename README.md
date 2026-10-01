# Footage Desk

A workspace for turning a folder of footage into a first cut. Import clips, find useful moments, drag the trim handles, arrange the moments, and export a video.

## Run it

```sh
bun install
bun run dev
```

Open http://localhost:8765. Current Chrome, Brave, or Edge is recommended for video export.

```sh
bun test
bun run typecheck
bun run build
bun run start
```

## Current stack

- Next.js App Router, React, and TypeScript for the application.
- Bun for dependency installation, scripts, and tests. The Next.js CLI runs on Node.js.
- IndexedDB stores the project and video files in your browser.
- Canvas, MediaRecorder, and Web Audio create the exported video locally.
- CSS for the interface; no external font requests.

The React components own interface state. Media processing, storage, backup handling, and trimming rules live in separate modules under `src/lib`.

## What works today

- Import videos or generate sample footage locally.
- Search names, tags, and notes; filter favorites or clips used in your cut.
- Preview a clip, drag its IN/OUT handles, and add a selected moment.
- Click the filmstrip to seek. Focus a handle and use arrow keys for small adjustments, Shift+arrows for larger adjustments, or Home/End for the limits.
- Arrange moments and export a 720p rough cut with audio.
- Save automatically in the browser and download/restore portable project backups.

Existing projects from the plain JavaScript version use the same IndexedDB schema. Keep the same host and port to access them. Clearing site data removes the browser copy; download a backup for important work.

## End goal: footage search and suggested cuts

You should be able to ask, “Find someone pouring coffee” or “Make a 20-second montage,” and receive actual source clips at the relevant timestamps. The editor is where you inspect and adjust those suggestions before exporting.

The planned AI pipeline is:

1. Extract audio and make a timestamped transcript.
2. Split the footage into scenes and sample representative frames.
3. Index transcript segments and visual descriptions with their source timestamps.
4. Retrieve moments matching the user's request.
5. Ask a model to propose an ordered cut: clip IDs, in/out times, and reasons.
6. Validate the proposal against clip bounds, duration limits, and available footage.
7. Let the user review or change the suggestions, then render the accepted cut.

AI search, transcription, and automatic clip suggestions are **not implemented yet**. This version sends no footage to an AI service and needs no API key.

The proposed hosted extension would use Next.js server routes for job submission, object storage for uploaded media, and a separate FFmpeg worker for audio/frame extraction and final rendering. Long video processing should run in a worker rather than inside a web request. Start with one transcription provider and one model provider after choosing a budget and upload policy; a larger service stack is unnecessary at this stage.

## Export limits

The current export uses real-time playback and normally produces WebM. Keep the tab visible while it renders. Frame timing can vary; this is a rough cut tool rather than a frame-accurate finishing editor. Portrait clips are fitted into a 16:9 frame. Browser support depends on the source video codec.

Backups embed video files as base64 JSON, making them larger than the original files and increasing memory use. Restore adds clips instead of replacing your existing project.
