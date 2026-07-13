import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from './clips'
import { CommandBus } from './bus'
import { removeEffect, setAdjustment, setLut } from './effects'

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

describe('setLut', () => {
  it('adds a lut effect with the given id and intensity', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setLut(clipId, 'warm', 0.8))
    const effects = bus.getDoc().tracks[0].clips[0].effects
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ type: 'lut', lutAssetId: 'warm', params: { value: 0.8 } })
  })

  it('defaults intensity to 1', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setLut(clipId, 'cool'))
    expect(bus.getDoc().tracks[0].clips[0].effects[0].params.value).toBe(1)
  })

  it('updates the existing lut effect instead of duplicating', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setLut(clipId, 'warm', 1))
    bus.dispatch(setLut(clipId, 'noir', 0.5))
    const effects = bus.getDoc().tracks[0].clips[0].effects
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ lutAssetId: 'noir', params: { value: 0.5 } })
  })

  it('clears the lut effect when set to null', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setLut(clipId, 'warm'))
    bus.dispatch(setLut(clipId, null))
    expect(bus.getDoc().tracks[0].clips[0].effects).toHaveLength(0)
  })

  it('is a no-op clearing when no lut effect exists', () => {
    const { bus, clipId } = busWithClip()
    const docBefore = bus.getDoc()
    bus.dispatch(setLut(clipId, null))
    expect(bus.getDoc()).toBe(docBefore)
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
