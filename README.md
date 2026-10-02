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
- Describe a cut, slide its target length, and get a starter plan based on clip names, tags, and notes.
- Preview suggested moments, adjust their trims, select the keepers, and add them to the rough cut.
- Optionally use AI to suggest an ordered cut from sampled video frames.
- Click the filmstrip to seek. Focus a handle and use arrow keys for small adjustments, Shift+arrows for larger adjustments, or Home/End for the limits.
- Arrange moments and export a 720p rough cut with audio.
- Save automatically in the browser and download/restore portable project backups.

Existing projects from the plain JavaScript version use the same IndexedDB schema. Keep the same host and port to access them. Clearing site data removes the browser copy; download a backup for important work.

## Plan your first cut

Import your footage and use **What are we making?** above the library. Try a brief such as “warm morning,” or leave it blank for a starter montage. The local planner matches words in names, tags, and notes, then proposes center trims. It does not inspect visual content. Use **Preview & trim** to drag each shot's handles, check the moments you want, and click **Add selected to cut**. Open **Rough cut** to reorder and export.

Target length is an upper bound for generated suggestions. The planner may return a shorter cut if it has too little relevant footage. Manual edits can change that length. Suggestions stay separate from your saved cut until you add them; unaccepted suggestions are not saved across reloads.

### Optional AI frame analysis

1. Copy `.env.example` to `.env.local` in the project root.
2. Set `OPENAI_API_KEY` to your own API key, then restart `bun run dev`. Keep the key out of Git and never prefix it with `NEXT_PUBLIC_`.
3. Choose **AI · sampled frames**, enter a brief, and check the sharing checkbox.
4. Click **Analyze & suggest**, then review the proposed shots before adding them.

This mode samples three 320×180 JPEG frames per clip at 15%, 50%, and 85% of its duration. Those frames, names, tags, notes, durations, and your brief go through the local Next.js route to OpenAI's Responses API. Full videos and audio are not sent. Calls use your API account and can incur charges. The key stays on the server. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and can be changed to a compatible vision model that supports structured outputs.

The model proposes clip IDs, timestamps, titles, and reasons as structured JSON. The server and browser validate clip IDs, time bounds, overlap, and total duration. Nothing is added automatically. The model sees still frames rather than continuous action, so timing is approximate and dialogue highlights are not supported. This version allows up to 12 clips per AI request and has a 60-second provider timeout. Cancel stops frame sampling or the pending request; an already submitted provider request may still incur charges.

The AI endpoint accepts local same-origin requests and one active request per server process. It is intended for a personal local workspace. A hosted version needs authentication and per-user usage limits before enabling paid AI calls.

Local planning works without an API key. AI integration is covered by mocked provider tests; a live provider call has not been verified in this environment because no key is configured. Implementation follows the official OpenAI documentation for [image inputs](https://developers.openai.com/api/docs/guides/images-vision) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Next: deeper footage search

You should be able to ask, “Find someone pouring coffee” or “Make a 20-second montage,” and receive actual source clips at the relevant timestamps. The editor is where you inspect and adjust those suggestions before exporting.

The next steps beyond sparse frame suggestions are:

1. Extract audio and make a timestamped transcript.
2. Split the footage into scenes and sample representative frames.
3. Index transcript segments and visual descriptions with their source timestamps.
4. Retrieve moments matching the user's request.
5. Ask a model to propose an ordered cut: clip IDs, in/out times, and reasons.
6. Validate the proposal against clip bounds, duration limits, and available footage.
7. Let the user review or change the suggestions, then render the accepted cut.

Timestamped transcription, scene detection, and a persistent semantic search index are not implemented yet. Current AI suggestions use three sampled frames per clip.

The proposed hosted extension would use Next.js server routes for job submission, object storage for uploaded media, and a separate FFmpeg worker for audio/frame extraction and final rendering. Long video processing should run in a worker rather than inside a web request. Start with one transcription provider and one model provider after choosing a budget and upload policy; a larger service stack is unnecessary at this stage.

## Export limits

The current export uses real-time playback and normally produces WebM. Keep the tab visible while it renders. Frame timing can vary; this is a rough cut tool rather than a frame-accurate finishing editor. Portrait clips are fitted into a 16:9 frame. Browser support depends on the source video codec.

Backups embed video files as base64 JSON, making them larger than the original files and increasing memory use. Restore adds clips instead of replacing your existing project.
