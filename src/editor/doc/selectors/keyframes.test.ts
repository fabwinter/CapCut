import { describe, expect, it } from 'vitest'
import type { Keyframe } from '../schema'
import { evaluateKeyframedValue, hasKeyframesFor } from './keyframes'

function kf(property: Keyframe['property'], atMicros: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe {
  return { id: `${property}-${atMicros}`, property, atMicros, value, easing }
}

describe('evaluateKeyframedValue', () => {
  it('falls back to the static value when there are no keyframes for the property', () => {
    expect(evaluateKeyframedValue([], 'x', 500_000, 42)).toBe(42)
  })

  it('holds the first keyframe value before it', () => {
    const keyframes = [kf('opacity', 1_000_000, 0.5)]
    expect(evaluateKeyframedValue(keyframes, 'opacity', 0, 1)).toBe(0.5)
  })

  it('holds the last keyframe value after it', () => {
    const keyframes = [kf('opacity', 0, 1), kf('opacity', 1_000_000, 0.2)]
    expect(evaluateKeyframedValue(keyframes, 'opacity', 5_000_000, 1)).toBe(0.2)
  })

  it('linearly interpolates between two keyframes at the midpoint', () => {
    const keyframes = [kf('x', 0, 0), kf('x', 1_000_000, 100)]
    expect(evaluateKeyframedValue(keyframes, 'x', 500_000, 0)).toBe(50)
  })

  it('applies easeIn on the segment leading into the target keyframe', () => {
    const keyframes = [kf('x', 0, 0), kf('x', 1_000_000, 100, 'easeIn')]
    // easeIn(0.5) = 0.25 -> should be well under the linear midpoint of 50.
    const value = evaluateKeyframedValue(keyframes, 'x', 500_000, 0)
    expect(value).toBeCloseTo(25, 5)
  })

  it('only interpolates within the matching segment when multiple keyframes exist', () => {
    const keyframes = [kf('x', 0, 0), kf('x', 1_000_000, 100), kf('x', 2_000_000, 0)]
    expect(evaluateKeyframedValue(keyframes, 'x', 1_500_000, 0)).toBe(50)
  })

  it('ignores keyframes for other properties', () => {
    const keyframes = [kf('y', 0, 0), kf('y', 1_000_000, 100)]
    expect(evaluateKeyframedValue(keyframes, 'x', 500_000, 7)).toBe(7)
  })
})

describe('hasKeyframesFor', () => {
  it('reports whether any keyframe exists for a property', () => {
    const keyframes = [kf('scale', 0, 1)]
    expect(hasKeyframesFor(keyframes, 'scale')).toBe(true)
    expect(hasKeyframesFor(keyframes, 'rotation')).toBe(false)
  })
})
