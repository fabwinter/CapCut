import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { CommandBus } from './bus'
import {
  addClip,
  createClip,
  deleteClip,
  duplicateClip,
  moveClip,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from './clips'

function busWithClip(overrides: Partial<Parameters<typeof createClip>[0]> = {}) {
  const doc = createEmptyProjectDoc('P')
  const bus = new CommandBus(doc)
  const trackId = doc.tracks[0].id
  const clip = createClip({
    trackId,
    assetId: 'a1',
    startMicros: 1_000_000,
    durationMicros: 2_000_000,
    ...overrides,
  })
  bus.dispatch(addClip(clip))
  return { bus, trackId, clipId: clip.id }
}

describe('clip commands', () => {
  it('adds a clip to its track', () => {
    const { bus, trackId } = busWithClip()
    expect(bus.getDoc().tracks.find((t) => t.id === trackId)?.clips).toHaveLength(1)
  })

  it('moves a clip within a track', () => {
    const { bus, clipId } = busWithClip()
    const trackId = bus.getDoc().tracks[0].id
    bus.dispatch(moveClip(clipId, { trackId, startMicros: 3_000_000 }))
    expect(bus.getDoc().tracks[0].clips[0].startMicros).toBe(3_000_000)
  })

  it('moves a clip to a different track', () => {
    const { bus, clipId } = busWithClip()
    const destTrackId = bus.getDoc().tracks[1].id
    bus.dispatch(moveClip(clipId, { trackId: destTrackId, startMicros: 500_000 }))
    expect(bus.getDoc().tracks[0].clips).toHaveLength(0)
    expect(bus.getDoc().tracks[1].clips).toHaveLength(1)
    expect(bus.getDoc().tracks[1].clips[0].startMicros).toBe(500_000)
  })

  it('clamps move to a non-negative start', () => {
    const { bus, clipId, trackId } = busWithClip()
    bus.dispatch(moveClip(clipId, { trackId, startMicros: -500_000 }))
    expect(bus.getDoc().tracks[0].clips[0].startMicros).toBe(0)
  })

  it('is a no-op when the move does not change position', () => {
    const { bus, clipId, trackId } = busWithClip()
    const docBefore = bus.getDoc()
    bus.dispatch(moveClip(clipId, { trackId, startMicros: 1_000_000 }))
    expect(bus.getDoc()).toBe(docBefore)
  })

  it('trims the start, adjusting duration and in-point together', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(trimClipStart(clipId, 1_500_000))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.startMicros).toBe(1_500_000)
    expect(clip.durationMicros).toBe(1_500_000)
    expect(clip.inPointMicros).toBe(500_000)
  })

  it('refuses to trim start past the minimum clip duration', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(trimClipStart(clipId, 5_000_000))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.durationMicros).toBeGreaterThan(0)
    expect(clip.startMicros + clip.durationMicros).toBe(3_000_000)
  })

  it('trims the end, leaving start and in-point fixed', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(trimClipEnd(clipId, 2_000_000))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.startMicros).toBe(1_000_000)
    expect(clip.durationMicros).toBe(1_000_000)
    expect(clip.inPointMicros).toBe(0)
  })

  it('splits a clip into two at the given time', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(splitClip(clipId, 2_000_000))
    const clips = bus.getDoc().tracks[0].clips
    expect(clips).toHaveLength(2)
    expect(clips[0].startMicros).toBe(1_000_000)
    expect(clips[0].durationMicros).toBe(1_000_000)
    expect(clips[1].startMicros).toBe(2_000_000)
    expect(clips[1].durationMicros).toBe(1_000_000)
    expect(clips[1].inPointMicros).toBe(1_000_000)
    expect(clips[1].id).not.toBe(clipId)
  })

  it('refuses to split too close to either edge', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(splitClip(clipId, 1_000_001))
    expect(bus.getDoc().tracks[0].clips).toHaveLength(1)
  })

  it('duplicates a clip immediately after the original', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(duplicateClip(clipId))
    const clips = bus.getDoc().tracks[0].clips
    expect(clips).toHaveLength(2)
    expect(clips[1].startMicros).toBe(3_000_000)
    expect(clips[1].durationMicros).toBe(2_000_000)
  })

  it('deletes a clip', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(deleteClip(clipId))
    expect(bus.getDoc().tracks[0].clips).toHaveLength(0)
  })

  it('ripple-deletes, shifting later clips left to close the gap', () => {
    const { bus, clipId, trackId } = busWithClip()
    const second = createClip({ trackId, assetId: 'a2', startMicros: 4_000_000, durationMicros: 1_000_000 })
    bus.dispatch(addClip(second))
    bus.dispatch(deleteClip(clipId, { ripple: true }))
    const clips = bus.getDoc().tracks[0].clips
    expect(clips).toHaveLength(1)
    expect(clips[0].startMicros).toBe(2_000_000)
  })
})
