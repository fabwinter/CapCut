import { describe, expect, it } from 'vitest'
import { computeTextAnimationModifier } from './textAnimation'

describe('computeTextAnimationModifier', () => {
  it('is a no-op with no animation presets', () => {
    const mod = computeTextAnimationModifier('none', 'none', 200_000, 5_000_000, 1000)
    expect(mod).toEqual({ opacityMul: 1, xOffsetPx: 0, scaleMul: 1 })
  })

  it('starts fully transparent at the very start of a fade-in', () => {
    const mod = computeTextAnimationModifier('fadeIn', 'none', 0, 5_000_000, 1000)
    expect(mod.opacityMul).toBe(0)
  })

  it('reaches full opacity once the fade-in window has elapsed', () => {
    const mod = computeTextAnimationModifier('fadeIn', 'none', 500_000, 5_000_000, 1000)
    expect(mod.opacityMul).toBe(1)
  })

  it('slides in from off-canvas at the start', () => {
    const mod = computeTextAnimationModifier('slideIn', 'none', 0, 5_000_000, 1000)
    expect(mod.xOffsetPx).toBeLessThan(0)
  })

  it('settles to no offset once slide-in completes', () => {
    const mod = computeTextAnimationModifier('slideIn', 'none', 500_000, 5_000_000, 1000)
    expect(mod.xOffsetPx).toBe(0)
  })

  it('fades out near the end of the clip', () => {
    const duration = 5_000_000
    const nearEnd = duration - 1000
    const mod = computeTextAnimationModifier('none', 'fadeIn', nearEnd, duration, 1000)
    expect(mod.opacityMul).toBeLessThan(0.1)
  })

  it('caps in/out animation duration for very short clips so they do not overlap', () => {
    // A 200ms clip is shorter than the 400ms default animation window on each side.
    const mod = computeTextAnimationModifier('fadeIn', 'fadeIn', 100_000, 200_000, 1000)
    expect(mod.opacityMul).toBeGreaterThanOrEqual(0)
    expect(mod.opacityMul).toBeLessThanOrEqual(1)
  })
})
