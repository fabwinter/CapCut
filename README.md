# CapCut for iPad

A touch-first, CapCut-style video editor for iPad, built as a local-first web app (PWA) and deployed on Vercel. All video processing (decode, compositing, export) happens on-device in the browser via WebCodecs + WebGL2 — the server tier stays thin.

Stack and UI conventions are inherited from the sister project [CharlieCut](https://github.com/fabwinter/CharlieCut): TanStack Start, React 19, Tailwind CSS 4, shadcn/ui, Bun.

## Documentation

- [Architecture plan](docs/ARCHITECTURE.md) — scope, iPad/Safari constraints, tech stack, system design, module boundaries, risks
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — phased build plan with acceptance criteria, written for execution by multiple agents

## Status

Planning complete; implementation not yet started. Begin at [Phase 0](docs/IMPLEMENTATION_PLAN.md#phase-0--scaffold--deploy-pipeline).
