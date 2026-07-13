import { describe, expect, it } from 'vitest'
import { ASPECT_RATIO_PRESETS, matchAspectRatioPreset } from './aspectRatioPresets'

describe('matchAspectRatioPreset', () => {
  it('finds the preset matching an exact width/height', () => {
    const preset = matchAspectRatioPreset(1920, 1080)
    expect(preset?.label).toBe('16:9')
  })

  it('returns undefined for a custom, non-preset size', () => {
    expect(matchAspectRatioPreset(1337, 420)).toBeUndefined()
  })

  it('every preset is distinct in both label and dimensions', () => {
    const labels = new Set(ASPECT_RATIO_PRESETS.map((p) => p.label))
    const dims = new Set(ASPECT_RATIO_PRESETS.map((p) => `${p.width}x${p.height}`))
    expect(labels.size).toBe(ASPECT_RATIO_PRESETS.length)
    expect(dims.size).toBe(ASPECT_RATIO_PRESETS.length)
  })
})
