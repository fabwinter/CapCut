import { describe, expect, it } from 'vitest'
import { computeAdjustments, NEUTRAL_ADJUSTMENTS } from './adjustments'

describe('computeAdjustments', () => {
  it('returns neutral values for a clip with no effects', () => {
    expect(computeAdjustments([])).toEqual(NEUTRAL_ADJUSTMENTS)
  })

  it('applies a single effect on top of the neutral defaults', () => {
    const result = computeAdjustments([{ id: '1', type: 'brightness', params: { value: 0.4 } }])
    expect(result.brightness).toBe(0.4)
    expect(result.contrast).toBe(1)
  })

  it('applies multiple effect types independently', () => {
    const result = computeAdjustments([
      { id: '1', type: 'contrast', params: { value: 1.5 } },
      { id: '2', type: 'vignette', params: { value: 0.6 } },
    ])
    expect(result.contrast).toBe(1.5)
    expect(result.vignette).toBe(0.6)
  })

  it('ignores non-adjustment effect types like lut', () => {
    const result = computeAdjustments([{ id: '1', type: 'lut', params: {}, lutAssetId: 'x' }])
    expect(result).toEqual(NEUTRAL_ADJUSTMENTS)
  })
})
