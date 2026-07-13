import { describe, it, expect } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import type { ProjectDoc } from '../schema'
import { initExport, prepareExport } from './export'

describe('export commands', () => {
  let doc: ProjectDoc

  it('validates empty project', () => {
    doc = createEmptyProjectDoc('Test')
    const result = initExport(doc)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('no clips')
  })

  it('validates project with clips', () => {
    doc = createEmptyProjectDoc('Test')
    doc.tracks[0].clips.push({
      id: crypto.randomUUID(),
      trackId: doc.tracks[0].id,
      assetId: 'asset-1',
      startMicros: 0,
      durationMicros: 1_000_000,
      inPointMicros: 0,
      outPointMicros: undefined,
      speed: 1,
      volume: 1,
      muted: false,
      fadeInMicros: 0,
      fadeOutMicros: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      effects: [],
      keyframes: [],
    })

    const result = initExport(doc)
    expect(result.valid).toBe(true)
    expect(result.config).toBeDefined()
    expect(result.config!.duration).toBe(1_000_000)
    expect(result.config!.fps).toBe(30)
  })

  it('calculates bitrate based on resolution', () => {
    doc = createEmptyProjectDoc('Test')
    doc.settings.width = 1920
    doc.settings.height = 1080
    doc.tracks[0].clips.push({
      id: crypto.randomUUID(),
      trackId: doc.tracks[0].id,
      assetId: 'asset-1',
      startMicros: 0,
      durationMicros: 1_000_000,
      inPointMicros: 0,
      outPointMicros: undefined,
      speed: 1,
      volume: 1,
      muted: false,
      fadeInMicros: 0,
      fadeOutMicros: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      effects: [],
      keyframes: [],
    })

    const result = initExport(doc)
    expect(result.config!.bitrate).toBe(8_000_000) // 8 Mbps for 1080p
  })

  it('calculates project duration from multiple clips', () => {
    doc = createEmptyProjectDoc('Test')
    doc.tracks[0].clips.push(
      {
        id: crypto.randomUUID(),
        trackId: doc.tracks[0].id,
        assetId: 'asset-1',
        startMicros: 0,
        durationMicros: 1_000_000,
        inPointMicros: 0,
        outPointMicros: undefined,
        speed: 1,
        volume: 1,
        muted: false,
        fadeInMicros: 0,
        fadeOutMicros: 0,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        keyframes: [],
      },
      {
        id: crypto.randomUUID(),
        trackId: doc.tracks[0].id,
        assetId: 'asset-2',
        startMicros: 1_000_000,
        durationMicros: 2_000_000,
        inPointMicros: 0,
        outPointMicros: undefined,
        speed: 1,
        volume: 1,
        muted: false,
        fadeInMicros: 0,
        fadeOutMicros: 0,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        keyframes: [],
      }
    )

    const result = initExport(doc)
    expect(result.config!.duration).toBe(3_000_000) // 1s + 2s
  })

  it('prepares export with valid project', () => {
    doc = createEmptyProjectDoc('Test')
    doc.tracks[0].clips.push({
      id: crypto.randomUUID(),
      trackId: doc.tracks[0].id,
      assetId: 'asset-1',
      startMicros: 0,
      durationMicros: 1_000_000,
      inPointMicros: 0,
      outPointMicros: undefined,
      speed: 1,
      volume: 1,
      muted: false,
      fadeInMicros: 0,
      fadeOutMicros: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      effects: [],
      keyframes: [],
    })

    const result = prepareExport(doc)
    expect(result.valid).toBe(true)
    expect(result.doc).toBe(doc)
    expect(result.config).toBeDefined()
  })
})
