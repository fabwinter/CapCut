import { snapToFrame, type Micros } from '#/editor/doc/time'

/**
 * Snaps a candidate timeline position first to the nearest whole frame, then
 * — if it lands within `thresholdMicros` of a magnetic target (playhead,
 * adjacent clip edges) — to that target exactly. Frame-snap always applies;
 * magnetic snap only overrides when it's closer than the threshold.
 */
export function snapMicros(candidate: Micros, targets: Micros[], fps: number, thresholdMicros: number): Micros {
  const frameSnapped = snapToFrame(Math.max(0, candidate), fps)
  let best = frameSnapped
  let bestDistance = thresholdMicros
  for (const target of targets) {
    const distance = Math.abs(frameSnapped - target)
    if (distance <= bestDistance) {
      best = target
      bestDistance = distance
    }
  }
  return best
}

/** Converts an on-screen pixel snap threshold into microseconds at the current zoom. */
export function thresholdMicrosForPx(thresholdPx: number, pxPerSecond: number): Micros {
  return Math.round((thresholdPx / pxPerSecond) * 1_000_000)
}
