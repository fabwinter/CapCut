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
import { setClipFades } from './clipProperties'
import { addKeyframe } from './keyframes'

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

  it('trimming the start shifts keyframes to stay clip-local, dropping any pushed before the new start', () => {
    const { bus, clipId } = busWithClip()
    // Clip is 2s long (0..2_000_000 clip-local). Keyframes at 200ms and 1.8s in.
    bus.dispatch(addKeyframe(clipId, 'opacity', 200_000, 0.5))
    bus.dispatch(addKeyframe(clipId, 'opacity', 1_800_000, 1))
    bus.dispatch(trimClipStart(clipId, 1_500_000)) // moves start in by 500ms
    const clip = bus.getDoc().tracks[0].clips[0]
    // The keyframe at 200ms is now before the new start — dropped.
    expect(clip.keyframes).toHaveLength(1)
    expect(clip.keyframes[0].atMicros).toBe(1_300_000)
  })

  it('trimming the start reduces fadeInMicros by the same amount', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipFades(clipId, { fadeInMicros: 400_000 }))
    bus.dispatch(trimClipStart(clipId, 1_300_000)) // moves start in by 300ms
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.fadeInMicros).toBe(100_000)
  })

  it('trimming the end drops keyframes past the new duration and shortens fadeOutMicros', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'opacity', 1_900_000, 1))
    bus.dispatch(setClipFades(clipId, { fadeOutMicros: 400_000 }))
    bus.dispatch(trimClipEnd(clipId, 2_500_000)) // new duration 1_500_000, removes 500ms from end
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.keyframes).toHaveLength(0)
    expect(clip.fadeOutMicros).toBe(0)
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

  it('splitting clears the inherited fade-in on the second half and fade-out on the first half', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipFades(clipId, { fadeInMicros: 300_000, fadeOutMicros: 300_000 }))
    bus.dispatch(splitClip(clipId, 2_000_000))
    const clips = bus.getDoc().tracks[0].clips
    expect(clips[0].fadeInMicros).toBe(300_000)
    expect(clips[0].fadeOutMicros).toBe(0)
    expect(clips[1].fadeInMicros).toBe(0)
    expect(clips[1].fadeOutMicros).toBe(300_000)
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
