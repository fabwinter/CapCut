import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from './clips'
import { CommandBus } from './bus'
import { removeEffect, setAdjustment } from './effects'

function busWithClip() {
  const doc = createEmptyProjectDoc('P')
  const bus = new CommandBus(doc)
  const trackId = doc.tracks[0].id
  const clip = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })
  bus.dispatch(addClip(clip))
  return { bus, clipId: clip.id }
}

describe('setAdjustment', () => {
  it('adds an effect when moved away from neutral', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setAdjustment(clipId, 'brightness', 0.3, 0))
    const effects = bus.getDoc().tracks[0].clips[0].effects
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ type: 'brightness', params: { value: 0.3 } })
  })

  it('updates the existing effect of that type instead of duplicating', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setAdjustment(clipId, 'contrast', 1.5, 1))
    bus.dispatch(setAdjustment(clipId, 'contrast', 1.2, 1))
    const effects = bus.getDoc().tracks[0].clips[0].effects
    expect(effects).toHaveLength(1)
    expect(effects[0].params.value).toBe(1.2)
  })

  it('removes the effect when set back to neutral', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setAdjustment(clipId, 'saturation', 1.5, 1))
    bus.dispatch(setAdjustment(clipId, 'saturation', 1, 1))
    expect(bus.getDoc().tracks[0].clips[0].effects).toHaveLength(0)
  })

  it('is a no-op setting neutral when no effect exists yet', () => {
    const { bus, clipId } = busWithClip()
    const docBefore = bus.getDoc()
    bus.dispatch(setAdjustment(clipId, 'vignette', 0, 0))
    expect(bus.getDoc()).toBe(docBefore)
  })

  it('keeps independent effects for different adjustment types', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setAdjustment(clipId, 'brightness', 0.2, 0))
    bus.dispatch(setAdjustment(clipId, 'temperature', -0.3, 0))
    expect(bus.getDoc().tracks[0].clips[0].effects).toHaveLength(2)
  })
})

describe('removeEffect', () => {
  it('removes an effect by id', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setAdjustment(clipId, 'brightness', 0.2, 0))
    const effectId = bus.getDoc().tracks[0].clips[0].effects[0].id
    bus.dispatch(removeEffect(clipId, effectId))
    expect(bus.getDoc().tracks[0].clips[0].effects).toHaveLength(0)
  })
})
