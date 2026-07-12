import { describe, expect, it } from 'vitest'
import { computeGainEnvelope } from './audioEnvelope'

const BASE = { volume: 1, muted: false, fadeInMicros: 0, fadeOutMicros: 0, durationMicros: 4_000_000, keyframes: [] }

describe('computeGainEnvelope', () => {
  it('is a flat line at the clip volume with no fades', () => {
    const points = computeGainEnvelope(BASE, 0)
    expect(points).toEqual([{ atSeconds: 0, value: 1, ramp: false }])
  })

  it('is silent throughout when muted', () => {
    const points = computeGainEnvelope({ ...BASE, muted: true }, 0)
    expect(points[0].value).toBe(0)
  })

  it('starts at zero and ramps up to volume over the fade-in window', () => {
    const points = computeGainEnvelope({ ...BASE, fadeInMicros: 1_000_000 }, 0)
    expect(points[0]).toEqual({ atSeconds: 0, value: 0, ramp: false })
    expect(points[1]).toEqual({ atSeconds: 1, value: 1, ramp: true })
  })

  it('ramps down to zero over the fade-out window', () => {
    const points = computeGainEnvelope({ ...BASE, fadeOutMicros: 1_000_000 }, 0)
    // fade-out starts at 3s (duration 4s - fadeOut 1s), ends at 4s.
    expect(points).toContainEqual({ atSeconds: 3, value: 1, ramp: false })
    expect(points).toContainEqual({ atSeconds: 4, value: 0, ramp: true })
  })

  it('starts already partway through the fade-in when playback begins mid-fade', () => {
    // fade-in is 0-2s; starting playback at local time 1s should start at half volume.
    const points = computeGainEnvelope({ ...BASE, fadeInMicros: 2_000_000 }, 1_000_000)
    expect(points[0].value).toBeCloseTo(0.5, 5)
    expect(points[1]).toEqual({ atSeconds: 1, value: 1, ramp: true })
  })

  it('omits a fade-in ramp point entirely when playback starts after the fade-in window', () => {
    const points = computeGainEnvelope({ ...BASE, fadeInMicros: 1_000_000 }, 2_000_000)
    expect(points).toHaveLength(1)
    expect(points[0].value).toBe(1)
  })

  it('starts already partway through the fade-out when playback begins mid-fade', () => {
    // fade-out window is 3-4s; starting at local time 3.5s should begin at half volume, already past the flat setValueAtTime point.
    const points = computeGainEnvelope({ ...BASE, fadeOutMicros: 1_000_000 }, 3_500_000)
    expect(points[0].value).toBeCloseTo(0.5, 5)
    expect(points.some((p) => !p.ramp && p.atSeconds > 0)).toBe(false)
    expect(points.at(-1)).toEqual({ atSeconds: 0.5, value: 0, ramp: true })
  })

  it('bends the envelope at volume keyframes', () => {
    const points = computeGainEnvelope(
      {
        ...BASE,
        keyframes: [
          { id: 'k1', property: 'volume', atMicros: 1_000_000, value: 0.2, easing: 'linear' },
          { id: 'k2', property: 'volume', atMicros: 3_000_000, value: 1.5, easing: 'linear' },
        ],
      },
      0,
    )
    expect(points).toContainEqual({ atSeconds: 1, value: 0.2, ramp: true })
    expect(points).toContainEqual({ atSeconds: 3, value: 1.5, ramp: true })
    // Before the first keyframe, the value holds at the first keyframe's level.
    expect(points[0]).toEqual({ atSeconds: 0, value: 0.2, ramp: false })
  })

  it('mute silences the clip even with volume keyframes', () => {
    const points = computeGainEnvelope(
      {
        ...BASE,
        muted: true,
        keyframes: [{ id: 'k1', property: 'volume', atMicros: 1_000_000, value: 0.9, easing: 'linear' }],
      },
      0,
    )
    expect(points.every((p) => p.value === 0)).toBe(true)
  })
})
