import { describe, expect, it } from 'vitest'
import {
  frameDurationMicros,
  framesToMicros,
  microsToFrames,
  microsToSeconds,
  secondsToMicros,
  snapToFrame,
} from './time'

describe('time', () => {
  it('converts seconds to microseconds and back', () => {
    expect(secondsToMicros(1.5)).toBe(1_500_000)
    expect(microsToSeconds(1_500_000)).toBe(1.5)
  })

  it('converts frames to microseconds and back at 30fps', () => {
    expect(framesToMicros(30, 30)).toBe(1_000_000)
    expect(microsToFrames(1_000_000, 30)).toBe(30)
  })

  it('snaps to the nearest frame boundary', () => {
    const fps = 30
    const frame2 = framesToMicros(2, fps)
    expect(snapToFrame(frame2 + 100, fps)).toBe(frame2)
    expect(snapToFrame(frame2 - 100, fps)).toBe(frame2)
  })

  it('frameDurationMicros returns a whole microsecond count', () => {
    // 1e6 isn't evenly divisible by every fps (30 included) — the frame
    // duration itself is allowed to be fractional; only snapped timestamps
    // must land on whole microseconds.
    expect(frameDurationMicros(25)).toBe(40_000)
  })

  it('handles non-integer fps (29.97) without drifting off-integer', () => {
    const fps = 30000 / 1001
    const snapped = snapToFrame(secondsToMicros(1.23), fps)
    expect(Number.isInteger(snapped)).toBe(true)
  })
})
