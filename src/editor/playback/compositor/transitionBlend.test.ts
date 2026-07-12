import { describe, expect, it } from 'vitest'
import { computeTransitionBlend } from './transitionBlend'

describe('computeTransitionBlend', () => {
  describe('crossDissolve', () => {
    it('starts fully on A and ends fully on B', () => {
      expect(computeTransitionBlend('crossDissolve', 0, 100, 100)).toMatchObject({ opacityA: 1, opacityB: 0 })
      expect(computeTransitionBlend('crossDissolve', 1, 100, 100)).toMatchObject({ opacityA: 0, opacityB: 1 })
    })

    it('is an even mix at the midpoint', () => {
      expect(computeTransitionBlend('crossDissolve', 0.5, 100, 100)).toMatchObject({ opacityA: 0.5, opacityB: 0.5 })
    })
  })

  describe('dipToBlack', () => {
    it('is fully black at the midpoint with both clips invisible', () => {
      const blend = computeTransitionBlend('dipToBlack', 0.5, 100, 100)
      expect(blend.opacityA).toBe(0)
      expect(blend.opacityB).toBe(0)
      expect(blend.blackOverlayOpacity).toBe(1)
    })

    it('has no black overlay at the very start or end', () => {
      expect(computeTransitionBlend('dipToBlack', 0, 100, 100).blackOverlayOpacity).toBe(0)
      expect(computeTransitionBlend('dipToBlack', 1, 100, 100).blackOverlayOpacity).toBe(0)
    })
  })

  describe('slide', () => {
    it('keeps both clips fully opaque, sliding B in from off-canvas', () => {
      const start = computeTransitionBlend('slide', 0, 200, 100)
      expect(start.opacityA).toBe(1)
      expect(start.opacityB).toBe(1)
      expect(start.xOffsetB).toBe(200)
    })

    it('settles B at its normal position once the transition completes', () => {
      expect(computeTransitionBlend('slide', 1, 200, 100).xOffsetB).toBe(0)
    })
  })

  describe('wipe', () => {
    it('grows the reveal rect from nothing to the full canvas width', () => {
      expect(computeTransitionBlend('wipe', 0, 200, 100).scissorB).toMatchObject({ width: 0 })
      expect(computeTransitionBlend('wipe', 1, 200, 100).scissorB).toMatchObject({ width: 200 })
    })
  })

  it('clamps progress outside [0, 1]', () => {
    expect(computeTransitionBlend('crossDissolve', -0.5, 100, 100).opacityA).toBe(1)
    expect(computeTransitionBlend('crossDissolve', 1.5, 100, 100).opacityA).toBe(0)
  })
})
