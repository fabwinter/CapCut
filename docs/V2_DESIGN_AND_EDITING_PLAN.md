# V2 Plan — iPhone/iPad-first CapCut with best-in-class design

**Audience:** the implementing agent. This document supersedes Phases 3–7 of
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) (Phases 0–2 are built and merged; their
working agreements still apply). [`ARCHITECTURE.md`](./ARCHITECTURE.md) remains the technical
authority for the engine layers — nothing here changes the doc/command/media architecture.

Two shifts from the original plan:

1. **iPhone-first, iPad-great.** The original plan targeted iPad landscape. CapCut's real center
   of gravity is a phone held in portrait. The editor must be designed portrait-first and adapt
   *upward* to iPad, not the reverse.
2. **Design is a deliverable, not a polish phase.** Every milestone below ships with its visual
   and interaction design finished to the spec in Part A. "Works but ugly" does not pass
   acceptance.

---

## 0. Current state (verified, on `claude/capcut-ipad-architecture-eqxxwt`)

| Layer | Status | Key files |
|---|---|---|
| Scaffold, Vercel deploy, COOP/COEP isolation | ✅ done | `vite.config.ts`, `vercel.json` |
| ProjectDoc schema (tracks/clips/keyframes/effects/text/transitions all modeled) | ✅ done | `src/editor/doc/schema.ts` |
| CommandBus (Immer patches, bounded undo/redo, no-op detection) | ✅ done | `src/editor/doc/commands/bus.ts` |
| Commands: project, assets | ✅ done | `src/editor/doc/commands/{project,assets}.ts` |
| Time base: **integer microseconds** (`Micros`), frame snapping | ✅ done | `src/editor/doc/time.ts` |
| Storage: IndexedDB docs, OPFS media tree, quota helpers | ✅ done | `src/storage/*` |
| Editor session store (zustand + autosave w/ flush-on-close) | ✅ done | `src/editor/state/editorStore.ts` |
| Media engine: import → OPFS, mp4box probe, worker proxy+thumbnails (WebCodecs), waveforms | ✅ done | `src/editor/media/*` |
| Media library panel (fixed 256px left sidebar — **to be replaced**, see A3) | ✅ done | `src/components/editor/MediaLibrary.tsx` |
| Routes: gallery `/`, editor `/edit/$projectId` (preview + timeline are placeholders) | ✅ done | `src/routes/*` |
| Tests: 24 unit (vitest), 5 e2e (Playwright), fixtures `e2e/fixtures/test-clip{,-vp9}.mp4` | ✅ green | `e2e/*` |

**Not built yet:** timeline UI, gestures, playback/compositor, all editing operations beyond
asset management, export, PWA. That is what this plan covers.

---

## Part A — Design system ("amazing design")

CapCut's editor reads as a **near-black tool with a single luminous subject** (the video) and
quiet, precise chrome. Recreate that feel — not a clone of its pixels, but its hierarchy:
preview is sacred, timeline is tactile, controls are contextual and label-under-icon.

### A1. Design tokens

Add these as CSS variables in `src/styles.css` (extend the existing `@theme inline` block —
don't fork a second token system). The editor always renders dark; these override the shadcn
neutrals **inside the editor route only** (scope under a `.editor-surface` class on the editor
root so the gallery can stay standard shadcn).

```css
/* Surfaces (back → front) */
--editor-bg:        oklch(0.13 0 0);        /* app background, timeline area  */
--editor-preview:   oklch(0 0 0);           /* preview letterbox — pure black */
--editor-panel:     oklch(0.185 0 0);       /* toolbars, sheets, track lanes  */
--editor-panel-hi:  oklch(0.24 0 0);        /* pressed/hover, clip bodies     */
--editor-hairline:  oklch(1 0 0 / 8%);      /* 1px separators                 */

/* Content */
--editor-fg:        oklch(0.97 0 0);
--editor-fg-dim:    oklch(0.65 0 0);        /* labels, timecodes              */

/* Accents — used sparingly */
--editor-accent:    oklch(0.72 0.19 25);    /* record-red/coral: record, export, destructive-adjacent emphasis */
--editor-selection: oklch(0.97 0 0);        /* selected clip border = WHITE, CapCut-style */
--editor-audio:     oklch(0.75 0.13 195);   /* cyan: audio clips + waveforms  */
--editor-text-clip: oklch(0.8 0.15 85);     /* amber: text clips              */
--editor-overlay:   oklch(0.7 0.15 300);    /* violet: overlay/sticker clips  */
--editor-keyframe:  oklch(0.85 0.17 85);    /* keyframe diamonds              */
```

Rules of use:
- **White is the selection color.** A selected clip gets a 2px white rounded border with two
  white trim-handle tabs. Nothing else in the timeline is pure white.
- Track-kind colors (audio cyan, text amber, overlay violet) appear only as the clip body tint
  and waveform stroke — never as chrome.
- The coral accent appears in exactly three places: Export button, record-style destructive
  confirmations, and the playhead's current-time text when playing.
- Everything else is the neutral ramp. If a screen has more than one accent hue visible outside
  the timeline clips, it's over-designed.

### A2. Type, spacing, iconography, motion

- **Type:** Inter Variable (already self-hosted). Editor chrome: 11px labels
  (`text-[0.6875rem]`), 13px controls, tabular-nums for all timecodes
  (`font-variant-numeric: tabular-nums` — mandatory, timecodes must not jitter). Timecode
  format `M:SS.f` under 10 min, `MM:SS` in ruler ticks.
- **Touch targets:** ≥44×44pt for every interactive element, no exceptions. Visual size may be
  smaller (e.g. a 12px trim handle) but the hit area must be padded to 44pt — use generous
  `::after` hit-area expansion or padded wrappers, and prove it in an e2e assert on
  `getBoundingClientRect` of the *hit target*.
- **Icons:** lucide-react, 20px in toolbars, 1.75px stroke. Toolbar buttons are **icon over
  9–11px label**, vertically stacked (this label-under-icon pattern is load-bearing for the
  CapCut feel — buttons without labels fail review).
- **Radii:** clips 8px; sheets/panels 16px top corners; buttons follow existing shadcn tokens.
- **Motion:** one system — `transition: 200ms cubic-bezier(0.32, 0.72, 0, 1)` (fast-out,
  settle-in; feels like UIKit springs without a physics lib). Sheets slide up with it, toolbar
  pages cross-fade+slide 12px, selection borders pop in with a 1.02→1.0 scale. Playhead and
  scrubbing move with **zero** transition — direct manipulation must never lag the finger.
  Respect `prefers-reduced-motion` (drop transforms, keep opacity fades).
- **Feedback (haptic substitute):** on snap events (clip edge → playhead / neighbor / frame),
  flash a 1px white alignment guide line for 150ms and (where supported)
  `navigator.vibrate?.(4)`. Silent no-op elsewhere.

### A3. Layout anatomy

**Phone portrait (primary target — design at 390×844, test at 320×568 minimum):**

```
┌──────────────────────────────┐
│ ◀   Untitled    1080p ▾  [Export] │  Top bar, 44pt + safe-area. Undo/redo live HERE on phone
│──────────────────────────────│
│                              │
│         PREVIEW              │  Fills all slack space (flex-1), pure black,
│      (letterboxed video)     │  video letterboxed inside
│                              │
│──────────────────────────────│
│  0:03.4 / 0:12.0    ▶   ⛶   │  Transport strip, 44pt: time, play/pause, fullscreen
│──────────────────────────────│
│ ─────────╂──────────────     │  Ruler (20px) + playhead ╂ fixed at horizontal center
│ [thumb][thumb][thumb]        │  Video track lane, 48px clips
│ ≈≈≈≈≈≈≈≈≈≈≈                  │  Audio lane 32px, text/overlay lanes 28px (lanes scroll
│  + Add audio                  │  vertically if >3; empty lanes show ghost "+ Add" row)
│──────────────────────────────│
│ [✂split][🗑del][⧉dup][⚡spd][🔊vol] │  CONTEXTUAL toolbar, 64pt, horizontally scrollable,
│──────────────────────────────│  icon-over-label buttons. Content depends on selection.
│ safe-area-inset-bottom       │
└──────────────────────────────┘
```

Layout invariants:
- **The playhead is fixed at the horizontal center of the timeline viewport; the timeline
  scrolls under it.** This is the single most CapCut-defining interaction decision. Scrubbing =
  panning the timeline. `currentTime` derives from scroll offset and vice versa.
- Media library is **not a sidebar**. On phone it's a bottom sheet (use the existing `vaul`
  `drawer.tsx`), opened from a `+` button that sits inline at the end of the video track and in
  the root toolbar. Rework `MediaLibrary.tsx` into sheet content (grid of 3-across thumbnails,
  import tile first); delete the `<aside>` from `edit.$projectId.tsx`.
- The contextual toolbar swaps **pages** by selection state (see A5); drill-in pages get a `◀`
  back button as their first item.
- Inspectors (speed, volume, text style…) are **half-height bottom sheets over the timeline;
  the preview stays visible** so every adjustment is seen live. Sheets never cover the preview.

**iPad / landscape (adapt upward):** same vertical stack, plus: timeline area grows to ~40%
height; media library may present as a 320px overlay panel from the left edge (still an
overlay, not a layout-shifting sidebar); inspectors may present as a 360px right-side sheet;
top bar gains the project-name rename affordance (already built). Breakpoint: use the existing
`use-mobile.ts` hook, threshold 768px. **Every milestone's e2e must run in both a
390×844 portrait viewport and the existing iPad landscape project.**

### A4. Component specs (build in `src/components/editor/`)

- **`Timeline.tsx`** — the orchestrator: horizontal scroll container (native momentum scroll,
  `touch-action: pan-x` on lanes; pinch handled by the gesture layer), ruler, lanes,
  center-fixed playhead overlay (2px white line, 12px triangular head), and the white
  "add-media ghost tile" at the end of the video track.
- **`ClipView.tsx`** — 8px rounded body. Video clips: thumbnail filmstrip (repeat thumbnails
  from the asset's OPFS strip at natural width, `overflow: hidden`, never stretched). Audio:
  cyan-tinted body + waveform path from the stored `Float32Array` peaks. Text: amber body with
  the text content as the label, `T` glyph prefix. Selected: 2px white border + top/bottom white
  bars + trim handles (vertical white tabs, 12px visual / 44pt hit, rounded outward). Clip label
  row: 9px, name + duration, single line, fades out below 60px clip width.
- **`TimelineRuler.tsx`** — adaptive ticks: whole-second labels while `pxPerSecond < 120`,
  half/quarter-second and then frame ticks as zoom deepens; labels in `--editor-fg-dim`.
- **`TransportStrip.tsx`** — `0:03.4 / 0:12.0` (current coral while playing / total dim),
  centered 44pt play/pause (filled white triangle/bars — the largest icon in the app),
  fullscreen-preview toggle on the right.
- **`EditorToolbar.tsx`** — the contextual pager. Root page (nothing selected): `Edit` (opens
  clip tools when a clip is tapped — mirrors CapCut), `Audio`, `Text`, `Overlay`, `Aspect`,
  plus `+ Media`. Pages are declarative arrays of `{icon, label, action | subpage}` so adding a
  tool never means re-laying-out a toolbar.
- **`InspectorSheet.tsx`** — vaul-based half sheet: drag handle, 13px title row with
  cancel/confirm (`✕` / `✓`), body. All parameter edits inside dispatch **live** commands with
  the debounced-single-undo-step pattern (see A5).
- **`ParamSlider.tsx`** — the one slider to rule all inspectors: full-bleed 44pt track row,
  current value bubble above the thumb while dragging, optional center-detent (for speed=1×,
  volume=100%) with snap + feedback flash. Built on the existing `slider.tsx`, restyled.

### A5. Interaction & gesture spec (`src/editor/gestures/`)

Implement on **Pointer Events** with manual gesture recognition (no library). One
`useTimelineGestures` hook owning a small state machine: `idle → pressing → (tap | long-press |
drag-clip | trim | pan | pinch)`.

| Gesture | Behavior |
|---|---|
| Tap clip | Select (single selection v1). Tap empty lane = deselect. Toolbar page swaps accordingly. |
| Tap preview | Toggle transport play/pause. |
| Drag selected clip | Horizontal move along its track; crossing 60% into an adjacent compatible lane moves tracks. Ghost original stays at 30% opacity until drop. Auto-scroll when within 48px of viewport edge. Snap (±8px screen-space) to: playhead, clip edges, 0. Snap = guide flash + vibrate (A2). Drop dispatches **one** `MoveClip`. |
| Drag trim handle | Trims `start`/`duration` + `inPoint`/`outPoint`, clamped to asset bounds & min duration (100ms). Live filmstrip reflow. Frame-snapped via `snapToFrame`. One `TrimClip*` command on release. |
| Horizontal pan (empty area or unselected region) | Scrubs (scroll-linked playhead). Momentum via native scroll. |
| Pinch (two pointers on timeline) | Zoom `pxPerSecond` around the pinch centroid, clamp 8–480 px/s. No command (view state, zustand only). |
| Long-press clip (350ms, <8px movement) | Context menu (existing `context-menu.tsx`): Split, Duplicate, Delete, Extract audio (stub). |
| Double-tap timeline | Zoom-to-fit whole project. |

**Command granularity rule (critical for undo UX):** one *gesture* or one *committed inspector
change* = one undo step. Continuous inputs (slider drags, trim drags) update a **transient
preview value** in the zustand store while active and dispatch the single real command on
release/confirm. Never dispatch per-pointermove.

### A6. Design acceptance gate (applies to every milestone)

A milestone is done only when:
1. Phone-portrait and iPad-landscape screenshots are attached to the commit/PR description.
2. All A1 token rules hold (spot-check: no stray accent colors, white = selection only).
3. Timecodes are tabular; nothing jitters during playback.
4. Every new interactive element proves a ≥44pt hit target in e2e.
5. Playhead/scrub/drag run at 60fps with 20+ clips (Chrome tracing screenshot or perf note in
   the commit message).

---

## Part B — Milestones

Order is strict — each builds on the previous. Keep the Phase-0–2 working agreements: every doc
mutation via Command+inverse, `VideoFrame`s closed, engines never imported into React except
through their public APIs, `bun run typecheck && bun run test` + e2e green before every commit.

### M1 — Timeline (replaces old Phase 3) ~the biggest milestone
- `src/editor/doc/selectors/layout.ts`: pure `docToLanes(doc, pxPerSecond)` → positioned rects;
  virtualization (render only clips intersecting viewport ±1 screen).
- Commands in `src/editor/doc/commands/clips.ts`: `AddClipFromAsset` (appends at playhead or
  end-of-track; creates the right track kind if missing), `MoveClip`, `TrimClipStart`,
  `TrimClipEnd`, `SplitClip` (at playhead; splits keyframes/fades correctly), `DeleteClip`,
  `DuplicateClip`. Exhaustive unit tests incl. undo round-trips and overlap resolution
  (v1 policy: same-track clips may not overlap; moves clamp to gaps, CapCut-style).
- All A3/A4/A5 timeline components & gestures; media sheet rework; add-to-timeline flow
  (tap asset in sheet → `AddClipFromAsset` → sheet closes → new clip selected).
- Timeline view state (scroll↔time binding, zoom, selection) in a new `timelineStore.ts`.
- E2E (both viewports): add two clips → drag reorder → trim → split → delete → undo×4 →
  redo×4, asserting doc state via a `window.__capcut_doc_snapshot__` test hook after each step.

### M2 — Playback (old Phase 4)
- `src/editor/playback/`: WebGL2 compositor (transform/opacity per clip, track order,
  letterbox, project background), `AudioContext`-clocked transport, frame scheduler pulling
  from a new `frameSource.ts` in the media engine (`getFrames(assetId, range, quality)` —
  decoder pool ≤2, LRU byte-budgeted cache, keyframe seek; **proxy** quality during editing).
- Scroll-linked scrubbing renders the composed frame at the center-playhead time (nearest
  cached frame while moving, exact on settle). Any doc change re-renders the paused frame.
- Preview canvas replaces the placeholder; tap-to-play; transport strip goes live.
- Image clips and text clips (canvas-rasterized, A4 text spec deferred to M4 — plain white
  Inter for now) composite correctly.
- A/V sync: drift <1 frame over 60s (automated where the sandbox allows: VP9 fixture, measure
  `video.timestamp - audioClock` deltas; document a manual iPad check otherwise).

### M3 — Core edit operations
- Toolbar pages + inspector sheets for: **Speed** (0.1–10×, detent at 1×; duration recomputes,
  audio rate follows), **Volume** (0–200%, detent 100%, mute toggle), **Fade** in/out
  (0–3s sliders), **Delete/Duplicate/Split** as toolbar actions, **Aspect** page
  (project 9:16 / 16:9 / 1:1 / 4:5 presets via `SetProjectSettings`).
- Preview transform gestures: drag to reposition, pinch to scale, two-finger rotate on the
  selected overlay clip in the preview canvas → single `SetClipTransform` per gesture, with
  snap-to-center guides (white cross-hair flash).
- Extract-audio action (video clip → linked audio clip on an audio track).

### M4 — Text, filters, transitions (the "wow" layer)
- **Text:** styled rasterizer (font size/color/stroke/alignment already in schema), style
  presets row (8 presets as tappable thumbnails), keyboard-aware editing (sheet pins above the
  iOS keyboard using `visualViewport`), in/out animations (fade/slide/pop) evaluated in the
  compositor.
- **Filters/Adjust:** shader uniform chain (brightness/contrast/saturation/temperature/
  vignette) + 8 built-in LUTs (ship `.cube`-derived 3D-LUT PNGs in `public/builtin-assets/luts/`);
  filter picker = horizontal thumbnail rail rendering the *actual current frame* through each
  LUT (64px live previews — this is the single highest-impact design moment in the app).
- **Transitions:** tap the junction chip between adjacent clips → sheet with None/Dissolve/
  Dip-to-black/Wipe/Slide + duration slider; shader crossfade in compositor; junction chip UI
  (16px rounded square, `⧗` glyph when active).

### M5 — Export (old Phase 6)
- Export worker: original-quality frame loop through the same compositor (OffscreenCanvas) →
  `VideoEncoder` H.264 → `mp4-muxer`; `OfflineAudioContext` mixdown → AAC (AudioEncoder, else
  ffmpeg.wasm fallback — lazy-loaded only here). Reuse the M2 `frameSource` at `original`
  quality. Capability-gate with the same fast-fail pattern Phase 2 established.
- Export UI: full-screen coral-accented sheet — resolution (720p/1080p) + fps, animated
  progress ring with live fps/ETA, cancel, then Share Sheet (`navigator.share({files})`) with
  `<a download>` fallback.
- Golden-frame e2e: fixture project (VP9 in sandbox) exercising speed+volume+text+filter+
  transition → export → decode N sample frames → SSIM vs checked-in references.

### M6 — PWA + final polish (old Phase 7, trimmed to what matters)
- Manifest (portrait-primary now), service-worker precache (offline editing end-to-end),
  install prompt, icons/splash.
- Storage UX: quota meter in gallery, `persist()` prompt after first successful import.
- Wake-lock during export; GL context-loss recovery; worker-crash respawn.
- QA matrix doc: iPhone SE/15/Pro Max portrait, iPad landscape, installed-PWA, offline.

---

## Verification playbook (sandbox realities — read before writing tests)

Learned during Phases 0–2; do not rediscover these the hard way:

- **This sandbox's Chromium has no H.264/AAC WebCodecs** (open-source build). Use
  `e2e/fixtures/test-clip-vp9.mp4` for any test that must actually decode/encode; use
  `test-clip.mp4` (H.264) to prove codec-gap handling fails fast instead of hanging. On real
  iPads H.264 is hardware-supported; `avc1.42001f` stays the shipped default.
- Run e2e via a throwaway config pointing at the preinstalled browser
  (`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, `--no-sandbox`) —
  see the pattern in Phase 2's history; delete the config before committing. CI runs real
  WebKit via `playwright.config.ts` (leave that file alone). Add the 390×844 portrait project
  to `playwright.config.ts` in M1.
- Kill stray preview servers with `fuser -k 4173/tcp` (plain `pkill` exits 144 here).
- `ffmpeg` is available (apt) for generating new fixtures; keep fixtures ≤100KB.
- Anything touching COOP/COEP: verify headers on **both** a document route and a static
  `/assets/*` file — they are served by different layers locally (see the
  `isolationHeadersPlugin` comment in `vite.config.ts`).
- Verify in the browser, not just `tsc` — every real bug found in Phases 1–2 (autosave race,
  WebCodecs hang, worker COEP block) was invisible to typecheck and unit tests.

## Out of scope for V2

Cloud sync/auth, collaboration, AI features (auto-captions, background removal), effects
marketplace, keyframe *editing UI* (schema + compositor interpolation exist; surface in V3),
HEVC/HDR export, Android-specific tuning.
