import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from './clips'
import { CommandBus } from './bus'
import { addKeyframe, deleteKeyframe, moveKeyframe, updateKeyframeValue } from './keyframes'

function busWithClip() {
  const doc = createEmptyProjectDoc('P')
  const bus = new CommandBus(doc)
  const trackId = doc.tracks[0].id
  const clip = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
  bus.dispatch(addClip(clip))
  return { bus, clipId: clip.id }
}

describe('addKeyframe', () => {
  it('appends a keyframe clamped to the clip duration', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'opacity', 10_000_000, 0.5))
    const keyframes = bus.getDoc().tracks[0].clips[0].keyframes
    expect(keyframes).toHaveLength(1)
    expect(keyframes[0]).toMatchObject({ property: 'opacity', atMicros: 2_000_000, value: 0.5, easing: 'linear' })
  })

  it('replaces an existing keyframe at the same time and property', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'x', 500_000, 10))
    bus.dispatch(addKeyframe(clipId, 'x', 500_000, 20, 'easeIn'))
    const keyframes = bus.getDoc().tracks[0].clips[0].keyframes
    expect(keyframes).toHaveLength(1)
    expect(keyframes[0].value).toBe(20)
    expect(keyframes[0].easing).toBe('easeIn')
  })

  it('keeps separate keyframes for different properties at the same time', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'x', 500_000, 10))
    bus.dispatch(addKeyframe(clipId, 'y', 500_000, 20))
    expect(bus.getDoc().tracks[0].clips[0].keyframes).toHaveLength(2)
  })
})

describe('moveKeyframe', () => {
  it('moves a keyframe to a new clamped time', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'scale', 0, 1))
    const keyframeId = bus.getDoc().tracks[0].clips[0].keyframes[0].id
    bus.dispatch(moveKeyframe(clipId, keyframeId, 1_500_000))
    expect(bus.getDoc().tracks[0].clips[0].keyframes[0].atMicros).toBe(1_500_000)
  })
})

describe('updateKeyframeValue', () => {
  it('updates the value and optionally the easing', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'rotation', 0, 0))
    const keyframeId = bus.getDoc().tracks[0].clips[0].keyframes[0].id
    bus.dispatch(updateKeyframeValue(clipId, keyframeId, 45, 'easeOut'))
    const keyframe = bus.getDoc().tracks[0].clips[0].keyframes[0]
    expect(keyframe.value).toBe(45)
    expect(keyframe.easing).toBe('easeOut')
  })
})

describe('deleteKeyframe', () => {
  it('removes a keyframe by id', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(addKeyframe(clipId, 'opacity', 0, 1))
    const keyframeId = bus.getDoc().tracks[0].clips[0].keyframes[0].id
    bus.dispatch(deleteKeyframe(clipId, keyframeId))
    expect(bus.getDoc().tracks[0].clips[0].keyframes).toHaveLength(0)
  })
})
