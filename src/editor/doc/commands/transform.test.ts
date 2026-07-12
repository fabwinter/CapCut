import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from './clips'
import { CommandBus } from './bus'
import { setClipTransform } from './transform'

describe('setClipTransform', () => {
  it('patches only the given transform fields', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const clip = createClip({ trackId: doc.tracks[0].id, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })
    bus.dispatch(addClip(clip))

    bus.dispatch(setClipTransform(clip.id, { x: 10, y: -5 }))
    const transform = bus.getDoc().tracks[0].clips[0].transform
    expect(transform.x).toBe(10)
    expect(transform.y).toBe(-5)
    expect(transform.scale).toBe(1)
  })

  it('is a no-op when the patch matches the current transform', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const clip = createClip({ trackId: doc.tracks[0].id, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })
    bus.dispatch(addClip(clip))
    const docBefore = bus.getDoc()

    bus.dispatch(setClipTransform(clip.id, { scale: 1 }))
    expect(bus.getDoc()).toBe(docBefore)
  })

  it('is a no-op for an unknown clip', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    const docBefore = bus.getDoc()
    bus.dispatch(setClipTransform('missing', { x: 5 }))
    expect(bus.getDoc()).toBe(docBefore)
  })
})
