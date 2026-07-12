/**
 * All timeline/source times in the editor are integer microseconds, never
 * floating-point seconds — this is what keeps trims, splits, and exported
 * frames aligned to exact frame boundaries instead of drifting.
 */
export type Micros = number

export const MICROS_PER_SECOND = 1_000_000

export function secondsToMicros(seconds: number): Micros {
  return Math.round(seconds * MICROS_PER_SECOND)
}

export function microsToSeconds(micros: Micros): number {
  return micros / MICROS_PER_SECOND
}

export function framesToMicros(frames: number, fps: number): Micros {
  return Math.round((frames * MICROS_PER_SECOND) / fps)
}

export function microsToFrames(micros: Micros, fps: number): number {
  return (micros * fps) / MICROS_PER_SECOND
}

/** Rounds a time to the nearest exact frame boundary for a given fps, in whole microseconds. */
export function snapToFrame(micros: Micros, fps: number): Micros {
  const frameMicros = MICROS_PER_SECOND / fps
  return Math.round(Math.round(micros / frameMicros) * frameMicros)
}

export function frameDurationMicros(fps: number): Micros {
  return MICROS_PER_SECOND / fps
}
