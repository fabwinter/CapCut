import { describe, expect, it } from 'vitest'
import { snapMicros, thresholdMicrosForPx } from './snap'

describe('snapMicros', () => {
  it('snaps to the nearest frame boundary at 30fps', () => {
    // 1 frame at 30fps = 33333.33us; candidate is closer to the 3rd frame.
    expect(snapMicros(100_000, [], 30, 5_000)).toBe(snapMicros(100_000, [], 30, 0))
  })

  it('prefers a magnetic target within the threshold over the raw frame snap', () => {
    const playhead = 500_000
    // Close to the playhead but not exactly on a frame boundary.
    const result = snapMicros(498_000, [playhead], 30, 10_000)
    expect(result).toBe(playhead)
  })

  it('ignores a magnetic target outside the threshold', () => {
    const playhead = 500_000
    const result = snapMicros(100_000, [playhead], 30, 10_000)
    expect(result).not.toBe(playhead)
  })

  it('never returns a negative time', () => {
    expect(snapMicros(-50_000, [], 30, 5_000)).toBeGreaterThanOrEqual(0)
  })
})

describe('thresholdMicrosForPx', () => {
  it('converts a pixel distance to microseconds at the given zoom', () => {
    expect(thresholdMicrosForPx(8, 60)).toBe(133_333)
  })
})
