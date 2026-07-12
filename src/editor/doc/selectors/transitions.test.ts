import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from '../commands/clips'
import { CommandBus } from '../commands/bus'
import { findAdjacentNextClip } from './transitions'

describe('findAdjacentNextClip', () => {
  it('finds the clip that starts exactly where the given clip ends', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    const a = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
    const b = createClip({ trackId, assetId: 'a2', startMicros: 2_000_000, durationMicros: 2_000_000 })
    bus.dispatch(addClip(a))
    bus.dispatch(addClip(b))

    const docA = bus.getDoc().tracks[0].clips[0]
    expect(findAdjacentNextClip(bus.getDoc(), docA)?.id).toBe(b.id)
  })

  it('returns undefined when there is a gap before the next clip', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    const a = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
    const b = createClip({ trackId, assetId: 'a2', startMicros: 3_000_000, durationMicros: 2_000_000 })
    bus.dispatch(addClip(a))
    bus.dispatch(addClip(b))

    expect(findAdjacentNextClip(bus.getDoc(), bus.getDoc().tracks[0].clips[0])).toBeUndefined()
  })

  it('returns undefined when the clip is last on its track', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    const a = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
    bus.dispatch(addClip(a))
    expect(findAdjacentNextClip(bus.getDoc(), bus.getDoc().tracks[0].clips[0])).toBeUndefined()
  })
})
