import type { Easing, Keyframe, KeyframableProperty } from '../schema'
import type { Micros } from '../time'

const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
}

/**
 * Interpolated value of a keyframable property at `atMicros` (clip-local).
 * Holds the first/last keyframe's value outside its range; falls back to
 * the clip's static field value when the property has no keyframes at all.
 * The *target* keyframe's easing describes how the value eases into it —
 * the usual convention for keyframe timelines.
 */
export function evaluateKeyframedValue(
  keyframes: Keyframe[],
  property: KeyframableProperty,
  atMicros: Micros,
  fallback: number,
): number {
  const points = keyframes.filter((k) => k.property === property).sort((a, b) => a.atMicros - b.atMicros)
  if (points.length === 0) return fallback
  if (atMicros <= points[0].atMicros) return points[0].value
  const last = points[points.length - 1]
  if (atMicros >= last.atMicros) return last.value

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (atMicros >= a.atMicros && atMicros <= b.atMicros) {
      const span = b.atMicros - a.atMicros
      const t = span === 0 ? 1 : (atMicros - a.atMicros) / span
      const eased = EASINGS[b.easing](t)
      return a.value + (b.value - a.value) * eased
    }
  }
  return fallback
}

export function hasKeyframesFor(keyframes: Keyframe[], property: KeyframableProperty): boolean {
  return keyframes.some((k) => k.property === property)
}
