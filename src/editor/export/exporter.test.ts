import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../doc/schema'
import { EXPORT_PRESETS, evenDimension, exportDimensions } from './exporter'

describe('evenDimension', () => {
  it('leaves an already-even value unchanged', () => {
    expect(evenDimension(720)).toBe(720)
  })

  it('rounds an odd value to the nearest even number', () => {
    expect(evenDimension(721)).toBe(722)
    expect(evenDimension(717)).toBe(718)
  })

  it('never goes below 2', () => {
    expect(evenDimension(0)).toBe(2)
    expect(evenDimension(1)).toBe(2)
  })
})

describe('exportDimensions', () => {
  it('scales width to match the preset height at the project aspect ratio', () => {
    const doc = createEmptyProjectDoc('P') // 1080x1920 portrait by default
    const dims = exportDimensions(doc, { label: '720p', height: 720, bitrate: 1 })
    expect(dims.height).toBe(720)
    expect(dims.width).toBe(evenDimension(1080 * (720 / 1920)))
  })

  it('produces even dimensions', () => {
    const doc = createEmptyProjectDoc('P')
    const dims = exportDimensions(doc, { label: '1080p', height: 1080, bitrate: 1 })
    expect(dims.width % 2).toBe(0)
    expect(dims.height % 2).toBe(0)
  })
})

describe('EXPORT_PRESETS', () => {
  it('offers 720p and 1080p with sane bitrates', () => {
    expect(EXPORT_PRESETS.map((p) => p.label)).toEqual(['720p', '1080p'])
    for (const preset of EXPORT_PRESETS) {
      expect(preset.bitrate).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
    }
  })
})
