import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from '../commands/clips'
import { CommandBus } from '../commands/bus'
import { addTrack } from '../commands/tracks'
import { findActiveClips } from './activeClips'

describe('findActiveClips', () => {
  it('returns clips whose span covers the given time', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    bus.dispatch(addClip(createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })))
    bus.dispatch(addClip(createClip({ trackId, assetId: 'a2', startMicros: 2_000_000, durationMicros: 2_000_000 })))

    expect(findActiveClips(bus.getDoc(), 1_000_000)).toHaveLength(1)
    expect(findActiveClips(bus.getDoc(), 1_000_000)[0].clip.assetId).toBe('a1')
    expect(findActiveClips(bus.getDoc(), 3_000_000)[0].clip.assetId).toBe('a2')
    expect(findActiveClips(bus.getDoc(), 4_000_000)).toHaveLength(0)
  })

  it('excludes the clip end boundary (half-open interval)', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    bus.dispatch(addClip(createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })))
    expect(findActiveClips(bus.getDoc(), 2_000_000)).toHaveLength(0)
    expect(findActiveClips(bus.getDoc(), 1_999_999)).toHaveLength(1)
  })

  it('computes source-local time honoring in-point and speed', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    const clip = createClip({
      trackId,
      assetId: 'a1',
      startMicros: 1_000_000,
      durationMicros: 2_000_000,
      inPointMicros: 500_000,
    })
    bus.dispatch(addClip(clip))

    const active = findActiveClips(bus.getDoc(), 1_500_000)[0]
    expect(active.clipLocalMicros).toBe(500_000)
    expect(active.localMicros).toBe(1_000_000)
  })

  it('doubles the local-time advance for a 2x speed clip', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    const clip = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
    bus.dispatch(addClip(clip))
    bus.dispatch({
      name: 'TestSetSpeed',
      recipe: (draft) => {
        draft.tracks[0].clips[0].speed = 2
      },
    })

    const active = findActiveClips(bus.getDoc(), 1_000_000)[0]
    expect(active.localMicros).toBe(2_000_000)
  })

  it('orders results by track index, bottom-track first', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    bus.dispatch(addTrack('overlay'))
    const overlayTrackId = bus.getDoc().tracks.at(-1)!.id
    const videoTrackId = bus.getDoc().tracks[0].id
    bus.dispatch(addClip(createClip({ trackId: overlayTrackId, assetId: 'a2', startMicros: 0, durationMicros: 1_000_000 })))
    bus.dispatch(addClip(createClip({ trackId: videoTrackId, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })))

    const active = findActiveClips(bus.getDoc(), 500_000)
    expect(active.map((a) => a.clip.assetId)).toEqual(['a1', 'a2'])
  })
})
