import { describe, it, expect, beforeEach } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import type { ProjectDoc } from '../schema'
import { CommandBus } from './bus'
import {
  addClipFromAsset,
  moveClip,
  trimClipStart,
  trimClipEnd,
  splitClip,
  deleteClip,
  duplicateClip,
} from './clips'

describe('clip commands', () => {
  let doc: ProjectDoc
  let bus: CommandBus
  const fps = 30

  beforeEach(() => {
    doc = createEmptyProjectDoc('Test')
    bus = new CommandBus(doc)
  })

  it('adds clip from asset to track', () => {
    const trackId = doc.tracks[0].id
    const assetId = 'asset-1'
    const durationMicros = 1_000_000 // 1 second

    bus.dispatch(addClipFromAsset(trackId, assetId, durationMicros, fps))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip).toBeDefined()
    expect(clip.assetId).toBe(assetId)
    expect(clip.durationMicros).toBe(durationMicros)
    expect(clip.startMicros).toBe(0)
  })

  it('positions new clips after existing ones', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    bus.dispatch(addClipFromAsset(trackId, 'asset-2', 2_000_000, fps))

    const clips = bus.getDoc().tracks[0].clips
    expect(clips.length).toBe(2)
    expect(clips[0].startMicros).toBe(0)
    expect(clips[1].startMicros).toBe(1_000_000)
  })

  it('moves clip to new position', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(moveClip(clipId, trackId, 5_000_000, fps))
    expect(bus.getDoc().tracks[0].clips[0].startMicros).toBe(5_000_000)
  })

  it('moves clip between tracks', () => {
    const track1Id = doc.tracks[0].id
    const track2Id = doc.tracks[1].id

    bus.dispatch(addClipFromAsset(track1Id, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(moveClip(clipId, track2Id, 2_000_000, fps))

    expect(bus.getDoc().tracks[0].clips.length).toBe(0)
    expect(bus.getDoc().tracks[1].clips.length).toBe(1)
    expect(bus.getDoc().tracks[1].clips[0].trackId).toBe(track2Id)
  })

  it('trims clip start', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(trimClipStart(clipId, 500_000, fps))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.inPointMicros).toBe(500_000)
    expect(clip.durationMicros).toBe(500_000) // 1M - 500K
  })

  it('trims clip end', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(trimClipEnd(clipId, 800_000, fps))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.outPointMicros).toBe(800_000)
    expect(clip.durationMicros).toBe(800_000)
  })

  it('splits clip into two', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 2_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(splitClip(clipId, 1_000_000, fps))
    const clips = bus.getDoc().tracks[0].clips

    expect(clips.length).toBe(2)
    expect(clips[0].durationMicros).toBe(1_000_000)
    expect(clips[0].startMicros).toBe(0)
    expect(clips[1].startMicros).toBe(1_000_000)
    expect(clips[1].durationMicros).toBe(1_000_000)
  })

  it('deletes clip', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(deleteClip(clipId))
    expect(bus.getDoc().tracks[0].clips.length).toBe(0)
  })

  it('duplicates clip after original', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(duplicateClip(clipId, fps))
    const clips = bus.getDoc().tracks[0].clips

    expect(clips.length).toBe(2)
    expect(clips[1].startMicros).toBe(1_000_000)
    expect(clips[1].durationMicros).toBe(1_000_000)
    expect(clips[1].assetId).toBe(clips[0].assetId)
  })

  it('undoes clip addition', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    expect(bus.getDoc().tracks[0].clips.length).toBe(1)

    bus.undo()
    expect(bus.getDoc().tracks[0].clips.length).toBe(0)

    bus.redo()
    expect(bus.getDoc().tracks[0].clips.length).toBe(1)
  })

  it('preserves clip properties on duplicate', () => {
    const trackId = doc.tracks[0].id
    bus.dispatch(addClipFromAsset(trackId, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    // Modify some properties
    const cmd = {
      name: 'TestModify',
      recipe: (draft: any) => {
        const clip = draft.tracks[0].clips[0]
        clip.volume = 0.5
        clip.muted = true
        clip.speed = 1.5
      },
    }
    bus.dispatch(cmd)

    bus.dispatch(duplicateClip(clipId, fps))
    const clips = bus.getDoc().tracks[0].clips
    expect(clips[1].volume).toBe(0.5)
    expect(clips[1].muted).toBe(true)
    expect(clips[1].speed).toBe(1.5)
  })
})
