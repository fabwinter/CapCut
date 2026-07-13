import { describe, it, expect, beforeEach } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import type { ProjectDoc } from '../schema'
import { CommandBus } from './bus'
import { addClipFromAsset } from './clips'
import {
  setClipSpeed,
  setClipVolume,
  setClipMuted,
  setClipFadeIn,
  setClipFadeOut,
  setClipTransform,
  extractAudioFromClip,
  setProjectAspect,
} from './editing'
import { secondsToMicros } from '../time'

describe('editing commands', () => {
  let doc: ProjectDoc
  let bus: CommandBus
  const fps = 30

  beforeEach(() => {
    doc = createEmptyProjectDoc('Test')
    bus = new CommandBus(doc)
    // Add a test clip
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-1', 2_000_000, fps))
  })

  it('sets clip speed and recomputes duration', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipSpeed(clipId, 2))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.speed).toBe(2)
    expect(clip.durationMicros).toBe(1_000_000) // 2s / 2 = 1s
  })

  it('undoes speed change', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipSpeed(clipId, 2))
    expect(bus.getDoc().tracks[0].clips[0].durationMicros).toBe(1_000_000)

    bus.undo()
    expect(bus.getDoc().tracks[0].clips[0].durationMicros).toBe(2_000_000)
    expect(bus.getDoc().tracks[0].clips[0].speed).toBe(1)
  })

  it('sets clip volume (0–200%)', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipVolume(clipId, 0.5))
    expect(bus.getDoc().tracks[0].clips[0].volume).toBe(0.5)

    bus.dispatch(setClipVolume(clipId, 2))
    expect(bus.getDoc().tracks[0].clips[0].volume).toBe(2)

    // Clamp over 200%
    bus.dispatch(setClipVolume(clipId, 3))
    expect(bus.getDoc().tracks[0].clips[0].volume).toBe(2)
  })

  it('sets clip mute state', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipMuted(clipId, true))
    expect(bus.getDoc().tracks[0].clips[0].muted).toBe(true)

    bus.dispatch(setClipMuted(clipId, false))
    expect(bus.getDoc().tracks[0].clips[0].muted).toBe(false)
  })

  it('sets clip fade in', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipFadeIn(clipId, 0.5))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.fadeInMicros).toBe(secondsToMicros(0.5))
  })

  it('sets clip fade out', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipFadeOut(clipId, 1))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.fadeOutMicros).toBe(secondsToMicros(1))
  })

  it('sets clip transform (position, scale, opacity)', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(
      setClipTransform(clipId, {
        x: 100,
        y: 200,
        scale: 1.5,
        opacity: 0.8,
      })
    )

    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.transform.x).toBe(100)
    expect(clip.transform.y).toBe(200)
    expect(clip.transform.scale).toBe(1.5)
    expect(clip.transform.opacity).toBe(0.8)
  })

  it('extracts audio from video clip', () => {
    const videoClipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(extractAudioFromClip(videoClipId))

    const updatedDoc = bus.getDoc()
    const audioTrack = updatedDoc.tracks.find((t) => t.kind === 'audio')
    expect(audioTrack).toBeDefined()
    expect(audioTrack!.clips.length).toBe(1)

    const audioClip = audioTrack!.clips[0]
    expect(audioClip.assetId).toBe('asset-1')
    expect(audioClip.startMicros).toBe(0)
    expect(audioClip.durationMicros).toBe(2_000_000)
  })

  it('sets project aspect ratio', () => {
    const before = bus.getDoc().settings

    bus.dispatch(setProjectAspect('16:9'))
    const after = bus.getDoc().settings

    expect(after.width).not.toBe(before.width)
    expect(after.height).toBe(1920)
  })

  it('detects no-op speed command', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id
    const beforeUndo = bus.canUndo()

    bus.dispatch(setClipSpeed(clipId, 1)) // Already at 1×
    const afterUndo = bus.canUndo()
    expect(afterUndo).toBe(beforeUndo) // No-op shouldn't create new undo step
  })

  it('detects no-op volume command', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id
    const beforeUndo = bus.canUndo()

    bus.dispatch(setClipVolume(clipId, 1)) // Already at 100%
    const afterUndo = bus.canUndo()
    expect(afterUndo).toBe(beforeUndo) // No-op shouldn't create new undo step
  })

  it('handles speed changes sequentially', () => {
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipSpeed(clipId, 2)) // 2s → 1s
    bus.dispatch(setClipSpeed(clipId, 0.5)) // 1s → 4s

    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.durationMicros).toBe(4_000_000)
    expect(clip.speed).toBe(0.5)

    bus.undo()
    expect(bus.getDoc().tracks[0].clips[0].durationMicros).toBe(1_000_000)
    expect(bus.getDoc().tracks[0].clips[0].speed).toBe(2)
  })
})
