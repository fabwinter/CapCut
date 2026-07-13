import { describe, expect, it } from 'vitest'
import { rotationFromMatrix } from './demux'

// ISO/IEC 14496-12 §8.7.2 tkhd display matrices, 16.16 fixed-point for the
// rotation/scale terms — the exact values real devices (iPhone, Android)
// write into the track header for each display rotation.
const IDENTITY = [1 << 16, 0, 0, 0, 1 << 16, 0, 0, 0, 1 << 30]
const ROTATE_90 = [0, 1 << 16, 0, -(1 << 16), 0, 0, 0, 0, 1 << 30]
const ROTATE_180 = [-(1 << 16), 0, 0, 0, -(1 << 16), 0, 0, 0, 1 << 30]
const ROTATE_270 = [0, -(1 << 16), 0, 1 << 16, 0, 0, 0, 0, 1 << 30]

describe('rotationFromMatrix', () => {
  it('reads the identity matrix as no rotation', () => {
    expect(rotationFromMatrix(IDENTITY)).toBe(0)
  })

  it('reads the standard 90-degree display matrix', () => {
    expect(rotationFromMatrix(ROTATE_90)).toBe(90)
  })

  it('reads the standard 180-degree display matrix', () => {
    expect(rotationFromMatrix(ROTATE_180)).toBe(180)
  })

  it('reads the standard 270-degree display matrix', () => {
    expect(rotationFromMatrix(ROTATE_270)).toBe(270)
  })

  it('falls back to 0 when there is no matrix at all', () => {
    expect(rotationFromMatrix(undefined)).toBe(0)
  })

  it('falls back to 0 for an angle that is not a 90-degree step', () => {
    // A 45-degree-ish matrix — real devices never produce this, but a
    // corrupt/unusual file shouldn't make up a rotation we can't act on cleanly.
    const skewed = [46341, 46341, 0, -46341, 46341, 0, 0, 0, 1 << 30]
    expect(rotationFromMatrix(skewed)).toBe(0)
  })
})
