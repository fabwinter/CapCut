import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc, ProjectDocSchema, projectDurationMicros } from './schema'

describe('ProjectDoc schema', () => {
  it('round-trips a freshly created doc through parse', () => {
    const doc = createEmptyProjectDoc('My Project')
    const parsed = ProjectDocSchema.parse(doc)
    expect(parsed).toEqual(doc)
  })

  it('creates a video and an audio track by default', () => {
    const doc = createEmptyProjectDoc('My Project')
    expect(doc.tracks.map((t) => t.kind)).toEqual(['video', 'audio'])
  })

  it('defaults to a portrait canvas when no settings override is given', () => {
    const doc = createEmptyProjectDoc('My Project')
    expect(doc.settings).toEqual({ width: 1080, height: 1920, fps: 30, background: '#000000' })
  })

  it('applies a partial settings override on top of the defaults', () => {
    const doc = createEmptyProjectDoc('My Project', { width: 1920, height: 1080 })
    expect(doc.settings.width).toBe(1920)
    expect(doc.settings.height).toBe(1080)
    expect(doc.settings.fps).toBe(30) // untouched default
    expect(doc.settings.background).toBe('#000000') // untouched default
  })

  it('rejects a doc with an unknown schema version', () => {
    const doc = createEmptyProjectDoc('My Project')
    expect(() => ProjectDocSchema.parse({ ...doc, schemaVersion: 999 })).toThrow()
  })

  it('computes project duration as the furthest clip end', () => {
    const doc = createEmptyProjectDoc('My Project')
    expect(projectDurationMicros(doc)).toBe(0)

    doc.tracks[0].clips.push({
      id: 'c1',
      trackId: doc.tracks[0].id,
      startMicros: 1_000_000,
      durationMicros: 2_000_000,
      inPointMicros: 0,
      speed: 1,
      volume: 1,
      muted: false,
      fadeInMicros: 0,
      fadeOutMicros: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      effects: [],
      keyframes: [],
    })
    expect(projectDurationMicros(doc)).toBe(3_000_000)
  })
})
