# CapCut for iPad — V2: Features & Polish Plan

Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md) (constraints, module boundaries) and [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) (the completed v1 phases). Read ARCHITECTURE first. This plan is written for implementing agents who did not build v1 — it inventories what already exists so you extend rather than rebuild, then specifies the v2 work in dependency order.

---

## 0. What already exists (do not rebuild)

Verified against the codebase at the time of writing — all of this is implemented, unit-tested (219 tests), and wired end-to-end:

| Area | Implemented today | Key files |
|---|---|---|
| Projects | Gallery, create (aspect-ratio presets + auto-detect from first video), rename, duplicate, delete, `.ccproj` backup/restore, storage meter + `persist()` | `src/routes/index.tsx`, `src/storage/*` |
| Media | Import video/image/audio → OPFS, proxy (≤960px H.264), thumbnail strips, waveforms, status badges | `src/editor/media/*` |
| Timeline | Multi-track (video/overlay/text/audio), clip thumbnails + waveforms, trim/move/split/duplicate/delete (+ripple), snapping, pinch-zoom/pan, zoom-to-fit, frame stepping, track mute/lock, draggable transition markers, ruler scrub | `src/components/editor/timeline/*`, `src/editor/doc/commands/clips.ts`, `src/editor/gestures/snap.ts` |
| Playback | `AudioContext`-clocked transport, WebGL2 compositor, A/V sync, speed affecting audio+video, volume/fade/mute, live paused re-render on edit, canvas drag/pinch transform gestures, hit-test selection, rotation-metadata correction | `src/editor/playback/*` |
| Effects | Adjustments (brightness/contrast/saturation/temperature/vignette), 3 built-in LUTs w/ intensity, 4 transitions (crossDissolve/dipToBlack/wipe/slide) with the incoming clip playing through | `src/editor/playback/compositor/*` |
| Text | Text clips: content/font-size/color/align, in/out animations (fade/slide/pop), canvas rasterizer | `textRasterizer.ts`, `textAnimation.ts`, `src/editor/doc/commands/text.ts` |
| Keyframes | x/y/scale/rotation/opacity/volume; add/delete via Inspector; interpolated in compositor and audio envelope | `src/editor/doc/commands/keyframes.ts`, `src/editor/doc/selectors/keyframes.ts`, `audioEnvelope.ts` |
| Export | 720p/1080p H.264+AAC MP4, progress/ETA/cancel, Share Sheet + download fallback, full audio mixdown honoring every clip property | `src/editor/export/exporter.ts`, `mixdownAudio.ts` |
| Platform | PWA (manifest, SW precache, offline), COOP/COEP, GL context-loss recovery, keyboard shortcuts, mobile phone layout (media drawer + inspector bottom sheet below 768px), undo/redo CommandBus | `src/pwa/*`, `public/sw.js`, `src/editor/doc/commands/bus.ts` |

E2E suite: 14 Playwright specs under `e2e/` running the **WebKit iPad Pro 11 landscape** project (`playwright.config.ts`).

---

## 1. Working agreements (binding for every item below)

1. **Doc mutations only via commands.** Every feature = command(s) in `src/editor/doc/commands/` with inverse patches, exhaustive unit tests, single undo step per user gesture. React never touches OPFS/WebCodecs directly (ARCHITECTURE §4.6).
2. **Schema changes bump `CURRENT_SCHEMA_VERSION`** and add a migration in `src/editor/doc/migrate.ts` + a migration test. The schema uses `z.literal(CURRENT_SCHEMA_VERSION)` — old projects break without this. Prefer `.optional()`/`.default()` fields so migrations stay trivial.
3. **Preview/export parity.** Anything that renders must render identically through `exporter.ts` (it reuses the compositor). A feature isn't done until an export-path test covers it.
4. **Touch-first.** ≥44pt targets, no hover-dependent UI, works in the mobile inspector bottom sheet (added recently — check both layouts).
5. **Memory discipline.** `VideoFrame.close()` everywhere, no unbounded caches, decoder pool stays ≤2. Anything that decodes extra video (freeze frame, reverse) must run in the existing media worker.
6. **Verify like v1:** `npx tsc --noEmit`, `npx vitest run`, `npm run build` green; new commands unit-tested; user-visible features get an `e2e/*.spec.ts`. Note: some dev environments only have Chromium — if WebKit isn't installable, run the spec logic manually against Chromium at the iPad viewport and say so in the PR.
7. Each milestone below is a mergeable unit. Items marked ∥ are parallelizable within their milestone.

---

## 2. Milestone P1 — Polish pass (small, high-visibility, no schema changes)

Everything here uses existing infrastructure. Highest value-per-effort; do this first.

1. **Toasts for failures and long operations.** `sonner` is already in `package.json` but never mounted. Mount `<Toaster>` in `src/routes/__root.tsx`; surface import failures (currently `console.error` only in `MediaLibrary.handleFiles`), export failures, backup/restore results, and "clip added" confirmation when the mobile media drawer auto-closes.
2. **Drag-and-drop import.** Accept file drops on the media library panel and on the editor as a whole (desktop/iPad + Stage Manager). Reuse `importMediaFile`; highlight the drop target; reject unsupported MIME types with a toast.
3. **Project gallery thumbnails.** Gallery cards show a placeholder `FilmIcon` today. Persist a poster: after the first video asset's thumbnails generate, copy thumbnail #0 to a well-known OPFS path (`projects/{id}/poster.jpg`) and load it in the gallery card. No schema change (path is derivable).
4. **∥ Loop playback toggle** in the preview transport (persisted in component state only). `Transport` currently stops at project end — add an `onEnded → seek(0) + play()` path behind the toggle.
5. **∥ Preview mute toggle** (master gain already exists — expose it) and **fullscreen preview** button (`requestFullscreen` on the canvas container, with the iOS-Safari caveat documented: falls back to a CSS "theater mode" overlay since iPhone Safari lacks element fullscreen).
6. **∥ Text stroke controls.** `TextPayloadSchema` already has `strokeColor`/`strokeWidth` and the rasterizer honors them — the Inspector just never exposes them. Add stroke width slider + color input next to the existing color field.
7. **∥ Numeric transform + reset in Inspector.** Position/scale/rotation are gesture-only today. Add X/Y/scale/rotation readouts with drag-to-adjust, "center" and "reset transform" buttons (single `setClipTransform` command each).
8. **∥ Keyframe markers on timeline clips.** Inspector lists keyframes but clips don't show them. Render diamond markers inside `TimelineClip` at `startMicros + k.atMicros / speed` positions; tapping a diamond seeks the playhead to it.
9. **∥ Clip labels.** Show the asset's `originalName` (or text content for text clips) on clips when width permits (CSS truncation; hide under ~60px).
10. **∥ Long-press context menu on clips** (split/duplicate/delete/ripple-delete) using the existing `context-menu` UI component, triggered via pointer-down timer (~500ms, cancel on move) — matches CapCut's interaction and complements the toolbar.
11. **∥ Empty-state guidance.** Empty timeline: "Import media, then tap + to add it" hint with an arrow to the media panel/drawer. Empty preview canvas at playhead with no clips: subtle project-dimensions watermark.

**Accept:** each item demoed in both desktop and phone layouts; no new schema version; vitest/tsc/build green; toast paths covered by an e2e spec that forces an import failure (bad file fixture).

---

## 3. Milestone P2 — Audio suite

CapCut's audio features are the biggest functional gap. Schema bump required (one bump covering all of P2 — coordinate).

1. **Extract audio from video clip.** Command `extractAudio(clipId)`: creates a muted flag on the source clip + a new linked audio clip on (or creating) an audio track, same `assetId`/`inPoint`/duration/speed. Playback needs no new decode path — the transport already plays audio from video assets. UI: Inspector action button for video clips.
2. **Built-in music & SFX shelf.** `public/builtin-assets/audio/{music,sfx}/` with ~6 royalty-free tracks + ~10 SFX (small, CC0, committed to the repo). New tab in the media library panel; tapping adds to an audio track at the playhead. These are `AssetRef`s with a `builtin: true` marker so backup/restore skips copying them and resolves them by URL — **this is the schema change**; migration defaults `builtin: false`.
3. **∥ Voiceover recording.** `getUserMedia` → `MediaRecorder` (AAC/mp4 on Safari) → import the blob through the normal `importMediaFile` path so waveforms/status come free. Record button in the timeline toolbar with a live level meter; recording starts playback from the playhead so the user narrates against picture, and drops the clip at the recording start point.
4. **∥ Audio fade curve on waveforms.** Render the existing `fadeInMicros`/`fadeOutMicros` as overlay ramps on audio clip waveforms, with draggable handles at the clip's top corners (like CapCut) issuing `setClipFades` on release.

**Accept:** extract → edit → export round-trip keeps A/V sync; voiceover works on real iPad Safari (mic permission flow documented); builtin assets restore correctly from a `.ccproj` made before P2 (migration test); mixdown honors all of it (extend `mixdownAudio` tests).

---

## 4. Milestone P3 — Visual/compositing features

Shader work in `src/editor/playback/compositor/`. One schema bump for the new clip fields (`fit`, `flipH/flipV`, `blendMode`, `mask`, `chromaKey` — all optional). Keep each shader addition behind the existing uniform-driven chain in `adjustments.ts` / `gl.ts`.

1. **Background fill for letterboxed video: blur / color.** Project-level setting extension (`settings.backgroundBlur?: boolean`) + per-project color already exists. Blur = render the same frame scaled-to-fill through a cheap two-pass box blur into the letterbox area before the fitted frame. This is CapCut's signature "9:16 from 16:9" look — highest priority in P3.
2. **Fit / Fill toggle per clip** (`fit: 'contain' | 'cover'`, default contain) — one uniform + UV math in the vertex path; Inspector segmented control.
3. **∥ Flip horizontal / vertical** (`flipH`, `flipV` booleans) — UV sign flip; Inspector buttons next to Rotate 90°.
4. **∥ Blend modes for overlay clips** (`normal | screen | multiply | overlay | lighten`). Implement in the fragment shader reading the destination via framebuffer ping-pong (the compositor already renders track-ordered; add a second texture bind of the accumulated frame). Inspector select, overlay tracks only.
5. **∥ More LUTs + filter previews.** Grow `public/builtin-assets/luts/` to ~10 (generate via a documented script), and render tap-target preview swatches in the Inspector by applying each LUT to the current playhead frame at thumbnail size (reuse compositor into a small offscreen canvas).
6. **Masks** (`mask: { shape: 'rect'|'circle'|'linear', feather, ...geometry }`). Shader-side signed-distance evaluation with feather; on-canvas editing handles like the existing transform gesture layer. Rect + circle first; linear wipe-style mask second.
7. **Chroma key** (`chromaKey: { color, similarity, smoothness }`) — standard YUV-distance keyer in the fragment shader; Inspector eyedropper (tap the preview canvas to pick the key color — reuse hit-test plumbing to read back the pixel).

**Accept per item:** renders identically in export (extend the export e2e fixture project); shader changes covered by `composeFrame`/`adjustments`-style unit tests where computable on CPU; masks/keyer usable with touch on the canvas; migration test for the schema bump.

---

## 5. Milestone P4 — Timeline power features

1. **Copy / paste clips.** Commands `copy` (UI state, not doc) + `pasteClip` (new ids, offset at playhead, same track kind). Keyboard Cmd+C/V as desktop bonus, long-press menu + toolbar buttons for touch.
2. **Freeze frame.** Command splits the clip at the playhead and inserts an image clip generated from the exact frame: decode one frame in the media worker → JPEG → OPFS as a derived asset. Duration default 3s.
3. **Replace media.** Inspector action: swap `assetId` on a clip keeping timing/effects (clamp `inPoint`/duration to the new asset's length). CapCut users lean on this constantly for template-style editing.
4. **∥ Multi-select** (tap-and-hold then tap others, or marquee on desktop): delete/duplicate/move as a group — one command per gesture (`moveClips`, `deleteClips`). Keep scope to move/delete/duplicate; no group styling.
5. **∥ Timeline markers.** Project-level `markers: { id, micros, label, color }[]` (schema bump shared with P4 items needing it), rendered on the ruler, snappable, add/remove via toolbar at playhead.
6. **Reverse clip** *(stretch — only after the rest of P4 lands)*: requires reverse-order re-encode of the clip's source span into a derived OPFS asset in the media worker (decode forward in chunks → buffer GOP-sized frame groups → encode reversed). Show progress like import. Audio reverses via `AudioBuffer` sample reversal. Do not attempt real-time reverse playback.

**Accept:** all commands unit-tested incl. undo; multi-select gestures don't fight pan/zoom (pointer-capture audit like the existing `panZoom.ts`); freeze/replace/reverse render correctly in export; markers survive save/reload + backup.

---

## 6. Milestone P5 — Text upgrade

1. **Font shelf.** Self-host 6–8 display fonts via `@fontsource/*` packages (COEP forbids Google Fonts CDN — ARCHITECTURE §2.4). Load them with `document.fonts.load()` before rasterizing; Inspector font picker with per-font preview rows. Export parity is automatic (same rasterizer) but add a golden test that a non-Inter font renders (guards against export running before fonts are ready — `await document.fonts.ready` in the exporter).
2. **Text shadow + background box.** Extend `TextPayload` (`shadow?: { color, blur, dx, dy }`, `background?: { color, radius, opacity }`) — rasterizer draws box behind, shadow via canvas `shadowColor/Blur/Offset`. Inspector controls grouped under a "Style" disclosure.
3. **∥ Style presets.** ~8 one-tap presets (combinations of the above + stroke) as data in `src/editor/text/presets.ts`, rendered as thumbnail chips in the Inspector (rasterize "Aa" at small size).
4. **∥ More animations:** `typewriter` (per-character reveal) and `bounceIn` added to `TextAnimationSchema` + `textAnimation.ts`. Typewriter needs the rasterizer to accept a character-count clamp — keep the interpolation in `textAnimation.ts` pure and unit-tested like the existing ones.

**Accept:** schema bump + migration; fonts load offline (SW precaches them); animations unit-tested; presets render identically in preview and export.

---

## 7. Milestone P6 — Export & delivery upgrades

1. **Frame-rate picker** (24/30/60, default = project fps) and **quality tiers** (Low/Med/High bitrate multipliers on the existing table) in `ExportDialog`.
2. **Export range:** optional in/out points set from the timeline (toolbar "set in/out at playhead", rendered as a shaded ruler region — UI state, not doc). Exporter already takes a duration; generalize to `{ startMicros, endMicros }`.
3. **∥ Cover frame picker:** choose a poster frame; embed as the first frame's thumbnail *and* offer "Save cover as image" (PNG via canvas download). Also updates the project-gallery poster from P1.3.
4. **∥ Social presets** in the dialog: chips for TikTok/Reels (1080×1920), Shorts, Square 1:1, Landscape 16:9 — these just pre-select resolution and warn if project aspect differs (no re-layout).

**Accept:** exports verified frame-accurate at each fps (extend `exporter.test.ts`); range export honors keyframes/transitions crossing the in-point; e2e export spec extended.

---

## 8. Explicitly deferred (do not build in v2)

Speed curves, auto-captions, stickers/GIF library beyond image import, HDR, cloud sync/auth, template marketplace, WebGPU backend, collaborative editing, pitch-preserved speed change (Safari's `AudioBufferSourceNode` has no `preservePitch`; a phase-vocoder is out of scope).

---

## 9. Suggested build order & parallelization

```
P1 (polish)  ──►  P2 (audio)  ──►  P4 (timeline power)
     │                                    
     └──────►  P3 (visual)   ──►  P5 (text)  ──►  P6 (export)
```

- P1 first, always — it touches every surface and establishes the toast/error patterns later milestones use.
- P2 and P3 are independent; two agents can run them in parallel **but each owns its own schema bump** — land them serially or coordinate a shared bump to avoid migration conflicts.
- Within every milestone, ∥ items are safe to parallelize across agents.
- Rough sizing: P1 ≈ small×11, P2 ≈ medium, P3 ≈ large (shader work), P4 ≈ medium+stretch, P5 ≈ medium, P6 ≈ small.
