# CapCut for iPad — Architecture Plan

A touch-first, CapCut-style video editor that runs in the browser on iPad (Safari / installed PWA), deployed on **Vercel**. All video processing happens **on-device in the browser** — Vercel serves the app and lightweight APIs, never touches video frames.

Sister repo: [`fabwinter/CharlieCut`](https://github.com/fabwinter/CharlieCut) — we inherit its stack and UI conventions (TanStack Start, React 19, Tailwind 4, shadcn/ui, Bun). CharlieCut is currently a scaffold with no editor code, so everything editor-specific is defined here.

---

## 1. Product scope (v1)

| In scope (v1) | Out of scope (v1) |
|---|---|
| Multi-track timeline (video, audio, text, overlay tracks) | Cloud rendering / server-side export |
| Import from Photos/Files (video, image, audio) | Multi-user collaboration |
| Trim, split, delete, reorder, ripple edit | AI features (auto-captions, background removal) |
| Transitions, speed control, volume, fade | Effects marketplace / paid assets |
| Text clips with fonts, color, position, animation presets | HDR / 10-bit pipelines |
| Filters & adjustments (LUT-style color, brightness/contrast/saturation) | Live streaming |
| Keyframes for transform + opacity | Desktop-class shortcuts (secondary) |
| Real-time preview with A/V sync | |
| Export to MP4 (H.264 + AAC) 720p/1080p, saved to Files/Photos | |
| Local-first projects: everything persisted on device, works offline (PWA) | |

**Primary device target:** iPad (Safari 17+ / iPadOS 17+, best experience on iPadOS 26+). Works on desktop browsers as a byproduct; phone layout deferred.

---

## 2. Platform constraints (iPad Safari) — these drive the design

These are the facts the whole architecture is built around. Every implementing agent must know them:

1. **Memory is the scarcest resource.** A Safari tab gets roughly 1–1.5 GB before iOS kills it. We never hold decoded frames for more than the immediate playback window, and we edit against **downscaled proxy media**, not originals.
2. **WebCodecs** (`VideoDecoder`/`VideoEncoder`) is available in Safari 16.4+/17+; hardware H.264/HEVC decode and encode. `AudioDecoder`/`AudioEncoder` availability is spottier → audio decode via `AudioContext.decodeAudioData`, audio encode via AAC through WebCodecs *if present*, else ffmpeg.wasm fallback.
3. **WebGPU** ships in Safari 26 / iPadOS 26. **WebGL2 is the baseline renderer**; WebGPU is a progressive enhancement behind a capability check, same shader-graph abstraction on top.
4. **SharedArrayBuffer** (needed by ffmpeg.wasm multithread and useful for worker pipelines) requires cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`, set via `vercel.json` headers. Consequence: all cross-origin assets we load must send CORP/CORS headers — so we self-host fonts and assets (no Google Fonts CDN, unlike CharlieCut's scaffold).
5. **OPFS** (Origin Private File System, Safari 17+) is our media store — imported files are copied into OPFS once and streamed from there. IndexedDB stores only project metadata/documents. Storage is evictable → we surface "persistent storage" requests and export/backup flows.
6. **No `showSaveFilePicker`** on iOS Safari → export delivers the MP4 via `<a download>` / Share Sheet (`navigator.share` with files).
7. **Touch-first:** Pointer Events everywhere, no hover-dependent UI, 44 pt minimum targets, `touch-action` managed per surface, gestures (pinch-zoom timeline, drag clips, long-press context menus) implemented on our own gesture layer.
8. **Vercel functions are unsuitable for video work** (bundle/time/memory limits) — reinforcing the client-side pipeline. The server tier stays thin.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **TanStack Start** (React 19, Vite 8, file-based routes) | CharlieCut convention; its `vite.config.ts` already supports Vercel via `nitro({ preset: 'vercel' })` — we make Vercel the *primary* target |
| Styling / UI | **Tailwind CSS 4 + shadcn/ui (Radix + Base UI)** | Copy CharlieCut's `components/ui/*` kit wholesale; consistent design language |
| Editor state | **Zustand + Immer** | Fine-grained subscriptions for 60 fps timeline UI; simple to reason about for agents |
| Async/server state | **TanStack Query** | Comes with the Start integration |
| Schema/validation | **Zod 4** | Project document schema + migrations |
| Demux | **mp4box.js** (MP4/MOV), plus `webm-muxer`-family demux later | Extract encoded samples for WebCodecs without decoding via `<video>` |
| Decode/encode | **WebCodecs** (hardware) | Only viable path to real-time editing on iPad |
| Mux | **mp4-muxer** (H.264/AAC → MP4) | Small, pure-JS, WebCodecs-native |
| Fallback pipeline | **ffmpeg.wasm** (lazy-loaded, single-thread fallback if no SAB) | Odd codecs, audio encode gaps, container conversions |
| Preview render | **WebGL2** compositor (raw WebGL, no three.js) | Predictable perf, small; WebGPU backend later behind the same interface |
| Audio | **Web Audio API** (`AudioContext` as master clock) | Mixing, gain/fade, and the sync clock for playback |
| Persistence | **OPFS** (media) + **IndexedDB via `idb`** (documents) | See constraint #5 |
| Workers | Dedicated `Worker`s: media (demux/decode/thumbnails/waveforms), export | Keep the main thread for UI + compositor |
| Runtime/tooling | **Bun**, Vitest, Playwright (WebKit project for iPad viewport) | CharlieCut conventions |
| Deploy | **Vercel** (static + SSR via Nitro preset), `vercel.json` for COOP/COEP headers | User requirement |

**Explicitly rejected:** Next.js (would fork us off CharlieCut conventions for no editor benefit); server-side rendering of video on Vercel (limits); `<video>`-element-based preview seeking (can't composite multi-track frame-accurately); Remotion (rendering model doesn't fit interactive editing on-device).

---

## 4. System architecture

```
┌────────────────────────────── iPad (browser) ──────────────────────────────┐
│                                                                            │
│  UI Layer (React)                                                          │
│  ├── routes: /            project gallery                                  │
│  ├── routes: /edit/$id    editor shell                                     │
│  ├── editor panels: preview, timeline, toolbars, inspectors, media library │
│  └── gesture layer (Pointer Events → drag/trim/pinch/long-press)           │
│                       │ commands (dispatch)        ▲ state (subscribe)     │
│                       ▼                            │                       │
│  Editor Core (pure TS, no React)                                           │
│  ├── ProjectDoc  – zod-typed document (tracks, clips, keyframes, assets)   │
│  ├── CommandBus  – every mutation is a Command; undo/redo = inverse stack  │
│  ├── Selectors   – derived data (clip layout, playhead lookups, snapping)  │
│  └── Persistence – autosave doc → IndexedDB (debounced, versioned)         │
│                       │                                                    │
│        ┌──────────────┼──────────────────┬─────────────────┐               │
│        ▼              ▼                  ▼                 ▼               │
│  Media Engine     Playback Engine    Export Engine     Asset Store         │
│  (Worker)         (main + worker)    (Worker)          (OPFS + IDB)        │
│  ├─ import/copy   ├─ AudioContext    ├─ frame-by-frame ├─ media files      │
│  │  into OPFS     │  = master clock  │  render @ export├─ proxies          │
│  ├─ mp4box demux  ├─ frame scheduler │  resolution     ├─ thumbnails       │
│  ├─ WebCodecs     ├─ WebGL2          ├─ WebCodecs      └─ waveforms        │
│  │  decode        │  compositor      │  encode                             │
│  ├─ proxy gen     ├─ effect/filter   ├─ mp4-muxer                          │
│  ├─ thumbnails    │  shader graph    └─ ffmpeg.wasm                        │
│  └─ waveforms     └─ text rasterizer     (fallback)                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                       │ HTTPS (app shell, fonts, LUTs, presets, telemetry)
                       ▼
┌────────────────────────────── Vercel ──────────────────────────────────────┐
│  Static assets + SSR shell (TanStack Start / Nitro preset)                 │
│  vercel.json: COOP/COEP headers, cache policy, wasm content-type           │
│  /api/* (thin): health, feedback, (later) auth + project-sync metadata     │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Project document model

Single source of truth, JSON-serializable, zod-validated, versioned for migration:

```ts
ProjectDoc {
  id, schemaVersion, name, createdAt, modifiedAt
  settings: { width, height, fps, background }
  assets: AssetRef[]        // id, kind(video|image|audio), opfsPath, duration,
                            // originalName, proxy?: { opfsPath, scale }
  tracks: Track[]           // ordered; kind: video | overlay | text | audio
  // Track { id, kind, clips: Clip[] }
  // Clip  { id, assetId?, trackId, start, duration,        // timeline position
  //         inPoint, outPoint,                              // source trim
  //         speed, volume, transform: {x,y,scale,rotation,opacity},
  //         effects: Effect[], keyframes: Keyframe[],
  //         transitionOut?: { type, duration },
  //         text?: TextPayload }                            // for text clips
}
```

- **All times are rational** (`{num, den}` ticks or integer microseconds — decided in Phase 2, then frozen) — never floating-point seconds, to keep frame accuracy.
- **Commands, not setters.** `SplitClip`, `TrimClipStart`, `MoveClip`, `AddKeyframe`… Each command validates against the doc, produces a patch + inverse patch. Undo/redo is a bounded stack of inverse patches. This is also the future path to collaboration/sync.
- Autosave: debounced (500 ms) write of the full doc to IndexedDB; docs are small (KBs). Media never lives in the doc — only `AssetRef`s pointing into OPFS.

### 4.2 Media engine (worker)

- **Import:** user picks file → streamed copy into OPFS (`assets/{assetId}/original.mp4`) → probe with mp4box.js (duration, dimensions, codecs, fps) → kick off background jobs: proxy, thumbnails, waveform.
- **Proxy generation:** decode original → re-encode at ≤ 960×540 H.264 via WebCodecs → OPFS. The editor previews **proxies**; originals are used only at export. This is the core memory/perf strategy.
- **Thumbnails:** decoded keyframes → 160 px JPEG strip per asset for timeline clip bodies.
- **Waveforms:** `decodeAudioData` → min/max peak buckets (~50/s) stored as `Float32Array` blobs.
- **Frame access API** (used by playback + export): `getFrames(assetId, timeRange, quality: proxy|original) → VideoFrame stream`, implemented with a small decoder pool + keyframe-seek + LRU frame cache. `VideoFrame.close()` discipline is enforced here and nowhere else.

### 4.3 Playback engine

- **Clock:** `AudioContext.currentTime` is the master. Video chases audio.
- **Scheduler:** on `play`, for each active clip: audio scheduled via `AudioBufferSourceNode` graph (per-clip gain → track gain → master); video frames requested from the media engine ~500 ms ahead, presented on `requestAnimationFrame` when `frame.timestamp <= clockTime`.
- **Compositor (WebGL2):** each visible frame: upload `VideoFrame`s as textures (`texImage2D` accepts VideoFrame directly), draw tracks bottom-up with transform + opacity + effect shader chain, then text/sticker layers (rasterized to a canvas atlas), then transitions (shader mixing two clip textures). Target 30 fps preview minimum, 60 fps UI always.
- **Scrub/seek:** paused seek renders a single composed frame; scrubbing throttles to nearest-cached-frame first, exact frame on settle.

### 4.4 Export engine (worker)

- Pull-based frame loop at project fps using **original** media: compose each frame with the *same* WebGL compositor (OffscreenCanvas) → `VideoFrame` → `VideoEncoder` (H.264, hardware) → `mp4-muxer`.
- Audio: offline mix via `OfflineAudioContext` → AAC (`AudioEncoder` if available, else ffmpeg.wasm encode of the PCM) → mux.
- Backpressure: `encodeQueueSize` watched; frames composed only when the encoder is hungry. Progress events → UI. Output blob → Share Sheet / download.
- One canonical correctness rule: **export must be a pure function of `ProjectDoc`** — no dependency on playback state.

### 4.5 Server tier (Vercel) — deliberately thin

- Serves app shell, wasm bundles, self-hosted fonts, built-in asset packs (LUTs, text style presets, transition definitions) as static files with long-cache headers.
- `vercel.json`: COOP/COEP on all routes, `Cache-Control` for immutable assets, correct `application/wasm` types.
- `/api/health` now; auth + cloud project sync (Supabase) is a post-v1 phase and changes nothing client-side thanks to the command/patch model.

### 4.6 Repository layout

Single app (no monorepo yet — CapCut repo is empty; we extract packages only when a second app exists):

```
/                      vercel.json, package.json (bun), vite.config.ts
src/
  routes/              __root.tsx, index.tsx (gallery), edit.$projectId.tsx
  components/ui/       shadcn kit (imported from CharlieCut)
  editor/
    doc/               schema.ts, commands/, selectors/, migrate.ts   ← pure TS, no DOM
    state/             zustand stores (editor session, selection, transport)
    media/             import.ts, demux.ts, decode.ts, proxy.ts, worker.ts
    playback/          clock.ts, scheduler.ts, compositor/ (gl/, shaders/, text/)
    export/            exporter.ts, mux.ts, worker.ts, ffmpeg-fallback.ts
    gestures/          pointer/gesture recognizers for timeline + preview
  storage/             opfs.ts, idb.ts, quota.ts
  components/editor/   Timeline, PreviewCanvas, Toolbar, Inspector, MediaLibrary…
public/                icons, manifest.webmanifest, builtin-assets/
docs/                  this file, IMPLEMENTATION_PLAN.md
```

**Boundary rules for implementing agents:** `editor/doc` imports nothing from React/DOM. `editor/media|playback|export` import `doc` types but no React. React components never touch OPFS/WebCodecs directly — always through the engine APIs. These rules keep the engines testable in Vitest without a browser where possible, and behind Playwright-WebKit tests where not.

---

## 5. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| Safari kills the tab under memory pressure | Proxy-first editing; strict `VideoFrame.close()`; decoder pool cap (≤2 concurrent); LRU frame cache with byte budget; test on real iPad early (Phase 2 gate) |
| WebCodecs gaps (esp. `AudioEncoder`) on target iPadOS versions | Capability probe at startup → feature matrix; ffmpeg.wasm fallback path is built in Phase 6, not bolted on |
| COOP/COEP breaks third-party embeds/fonts | Self-host everything from day one; CI check that all responses carry CORP-compatible headers |
| Frame-accuracy bugs from float time | Rational/integer time decided and frozen in Phase 2; lint rule against `number` seconds in `editor/doc` |
| OPFS eviction loses user media | `navigator.storage.persist()` prompt; quota meter in UI; project export/backup (zip of doc + media) in polish phase |
| WebGL context loss (backgrounding on iPad) | `webglcontextlost/restored` handlers; all GL resources rebuildable from doc + asset store |
