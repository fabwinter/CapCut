import { describe, it, expect, beforeEach } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import type { ProjectDoc } from '../schema'
import { CommandBus } from './bus'
import { addClipFromAsset } from './clips'
import { addTextClip } from './editing'
import {
  setClipText,
  setClipEffect,
  removeClipEffect,
  setClipTransition,
  removeClipTransition,
} from './styling'

describe('styling commands', () => {
  let doc: ProjectDoc
  let bus: CommandBus
  const fps = 30

  beforeEach(() => {
    doc = createEmptyProjectDoc('Test')
    bus = new CommandBus(doc)
    // Add a text track and text clip
    const textTrack = doc.tracks.find((t) => t.kind === 'text')
    if (!textTrack) {
      doc.tracks.push({
        id: crypto.randomUUID(),
        kind: 'text',
        name: 'Text',
        muted: false,
        locked: false,
        clips: [],
      })
    }
  })

  it('sets text content', () => {
    bus.dispatch(addTextClip(doc.tracks.find((t) => t.kind === 'text')!.id, 'Hello', 0, 1_000_000))
    const clipId = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].id

    bus.dispatch(setClipText(clipId, { content: 'World' }))
    const clip = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0]
    expect(clip.text?.content).toBe('World')
  })

  it('sets text font size with clamping', () => {
    bus.dispatch(addTextClip(doc.tracks.find((t) => t.kind === 'text')!.id, 'Test', 0, 1_000_000))
    const clipId = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].id

    // Valid size
    bus.dispatch(setClipText(clipId, { fontSize: 48 }))
    expect(bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].text?.fontSize).toBe(48)

    // Over max (120)
    bus.dispatch(setClipText(clipId, { fontSize: 200 }))
    expect(bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].text?.fontSize).toBe(120)

    // Under min (8)
    bus.dispatch(setClipText(clipId, { fontSize: 2 }))
    expect(bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].text?.fontSize).toBe(8)
  })

  it('sets text color and stroke', () => {
    bus.dispatch(addTextClip(doc.tracks.find((t) => t.kind === 'text')!.id, 'Test', 0, 1_000_000))
    const clipId = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].id

    bus.dispatch(
      setClipText(clipId, {
        color: '#ff0000',
        strokeColor: '#000000',
        strokeWidth: 2,
      })
    )

    const clip = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0]
    expect(clip.text?.color).toBe('#ff0000')
    expect(clip.text?.strokeColor).toBe('#000000')
    expect(clip.text?.strokeWidth).toBe(2)
  })

  it('sets text animation', () => {
    bus.dispatch(addTextClip(doc.tracks.find((t) => t.kind === 'text')!.id, 'Test', 0, 1_000_000))
    const clipId = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0].id

    bus.dispatch(setClipText(clipId, { animationIn: 'fadeIn', animationOut: 'popIn' }))

    const clip = bus.getDoc().tracks.find((t) => t.kind === 'text')!.clips[0]
    expect(clip.text?.animationIn).toBe('fadeIn')
    expect(clip.text?.animationOut).toBe('popIn')
  })

  it('adds and removes effects', () => {
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    // Add brightness effect
    bus.dispatch(
      setClipEffect(clipId, 'brightness', { value: 1.2 })
    )
    let clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.effects.length).toBe(1)
    expect(clip.effects[0].type).toBe('brightness')

    // Add saturation effect
    bus.dispatch(
      setClipEffect(clipId, 'saturation', { value: 1.5 })
    )
    clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.effects.length).toBe(2)

    // Remove brightness
    bus.dispatch(removeClipEffect(clipId, 'brightness'))
    clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.effects.length).toBe(1)
    expect(clip.effects[0].type).toBe('saturation')
  })

  it('sets clip transition', () => {
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipTransition(clipId, 'crossDissolve', 500_000))
    const clip = bus.getDoc().tracks[0].clips[0]
    expect(clip.transitionOut?.type).toBe('crossDissolve')
    expect(clip.transitionOut?.durationMicros).toBe(500_000)
  })

  it('removes clip transition', () => {
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipTransition(clipId, 'dipToBlack', 300_000))
    expect(bus.getDoc().tracks[0].clips[0].transitionOut).toBeDefined()

    bus.dispatch(removeClipTransition(clipId))
    expect(bus.getDoc().tracks[0].clips[0].transitionOut).toBeUndefined()
  })

  it('undoes text and effect changes', () => {
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-1', 1_000_000, fps))
    const clipId = bus.getDoc().tracks[0].clips[0].id

    bus.dispatch(setClipEffect(clipId, 'brightness', { value: 1.5 }))
    expect(bus.getDoc().tracks[0].clips[0].effects.length).toBe(1)

    bus.undo()
    expect(bus.getDoc().tracks[0].clips[0].effects.length).toBe(0)

    bus.redo()
    expect(bus.getDoc().tracks[0].clips[0].effects.length).toBe(1)
  })
})
