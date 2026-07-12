import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { CommandBus } from './bus'
import { addTrack, removeTrack, reorderTracks, setTrackLocked, setTrackMuted } from './tracks'

describe('track commands', () => {
  it('adds a track with an auto-generated name', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    bus.dispatch(addTrack('overlay'))
    const track = bus.getDoc().tracks.at(-1)
    expect(track?.kind).toBe('overlay')
    expect(track?.name).toBe('Overlay 1')
  })

  it('removes a track and its clips', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    const trackId = bus.getDoc().tracks[0].id
    bus.dispatch(removeTrack(trackId))
    expect(bus.getDoc().tracks.find((t) => t.id === trackId)).toBeUndefined()
  })

  it('reorders tracks', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    const [first, second] = bus.getDoc().tracks
    bus.dispatch(reorderTracks(second.id, 0))
    expect(bus.getDoc().tracks[0].id).toBe(second.id)
    expect(bus.getDoc().tracks[1].id).toBe(first.id)
  })

  it('toggles mute and lock', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    const trackId = bus.getDoc().tracks[0].id
    bus.dispatch(setTrackMuted(trackId, true))
    bus.dispatch(setTrackLocked(trackId, true))
    const track = bus.getDoc().tracks[0]
    expect(track.muted).toBe(true)
    expect(track.locked).toBe(true)
  })

  it('is a no-op when the value is unchanged', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    const trackId = bus.getDoc().tracks[0].id
    bus.dispatch(setTrackMuted(trackId, false))
    expect(bus.canUndo()).toBe(false)
  })
})
