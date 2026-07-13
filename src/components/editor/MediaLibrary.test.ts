import { describe, expect, it, vi } from 'vitest'
import { createClip } from '#/editor/doc/commands/clips'
import type { Command } from '#/editor/doc/commands/types'
import { createEmptyProjectDoc, type AssetRef } from '#/editor/doc/schema'
import { autoDetectProjectSettings } from './MediaLibrary'

function videoAsset(overrides: Partial<AssetRef> = {}): AssetRef {
  return {
    id: 'asset-1',
    kind: 'video',
    opfsPath: 'assets/asset-1/original',
    originalName: 'clip.mov',
    status: 'ready',
    createdAt: Date.now(),
    width: 1920,
    height: 1080,
    fps: 24,
    ...overrides,
  }
}

describe('autoDetectProjectSettings', () => {
  it('applies the video dimensions and fps to an empty, untouched project', () => {
    const doc = createEmptyProjectDoc('P')
    doc.assets.push(videoAsset())
    const dispatch = vi.fn()

    autoDetectProjectSettings(doc, 'asset-1', dispatch)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0][0] as Command
    const draft = structuredClone(doc)
    command.recipe(draft)
    expect(draft.settings.width).toBe(1920)
    expect(draft.settings.height).toBe(1080)
    expect(draft.settings.fps).toBe(24)
  })

  it('falls back to the project fps when the asset has none', () => {
    const doc = createEmptyProjectDoc('P')
    doc.assets.push(videoAsset({ fps: undefined }))
    const dispatch = vi.fn()

    autoDetectProjectSettings(doc, 'asset-1', dispatch)

    const command = dispatch.mock.calls[0][0] as Command
    const draft = structuredClone(doc)
    command.recipe(draft)
    expect(draft.settings.fps).toBe(doc.settings.fps)
  })

  it('does nothing once the timeline already has a clip', () => {
    const doc = createEmptyProjectDoc('P')
    doc.assets.push(videoAsset())
    doc.tracks[0].clips.push(createClip({ trackId: doc.tracks[0].id, assetId: 'other', startMicros: 0, durationMicros: 1_000_000 }))
    const dispatch = vi.fn()

    autoDetectProjectSettings(doc, 'asset-1', dispatch)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does nothing when a second video asset already exists', () => {
    const doc = createEmptyProjectDoc('P')
    doc.assets.push(videoAsset({ id: 'asset-0' }), videoAsset({ id: 'asset-1' }))
    const dispatch = vi.fn()

    autoDetectProjectSettings(doc, 'asset-1', dispatch)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does nothing for a non-video asset', () => {
    const doc = createEmptyProjectDoc('P')
    doc.assets.push(videoAsset({ kind: 'image' }))
    const dispatch = vi.fn()

    autoDetectProjectSettings(doc, 'asset-1', dispatch)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does nothing when the asset has no known dimensions yet', () => {
    const doc = createEmptyProjectDoc('P')
    doc.assets.push(videoAsset({ width: undefined, height: undefined }))
    const dispatch = vi.fn()

    autoDetectProjectSettings(doc, 'asset-1', dispatch)

    expect(dispatch).not.toHaveBeenCalled()
  })
})
