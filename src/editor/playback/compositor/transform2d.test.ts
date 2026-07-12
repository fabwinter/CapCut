import { describe, expect, it } from 'vitest'
import { computeCoverScale, computeQuadCorners, pointInQuad, pxToNdc } from './transform2d'

const IDENTITY = { x: 0, y: 0, scale: 1, rotation: 0 }

describe('computeCoverScale', () => {
  it('scales up a narrower source to cover a wider target', () => {
    expect(computeCoverScale(100, 100, 200, 100)).toBe(2)
  })

  it('scales up a shorter source to cover a taller target', () => {
    expect(computeCoverScale(100, 100, 100, 300)).toBe(3)
  })
})

describe('computeQuadCorners', () => {
  it('covers the canvas exactly for a same-aspect source at identity transform', () => {
    const quad = computeQuadCorners(IDENTITY, 1080, 1920, 1080, 1920)
    expect(quad[0]).toEqual({ x: 0, y: 0 }) // top-left
    expect(quad[2]).toEqual({ x: 1080, y: 1920 }) // bottom-right
  })

  it('overscans a mismatched-aspect source to cover, centered', () => {
    // 1:1 source into a 2:1 canvas -> scaled to 200x200, centered vertically off-canvas by 50 each side.
    const quad = computeQuadCorners(IDENTITY, 100, 100, 200, 100)
    expect(quad[0]).toEqual({ x: 0, y: -50 })
    expect(quad[2]).toEqual({ x: 200, y: 150 })
  })

  it('applies a position offset', () => {
    const quad = computeQuadCorners({ ...IDENTITY, x: 10, y: -20 }, 100, 100, 100, 100)
    expect(quad[0]).toEqual({ x: 10, y: -20 })
  })

  it('applies a scale multiplier on top of the cover scale', () => {
    const quad = computeQuadCorners({ ...IDENTITY, scale: 2 }, 100, 100, 100, 100)
    const width = quad[1].x - quad[0].x
    expect(width).toBe(200)
  })

  it('rotates the quad about its center', () => {
    const quad = computeQuadCorners({ ...IDENTITY, rotation: 90 }, 100, 100, 100, 100)
    // A 90deg rotation of a centered square maps top-left roughly onto where bottom-left was.
    expect(quad[0].x).toBeCloseTo(100, 5)
    expect(quad[0].y).toBeCloseTo(0, 5)
  })
})

describe('pxToNdc', () => {
  it('maps the canvas center to the NDC origin', () => {
    expect(pxToNdc({ x: 50, y: 50 }, 100, 100)).toEqual({ x: 0, y: 0 })
  })

  it('maps the top-left pixel corner to NDC top-left and flips Y', () => {
    expect(pxToNdc({ x: 0, y: 0 }, 100, 100)).toEqual({ x: -1, y: 1 })
  })

  it('maps the bottom-right pixel corner to NDC bottom-right', () => {
    expect(pxToNdc({ x: 100, y: 100 }, 100, 100)).toEqual({ x: 1, y: -1 })
  })
})

describe('pointInQuad', () => {
  const axisAlignedQuad = computeQuadCorners(IDENTITY, 100, 100, 100, 100)

  it('accepts a point inside the quad', () => {
    expect(pointInQuad({ x: 50, y: 50 }, axisAlignedQuad)).toBe(true)
  })

  it('rejects a point outside the quad', () => {
    expect(pointInQuad({ x: -10, y: 50 }, axisAlignedQuad)).toBe(false)
  })

  it('works for a rotated quad', () => {
    const rotated = computeQuadCorners({ ...IDENTITY, rotation: 45, scale: 0.5 }, 100, 100, 100, 100)
    // Center is always inside regardless of rotation.
    expect(pointInQuad({ x: 50, y: 50 }, rotated)).toBe(true)
    // A corner of the *unrotated* half-scale quad (would be inside without rotation) ends up outside once rotated 45deg.
    expect(pointInQuad({ x: 27, y: 27 }, rotated)).toBe(false)
  })
})
