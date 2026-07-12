import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from './clips'
import { CommandBus } from './bus'
import { setTransitionOut } from './transitions'

function busWithClip() {
  const doc = createEmptyProjectDoc('P')
  const bus = new CommandBus(doc)
  const trackId = doc.tracks[0].id
  const clip = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
  bus.dispatch(addClip(clip))
  return { bus, clipId: clip.id }
}

describe('setTransitionOut', () => {
  it('sets a transition', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setTransitionOut(clipId, { type: 'crossDissolve', durationMicros: 500_000 }))
    expect(bus.getDoc().tracks[0].clips[0].transitionOut).toEqual({
      type: 'crossDissolve',
      durationMicros: 500_000,
    })
  })

  it('clears a transition', () => {
    const { bus, clipId } = busWithClip()
    bus.dispatch(setTransitionOut(clipId, { type: 'wipe', durationMicros: 500_000 }))
    bus.dispatch(setTransitionOut(clipId, null))
    expect(bus.getDoc().tracks[0].clips[0].transitionOut).toBeUndefined()
  })

  it('is a no-op clearing when there is no transition', () => {
    const { bus, clipId } = busWithClip()
    const docBefore = bus.getDoc()
    bus.dispatch(setTransitionOut(clipId, null))
    expect(bus.getDoc()).toBe(docBefore)
  })
})
