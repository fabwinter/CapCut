# Mobile-First CapCut — Feature & Polish Plan

**Audience:** the implementing agent picking up after Phase 3–7 + fix rounds (PRs #12–#20).
**Goal:** turn the current iPad-landscape editor into a genuinely mobile-first (phone-portrait-primary) CapCut-class editor with polished design and a deeper edit feature set — while keeping the desktop/iPad layout working.

Read `docs/ARCHITECTURE.md` first. Everything there still holds (proxy-first editing, command bus, WebGL2 compositor, OPFS/IDB storage, export as a pure function of `ProjectDoc`). This plan builds *on top of* that architecture; it does not change it.

---

## 0. How to work (conventions the previous agent established — follow them)

- **Branch:** develop on `claude/phase-3-7-implementation-s6tc6k`. PRs against `main` get merged quickly; after each merge, restart the branch from `origin/main` (`git fetch origin main && git checkout -B claude/phase-3-7-implementation-s6tc6k origin/main`) before the next round. Never stack on merged history.
- **Verification loop per round:** `bun run typecheck` → `bun run test` (Vitest) → full Playwright e2e. The repo's configured WebKit project does not run in the sandbox; create a temporary `pw.chromium.config.ts` (Desktop Chrome project, `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`) for e2e runs and **delete it before committing**.
- **Every feature ships with tests:** unit tests for pure logic (commands/selectors — `src/editor/doc/**`), e2e for UI behavior (use `data-*` attributes as selectors, e.g. `data-action="split"`, `data-field="speed"` — keep this convention).
- **Real-device humility:** the user tests on a physical iPad/iPhone and reports back with screenshots. Anything touch/gesture/Safari-specific cannot be fully verified in the sandbox — say so in the PR, and prefer designs that degrade safely. Past bugs that only manifested on device: Safari `texImage2D(VideoFrame)` rejection, hardware decode session exhaustion, decoder pipelining stalls. The fallbacks for these live in `frameSource.ts` and `gl.ts` — do not remove them.
- **Commits:** clear messages explaining *why*; one logical change per commit. No model identifiers in commits/PRs.

---

## 1. Where the product stands today (inventory)

Working: multi-track timeline (video/overlay/text/audio) with drag/trim/split/duplicate/delete/snap, pinch-zoom + toolbar zoom + zoom-to-fit, playhead navigation (buttons + Home/End/arrows), transitions (4 types, draggable timeline marker, both clips play through the blend), text clips (add/edit content, size, color, align, in/out animations), keyframes (transform/opacity/volume), adjustments (brightness/contrast/saturation/temperature/vignette), LUTs, speed/volume/mute/fade, per-clip rotate-90 correction, auto rotation from container metadata, project settings (aspect ratio/fps, auto-detect on first import), import with proxy/thumbnail/waveform generation, playback (AudioContext clock, WebGL2 compositor), export (H.264/AAC MP4), PWA/offline, backup/restore, storage meter, GL context-loss recovery, undo/redo.

**The gap is not engine capability — it's (a) the phone layout doesn't exist, (b) the UI is functional but unpolished, and (c) several table-stakes CapCut features are missing (music, voiceover, stickers, canvas background, playback niceties).**

Current layout assumes landscape width: `edit.$projectId.tsx` renders header / [MediaLibrary | Preview | Inspector] / Timeline, with Inspector a fixed `w-72` sidebar and MediaLibrary a left panel. On a phone portrait viewport this is unusable.

---

## 2. Design direction (applies to every phase)

CapCut's mobile design language, adapted to the existing Tailwind 4 + shadcn/ui kit:

- **Dark-first.** The editor is already dark; commit to it. Blacks `#0a0a0b`–`#141416`, one accent (the existing primary), thin `border-border` hairlines, `rounded-xl` surfaces. No light-mode work inside the editor.
- **Touch targets ≥ 44 px** for anything a finger hits (toolbar buttons are currently `icon-sm` / ~28 px — acceptable inside dense clusters on iPad, but every *phone* control must be ≥ 44 px).
- **Safe areas everywhere:** `env(safe-area-inset-*)` on header, bottom toolbars, and sheets (header already does top; bottom is not handled).
- **Sheets, not sidebars.** On phones every secondary surface (inspector, media library, export, settings) becomes a bottom sheet. Use Radix Dialog styled as a sheet (or `vaul` if adding a dependency is justified — prefer building on what's in `components/ui`).
- **Motion:** 150–250 ms ease-out transforms for sheet entry, toolbar swaps, and selection changes. Respect `prefers-reduced-motion`. No layout-thrash animations on the timeline (transform/opacity only).
- **One-thumb reachability:** primary actions live in the bottom 40% of the screen. The preview is view-only up top; all controls cluster at the bottom.
- **Feedback:** every commit-style action (split, delete, transition applied) gets visible confirmation — selection flash, subtle scale pulse on the affected clip. Web has no haptics on iOS Safari; visual feedback substitutes.

---

## 3. Phases

Ordered by user-visible value per unit of risk. Each phase = one PR round with the full verification loop.

### Phase M1 — Responsive shell: the phone layout exists

**The single highest-value change.** Introduce a breakpoint-driven editor shell in `edit.$projectId.tsx`:

- `useMediaQuery` hook (new, `src/hooks/`) with a `compact` breakpoint (`max-width: 768px` or `pointer: coarse` + portrait — decide once, document it).
- **Compact layout (top → bottom):** slim header (back, project name, undo/redo, export) → preview canvas (letterboxed, max ~45vh) → transport strip (play/pause, time, fullscreen) → timeline (flex-1) → **bottom tool bar** (safe-area padded).
- **Bottom tool bar** replaces both MediaLibrary-as-panel and Inspector-as-sidebar:
  - Nothing selected: `[+ Media] [Text] [Audio] [Settings]` — big labeled icon buttons.
  - Clip selected: contextual actions `[Edit] [Split] [Duplicate] [Delete] [Transition…]`, where **Edit** opens the Inspector sheet.
- **Inspector becomes a bottom sheet** in compact mode (~60vh, drag handle, internally scrollable, swipe-down/backdrop dismiss). Refactor `Inspector.tsx` so the *content* is a layout-agnostic component (`InspectorPanels`) rendered either in the existing `w-72` aside (wide) or in the sheet (compact). Same for `MediaLibrary`.
- Timeline in compact mode: shrink track header column (`TRACK_HEADER_WIDTH_PX` → compact variant ~44 px, icons only), keep pinch-zoom as the primary zoom gesture.
- e2e: run key flows under a phone viewport (add a second Playwright project `devices['iPhone 14 Pro']`-shaped in the temp chromium config — set viewport/touch manually since it must run on chromium). Minimum: create project → import image → add to timeline → select → edit via sheet → export dialog opens.

**Acceptance:** at 390×844 the editor is fully operable one-handed; no horizontal body scroll; all existing wide-layout e2e still pass.

### Phase M2 — Preview & transport polish

- **Fullscreen preview mode:** tap expand icon → preview fills viewport, minimal overlay controls (play, scrub bar, time, exit). The scrub bar here is a simple full-width slider mapped to project duration.
- **Transport strip:** current time / duration readout (frame-accurate, `MM:SS.f`), play/pause (large, center), loop toggle. Wire loop into `Transport` (`src/editor/playback/transport.ts`): on reaching project end while playing with loop on, seek 0 and continue.
- **Scrub-on-preview:** horizontal drag on the preview canvas scrubs the playhead (CapCut behavior) when no clip is selected; keep tap-to-select and drag-to-transform when a clip *is* selected (hit-test decides: pointer-down on empty region = scrub).
- **Snapping/haptic-style feedback on timeline:** when a drag snaps to a boundary/playhead, flash a vertical guide line (1 px accent) at the snap position. The snap logic exists in `src/editor/gestures/snap.ts`; this is render-only.
- Polish: animate playhead line with `transform` not `left` (measure first — only if `left` is actually janky).

**Acceptance:** e2e for loop (play with loop on a short project, assert time wraps), fullscreen enter/exit, preview scrub moving `data-playhead`.

### Phase M3 — Audio features: music, extract, voiceover

The audio track type exists and mixes correctly; there's just no way to get audio *in* besides importing a file.

- **Built-in music/SFX library:** ship 8–12 CC0 tracks + a few SFX under `public/builtin-assets/audio/` (small, AAC/M4A). New "Audio" bottom-bar entry → sheet with two tabs: *Music* (built-ins, tap to preview via `<audio>`, "+" to import-to-project through the existing `importMediaFile` path so waveforms/OPFS work unchanged) and *Files* (existing file-picker import filtered to audio).
- **Extract audio from video clip:** command + UI (`data-action="extract-audio"` on a selected video clip): demux the original's audio track, write it to OPFS as a new audio asset, add an audio clip aligned to the video clip's position, set the video clip `muted: true`. Reuse `probeContainer`/mp4box; decode-re-encode is *not* needed if the container's audio track can be remuxed — if that's more than a day of work, decode → WAV in OPFS is acceptable (proxy-quality is fine for editing; export mixes from the original anyway **only if** the asset points at the original — decide and document which file the new asset references).
- **Voiceover recording:** record button in the Audio sheet → `getUserMedia` + `MediaRecorder` → blob → import as audio asset placed at the playhead. Show a live recording indicator with elapsed time. Handle permission denial with a clear message. (Cannot be e2e-verified against a real mic in CI — use Playwright's fake media stream flags in the temp config: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.)
- Inspector: audio clips already get volume/fade; verify the audio-clip inspector hides video-only sections (same pattern as text clips).

**Acceptance:** unit tests for the extract-audio command; e2e: add built-in music track to timeline and see waveform clip on an audio track; record voiceover with fake mic and see a clip appear.

### Phase M4 — Overlays, stickers, canvas

- **Canvas background:** `settings.background` exists and the compositor clears with it. Add UI: Project Settings gains a background color row (color input + a few presets + blur-fill toggle *deferred*). One command (`setProjectSettings` already supports it or extend it).
- **Sticker/overlay images:** "Overlay" bottom-bar entry → sheet: import an image → lands on the overlay track at the playhead (3 s default), *plus* a small built-in sticker pack (12–20 CC0 PNGs/webp with alpha, `public/builtin-assets/stickers/`). Imported via the existing image path so nothing new in the engine.
- **Preview transform handles:** when a clip is selected, draw selection chrome on the preview — bounding box + corner scale handle + rotate handle (the transform math is in `transform2d.ts`; hit-testing in `hitTest.ts`; drag/pinch transform already works — this adds *visible affordances* and single-finger corner-drag scale/rotate for phones where pinch conflicts with two-thumb reach).
- **Text presets:** 6–8 one-tap styles (font size/color/stroke combos) as buttons above the text fields in the Inspector text section; each is just a `setClipText` patch. Add 2–3 self-hosted display fonts (license-checked, e.g. from Fontsource) to give presets visible range — fonts must be self-hosted for COOP/COEP.

**Acceptance:** e2e: change background color and assert canvas clear color via pixel read; add sticker → clip on overlay track; apply text preset → payload fields change.

### Phase M5 — Timeline & editing depth

- **Long-press context menu** on clips (touch parity for right-click): duplicate, split, delete, extract audio (video), "edit" (opens sheet). Implement in the existing gesture layer (`TimelineClip.tsx` pointer handlers + a 500 ms timer; cancel on move > slop).
- **Multi-select (stretch, only if the round has room):** long-press empty lane → selection mode; taps toggle selection; bulk delete/move. Requires `selectedClipIds: string[]` in the store — touches many files; scope it to select+delete only.
- **Clip reorder affordance:** dragging a clip already moves it; add auto-scroll when dragging near the timeline's left/right edges (currently a drag dies at the viewport edge). ~30 px/frame scroll inside `onPointerMove` when within 40 px of an edge.
- **Keyframe visibility:** draw keyframe diamonds on the selected clip in the timeline (positions from `clip.keyframes[].atMicros` → px). Tap a diamond → playhead jumps there. Deleting stays in the Inspector list.
- **Better empty states:** empty timeline shows "Tap + to add media"; empty project gallery already has one — keep visual language consistent.

**Acceptance:** e2e: long-press (Playwright `page.touchscreen`/pointer with delay) opens the menu and delete works; keyframe diamonds appear after adding a keyframe; drag near edge scrolls.

### Phase M6 — Design polish pass & PWA finish

- Sweep every surface against Section 2: target sizes, safe areas, sheet motion, focus states, consistent iconography (lucide only), consistent section headers, spacing rhythm (4/8/12).
- **App icon + splash:** proper icon set in `public/`, `apple-touch-icon`, maskable icon, theme-color; verify installed-PWA look on iOS (status bar style, standalone display).
- **Export UX:** progress with fps/ETA (exporter already reports progress events — surface them), success state with Share button (`navigator.share({ files })` when available, download fallback), file name = project name.
- **Error surfaces:** the clip-error banner exists; make it human ("This clip couldn't be decoded — try re-importing") with the technical detail behind a disclosure.
- **Performance audit:** with a 20-clip project, timeline interactions ≥ 55 fps on desktop chromium (React Profiler / rAF timing in an e2e); memoize `TimelineClip` if needed; verify no per-frame allocations added by new UI in `composeFrame`.

**Acceptance:** Lighthouse PWA pass; e2e export-success flow; no dropped-frame regressions in the profiling harness.

---

## 4. Explicitly out of scope (do not start these)

- AI features (auto-captions, background removal, TTS) — no backend for it.
- Cloud sync/auth, collaboration.
- ffmpeg.wasm fallback work beyond what exists.
- WebGPU backend.
- Landscape-phone layout (portrait phone + existing wide layout only).
- Chroma key / masking (revisit after M6 — needs new shader work; the LUT/adjustment shader chain in `gl.ts` is where it would slot).

## 5. Risks specific to this plan

| Risk | Mitigation |
|---|---|
| Sheet gestures fight timeline gestures on phones | Sheets only open from the bottom bar, never from timeline swipes; sheet drag handle is the only drag-to-dismiss region |
| `MediaRecorder` audio format varies (webm/opus on Chrome, mp4/aac on Safari) | Store the blob as-is; `decodeAudioData` handles both for waveform/mix; document that voiceover assets skip the proxy path |
| Built-in assets bloat the bundle | Load music/stickers lazily from `public/` (fetch on sheet open), never import into the JS bundle; keep total < 15 MB |
| Long-press timer vs. scroll intent | 500 ms + 8 px slop cancel; test on real device early |
| Compact refactor breaks wide-layout e2e | Extract shared content components first (pure refactor commit, all tests green) *then* add the compact shell |

## 6. Definition of done (whole plan)

A first-time phone user can: create a project → shoot-style import a video (auto aspect ratio) → trim it, add a second clip with a transition → add music + a voiceover → add a sticker and styled text → color-grade with a LUT → export and share — entirely one-handed in portrait, with no dead-ends, on iOS Safari. All along, the iPad/desktop layout keeps working and the full test suite stays green.
