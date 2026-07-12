import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from './clips'
import { CommandBus } from './bus'
import { setClipFades, setClipMuted, setClipSpeed, setClipVolume } from './clipProperties'
import { addKeyframe } from './keyframes'

function busWithClip() {
  const doc = createEmptyProjectDoc('P')
  const bus = new CommandBus(doc)
  const trackId = doc.tracks[0].id
  const clip = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 4_000_000 })
  bus.dispatch(addClip(clip))
  return { bus, clipId: clip.id }
}

describe('setClipSpeed', () => {
  it('halves the timeline duration at 2x speed, preserving source span', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipSpeed(clipId, 2))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.speed).toBe(2)
    expect(clip.durationMicros).toBe(2_000_000)
  })

  it('doubles the timeline duration at 0.5x speed', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipSpeed(clipId, 0.5))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.durationMicros).toBe(8_000_000)
  })

  it('clamps to the supported speed range', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipSpeed(clipId, 100))
    expect(bus.getDoc().tracks[0].clips[0].speed).toBe(10)
  })

  it('is a no-op when speed is unchanged', () => {
    const { bus, clipId } = busWithClip()
    const docBefore = bus.getDoc()
    bus.dispatch(setClipSpeed(clipId, 1))
    expect(bus.getDoc()).toBe(docBefore)
  })

  it('rescales keyframes and fades so they stay at the same proportional position', () => {
    const { bus, clipId } = busWithClip()
    // 4s clip; keyframe at the 50% mark, fades at the 25% mark each.
    bus.dispatch(addKeyframe(clipId, 'opacity', 2_000_000, 1))
    bus.dispatch(setClipFades(clipId, { fadeInMicros: 1_000_000, fadeOutMicros: 1_000_000 }))
    bus.dispatch(setClipSpeed(clipId, 2)) // duration halves to 2_000_000
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.durationMicros).toBe(2_000_000)
    expect(clip.keyframes[0].atMicros).toBe(1_000_000) // still the 50% mark
    expect(clip.fadeInMicros).toBe(500_000) // still the 25% mark
    expect(clip.fadeOutMicros).toBe(500_000)
  })
})

describe('setClipVolume', () => {
  it('clamps to [0, 2]', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipVolume(clipId, 5))
    expect(bus.getDoc().tracks[0].clips[0].volume).toBe(2)
    bus.dispatch(setClipVolume(clipId, -1))
    expect(bus.getDoc().tracks[0].clips[0].volume).toBe(0)
  })
})

describe('setClipMuted', () => {
  it('toggles mute', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipMuted(clipId, true))
    expect(bus.getDoc().tracks[0].clips[0].muted).toBe(true)
  })
})

describe('setClipFades', () => {
  it('sets fade in/out clamped to clip duration', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipFades(clipId, { fadeInMicros: 500_000, fadeOutMicros: 10_000_000 }))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.fadeInMicros).toBe(500_000)
    expect(clip.fadeOutMicros).toBe(4_000_000)
  })

  it('patches only the given fade field', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setClipFades(clipId, { fadeInMicros: 200_000 }))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.fadeInMicros).toBe(200_000)
    expect(clip.fadeOutMicros).toBe(0)
  })
})
