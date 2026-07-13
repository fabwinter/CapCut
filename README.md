# CapCut for iPad

A touch-first, CapCut-style video editor for iPad, built as a local-first web app (PWA) and deployed on Vercel. All video processing (decode, compositing, export) happens on-device in the browser via WebCodecs + WebGL2 — the server tier stays thin.

Stack and UI conventions are inherited from the sister project [CharlieCut](https://github.com/fabwinter/CharlieCut): TanStack Start, React 19, Tailwind CSS 4, shadcn/ui, Bun.

## Documentation

- [Architecture plan](docs/ARCHITECTURE.md) — scope, iPad/Safari constraints, tech stack, system design, module boundaries, risks
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — original phased plan; Phases 0–2 built, 3–7 superseded
- [**V2 design & editing plan**](docs/V2_DESIGN_AND_EDITING_PLAN.md) — current plan: iPhone/iPad-first design system + editing milestones M1–M6. **Implementing agents start here.**

## Status

Phases 0–2 complete (scaffold + Vercel deploy, project management with undo/redo and autosave, media engine with WebCodecs proxy/thumbnail/waveform generation). Next: [M1 — Timeline](docs/V2_DESIGN_AND_EDITING_PLAN.md#m1--timeline-replaces-old-phase-3-the-biggest-milestone).
