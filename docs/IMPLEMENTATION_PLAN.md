# CapCut for iPad — Implementation Plan

> **Status:** Phases 0–2 are implemented and merged. Phases 3–7 are **superseded** by
> [`V2_DESIGN_AND_EDITING_PLAN.md`](./V2_DESIGN_AND_EDITING_PLAN.md), which reworks them
> iPhone-first with a full design system. Implementing agents should work from the V2 plan;
> this document remains useful for the Phase 0–2 acceptance criteria and working agreements.

Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md) — read that first; it defines the stack, constraints, module boundaries, and vocabulary used below.

This plan is written to be executed by multiple agents. Each phase lists **deliverables**, **acceptance criteria** (the definition of done an agent must verify), and **hand-off notes**. Phases are ordered by dependency; work items marked ∥ within a phase can run in parallel by separate agents.

**Dependency graph:**

```
P0 scaffold ─► P1 projects ─► P2 media engine ─► P3 timeline UI ─► P4 playback ─► P5 editing features ─► P6 export ─► P7 polish/PWA
                                    └────────────────────────────────────────────────────────────────────┘
                                     P2's frame-access API is also P4's and P6's foundation — its contract
                                     (section P2.4) must be reviewed before P4/P6 start.
```

---

## Phase 0 — Scaffold & deploy pipeline

**Goal:** empty app deploying to Vercel with the right headers, CI green.

1. Scaffold TanStack Start app (React 19, Vite 8, Tailwind 4, Bun) mirroring CharlieCut's `apps/web` layout, but flattened to repo root per ARCHITECTURE §4.6. Use `nitro({ preset: 'vercel' })` unconditionally (Vercel is the only target here — drop CharlieCut's Cloudflare branch).
2. Copy CharlieCut's `src/components/ui/*` shadcn kit, `lib/utils.ts`, `components.json`, Tailwind setup. Replace Google Fonts links with self-hosted `@fontsource` (COEP requirement, ARCHITECTURE §2.4).
3. `vercel.json`: COOP `same-origin` + COEP `require-corp` on `/(.*)`, immutable cache for hashed assets, `application/wasm` content type.
4. Tooling: Vitest (unit), Playwright with a **WebKit / iPad Pro viewport project** (integration), TypeScript strict, Biome or ESLint+Prettier (match CharlieCut where it has config). GitHub Actions: typecheck + test + build on PR.
5. Landing route `/` renders a placeholder gallery; verify `crossOriginIsolated === true` in the deployed app.

**Accept:** Vercel production URL serves the app; `self.crossOriginIsolated` is true on device; CI passes; Playwright WebKit smoke test passes.

---

## Phase 1 — Project management (local-first shell)

**Goal:** create/open/rename/duplicate/delete projects, persisted on device.

1. `editor/doc/schema.ts`: full `ProjectDoc` zod schema per ARCHITECTURE §4.1 (including parts not yet used — tracks/clips/keyframes), `schemaVersion` + `migrate.ts` skeleton.
2. `storage/idb.ts` (projects store via `idb`), `storage/opfs.ts` (directory helpers, existence/size utils), `storage/quota.ts` (`estimate()` + `persist()` request).
3. Project gallery `/`: card grid (name, duration, modified, thumbnail placeholder), create/rename/duplicate/delete with confirm dialogs. Touch targets ≥ 44 pt.
4. Editor route `/edit/$projectId`: loads doc, renders empty editor shell (preview area, timeline area, toolbar regions — layout only), autosave loop (debounced doc write), "unsaved/saved" indicator.
5. ∥ `editor/doc/commands/` foundation: `CommandBus`, patch + inverse-patch types, undo/redo stack, with `RenameProject` and `SetProjectSettings` as the first two commands. Unit-tested exhaustively — every later feature builds on this.

**Accept:** create → edit name → kill tab → reopen → state intact (Playwright). Undo/redo unit tests green. Doc round-trips through zod parse.

---

## Phase 2 — Media engine ⚠️ *highest-risk phase; validate on a real iPad before building past it*

**Goal:** import media into OPFS, probe it, generate proxies/thumbnails/waveforms, and expose the frame-access API everything else consumes.

1. **Time base decision (blocking, first PR):** integer microseconds vs rational ticks — implement `editor/doc/time.ts` with the chosen representation + helpers (`toFrames`, `snapToFrame`, arithmetic). Freeze it.
2. Import flow: `<input type=file>` + drag-drop → streamed copy to OPFS → mp4box.js probe (codecs, duration, dims, fps) → `AssetRef` added to doc via command → media library panel lists assets with status badges (importing / processing / ready / error).
3. Media worker: job queue (one import pipeline at a time). Jobs: **proxy** (WebCodecs decode → ≤960×540 H.264 encode → OPFS), **thumbnails** (keyframe strip, 160 px JPEGs), **waveform** (`decodeAudioData` → peak buckets → OPFS blob). Comlink or hand-rolled RPC — keep it typed.
4. **Frame-access API** (`getFrames(assetId, range, quality) → async VideoFrame iterator`): decoder pool (max 2), keyframe seek, LRU cache with byte budget, hard `VideoFrame.close()` discipline. This contract gets a written doc-comment spec + review before merge — P4 and P6 build on it.
5. ∥ Capability probe (`src/editor/capabilities.ts`): WebCodecs encode/decode configs, AudioEncoder, WebGPU, OPFS, SAB — logged and surfaced in a hidden debug panel.
6. **Real-device gate:** import a 3-minute 4K H.265 iPhone clip on an actual iPad; proxy completes without tab death; memory stays bounded (test with repeated imports).

**Accept:** device gate passes; unit tests for time math; Playwright test imports a small fixture MP4 and sees thumbnails + waveform render.

---

## Phase 3 — Timeline UI

**Goal:** the CapCut-feel multi-track timeline, fully gesture-driven, editing the doc through commands only.

1. Timeline canvas layout engine (`editor/doc/selectors/layout.ts`): doc → positioned clip rects at a given `pxPerSecond` zoom. Virtualized rendering (only visible clips mount).
2. Rendering: clips as DOM/CSS (rounded rects, thumbnail strips, waveforms, labels), playhead, time ruler with adaptive tick density, track headers (mute/lock).
3. Gesture layer (`editor/gestures/`): drag-to-move (with cross-track), trim handles (with edge snapping to playhead/clip boundaries/whole frames), pinch-to-zoom timeline, horizontal pan, tap select, long-press → context menu (split/duplicate/delete), two-finger scrub on ruler. All Pointer Events; no browser gesture conflicts (`touch-action` audit).
4. Commands: `AddClip` (drag from media library), `MoveClip`, `TrimClipStart/End`, `SplitClip`, `DeleteClip`, `ReorderTracks`, `AddTrack`, ripple-delete option. Every gesture ends in exactly one command (single undo step per gesture).
5. ∥ Toolbar + selection inspector shell: contextual bottom toolbar (CapCut-style) that swaps actions based on selection type.

**Accept:** Playwright WebKit: drag clip, trim, split, undo/redo each — doc state asserted after each. Manual iPad check: gestures feel right at 60 fps with 50 clips (perf trace attached to PR).

---

## Phase 4 — Playback & preview

**Goal:** frame-accurate multi-track preview with A/V sync.

1. WebGL2 compositor (`editor/playback/compositor/`): quad renderer, VideoFrame→texture upload, per-clip transform (translate/scale/rotate/opacity), track-order compositing, project background, letterboxing to project aspect. OffscreenCanvas-ready (export reuses it).
2. Transport: `AudioContext`-clocked play/pause/seek; scheduler pulls frames via P2's frame API ~500 ms ahead; audio graph per ARCHITECTURE §4.3 (clip gain → track gain → master).
3. Scrubbing: nearest-cached frame while moving, exact frame on settle; paused single-frame render on any doc change (edit → preview updates live).
4. Preview interactions: tap-select clip on canvas, drag/pinch to move/scale selected overlay (writes `transform` via command).
5. ∥ Text rasterizer v1: text clips rendered to canvas → texture (font, size, color, stroke, alignment) — needed here so text tracks preview.

**Accept:** two overlapping video tracks + audio play in sync (drift < 1 frame over 60 s, measured); scrub is smooth on iPad; edits reflect in preview within one frame render.

---

## Phase 5 — Editing features

**Goal:** the CapCut feature set on top of a now-solid core. Highly parallelizable — each item is command(s) + inspector UI + shader/audio work + tests.

1. ∥ **Speed** (0.1×–10×, affects duration + audio rate w/ pitch preserved where possible), **volume + fade in/out**, **mute**.
2. ∥ **Transitions** (cross-dissolve, dip-to-black, wipe, slide; shader-based, duration-adjustable via handle between adjacent clips).
3. ∥ **Filters & adjust** (brightness/contrast/saturation/temperature/vignette as a uniform-driven shader chain; LUT support via 3D-LUT textures from `public/builtin-assets/luts/`).
4. ∥ **Text styling & animation presets** (style presets, in/out animations: fade/slide/pop; extend Phase 4 rasterizer).
5. ∥ **Keyframes** for transform + opacity (+ volume): `AddKeyframe/MoveKeyframe/DeleteKeyframe` commands, linear + ease interpolation in compositor/audio, diamond markers on clips + inspector editing.
6. ∥ **Stickers/image overlays** (image assets on overlay tracks — mostly already works; add opacity/blend UI) and **background color/blur** for non-filling video.
7. **Audio extras:** extract audio from video clip; built-in royalty-free music shelf (static assets).

**Accept per feature:** command unit tests; renders correctly in preview; survives save/reload; undoable in one step; inspector usable with touch. A feature isn't done until it also renders identically in the Phase 6 export path (add to the golden-frame fixture project as you go).

---

## Phase 6 — Export

**Goal:** ProjectDoc → MP4 on the device, reliably.

1. Export worker: pull-based frame loop at project fps from **original** assets, composed via the shared compositor on OffscreenCanvas → `VideoEncoder` (H.264 hardware, 720p/1080p presets, sane bitrate table) → `mp4-muxer`. Backpressure via `encodeQueueSize`.
2. Audio: `OfflineAudioContext` mixdown honoring volume/fade/speed/keyframes → AAC via `AudioEncoder` if available, else ffmpeg.wasm PCM→AAC (lazy-loaded only in this fallback).
3. Export UI: resolution picker, progress (fps + ETA), cancel; deliver via Share Sheet (`navigator.share({files})`) with `<a download>` fallback.
4. **Golden-frame tests:** fixture project exercising every Phase 5 feature → export in Playwright → sample N frames → SSIM-compare against checked-in references. This is the regression net for the whole render stack.
5. Robustness: export while backgrounded (document behavior honestly — iOS will throttle; keep screen-awake via `navigator.wakeLock` where supported), disk-full handling, >10-min projects.

**Accept:** 1080p export of the golden project plays correctly in iPad Photos, A/V in sync end-to-end; golden-frame CI green; a 5-min 1080p project exports faster than 2× realtime on an M-series iPad.

---

## Phase 7 — Polish, PWA & hardening

1. PWA: manifest (standalone, landscape-primary), service worker precaching app shell + wasm (offline editing works end-to-end), install prompt UX, app icons/splash.
2. Storage UX: quota meter, `persist()` prompt flow, project backup/restore as `.ccproj` zip (doc + media) via Share Sheet.
3. Performance pass: Lighthouse + real-device traces; frame-cache tuning; code-splitting (editor engines lazy-loaded from gallery route); bundle budget in CI.
4. Error handling: GL context-loss recovery, worker crash recovery (respawn + resume queue), doc-migration tests, Sentry (or similar) wiring.
5. UX polish: onboarding empty-states, haptics-adjacent feedback (visual), keyboard shortcuts as desktop bonus, iPad multitasking (Split View resize) audit.
6. QA matrix: iPadOS 17/18/26 Safari, installed-PWA mode, low-storage device, airplane mode.

**Accept:** installable PWA edits and exports fully offline; QA matrix documented with results; no P0/P1 bugs open.

---

## Post-v1 backlog (explicitly deferred)

Cloud sync via Supabase (the command/patch model is sync-ready), auth, template marketplace, auto-captions (on-device speech or server), WebGPU compositor backend, phone layout, collaborative editing.

---

## Working agreements for implementing agents

1. **Read ARCHITECTURE.md first**; respect §4.6 boundary rules (doc layer is pure TS; React never touches WebCodecs/OPFS directly).
2. Every doc mutation goes through a Command with an inverse. No exceptions — this invariant is what keeps undo, autosave, and future sync correct.
3. Every `VideoFrame`/`AudioData` you create, you close. Reviewers should grep for allocations without matching `close()`.
4. New render features must be added to the golden-frame fixture project in the same PR (from Phase 6 onward).
5. Keep PRs phase-scoped and small; CI (typecheck, unit, Playwright WebKit, build) must be green; attach an iPad screen recording for gesture/UX PRs.
6. Branch off `main`, PR per work item. Time values follow `editor/doc/time.ts` — raw float seconds in the doc layer are a review-blocker.
