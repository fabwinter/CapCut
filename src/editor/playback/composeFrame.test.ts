import { describe, expect, it, vi } from 'vitest'
import { createEmptyProjectDoc, type AssetRef } from '../doc/schema'
import { createClip } from '../doc/commands/clips'
import { composeFrame } from './composeFrame'
import type { Compositor } from './compositor/gl'
import type { FrameSourceManager } from './frameSource'

function docWithImageClip() {
  const doc = createEmptyProjectDoc('P')
  const asset: AssetRef = {
    id: 'asset-1',
    kind: 'image',
    opfsPath: 'assets/asset-1/original',
    originalName: 'red.png',
    status: 'ready',
    width: 4,
    height: 4,
    createdAt: Date.now(),
  }
  doc.assets.push(asset)
  const clip = createClip({ trackId: doc.tracks[0].id, assetId: asset.id, startMicros: 0, durationMicros: 1_000_000 })
  doc.tracks[0].clips.push(clip)
  return { doc, clip }
}

function stubCompositor(overrides: Partial<Record<'drawLayer' | 'clear', () => void>> = {}) {
  return {
    clear: overrides.clear ?? vi.fn(),
    drawLayer: overrides.drawLayer ?? vi.fn(),
    setScissor: vi.fn(),
    clearScissor: vi.fn(),
  } as unknown as Compositor
}

const fakeBitmap = { width: 4, height: 4 } as ImageBitmap

function resources() {
  return {
    getProxyFile: () => Promise.reject(new Error('not used')),
    getImageBitmap: () => Promise.resolve(fakeBitmap),
    frameSources: {} as FrameSourceManager,
  }
}

describe('composeFrame draw-loop error reporting', () => {
  it('reports a throwing drawLayer to onClipError and onFrameRendered instead of rejecting silently', async () => {
    const { doc, clip } = docWithImageClip()
    const compositor = stubCompositor({
      drawLayer: () => {
        throw new TypeError('texImage2D: unsupported source')
      },
    })

    const errors: { clipId: string; message: string }[] = []
    let frameHadError: boolean | undefined

    // Must resolve, not reject — a draw failure used to escape this loop and
    // reject the whole composeFrame promise with no error callback fired.
    await composeFrame(compositor, doc, 0, {
      ...resources(),
      onClipError: (clipId, message) => errors.push({ clipId, message }),
      onFrameRendered: (hadError) => {
        frameHadError = hadError
      },
    })

    expect(errors).toEqual([{ clipId: clip.id, message: 'texImage2D: unsupported source' }])
    expect(frameHadError).toBe(true)
  })

  it('reports a clean frame via onFrameRendered(false) when drawing succeeds', async () => {
    const { doc } = docWithImageClip()
    const compositor = stubCompositor()

    let frameHadError: boolean | undefined
    await composeFrame(compositor, doc, 0, {
      ...resources(),
      onFrameRendered: (hadError) => {
        frameHadError = hadError
      },
    })

    expect(frameHadError).toBe(false)
  })
})

describe('composeFrame transitions', () => {
  it('advances the incoming clip forward through its own footage during a transition, instead of freezing on its first frame', async () => {
    const doc = createEmptyProjectDoc('P')
    const videoAsset = (id: string): AssetRef => ({
      id,
      kind: 'video',
      opfsPath: `assets/${id}/original`,
      originalName: `${id}.mp4`,
      status: 'ready',
      width: 100,
      height: 100,
      proxy: { opfsPath: `assets/${id}/proxy.mp4`, width: 100, height: 100 },
      createdAt: Date.now(),
    })
    doc.assets.push(videoAsset('a'), videoAsset('b'))

    const clipA = createClip({ trackId: doc.tracks[0].id, assetId: 'a', startMicros: 0, durationMicros: 1_000_000 })
    clipA.transitionOut = { type: 'crossDissolve', durationMicros: 400_000 }
    const clipB = createClip({
      trackId: doc.tracks[0].id,
      assetId: 'b',
      startMicros: 1_000_000,
      durationMicros: 1_000_000,
      inPointMicros: 2_000_000,
    })
    doc.tracks[0].clips.push(clipA, clipB)

    const requestedLocalMicros: { assetId: string; localMicros: number }[] = []
    const fakeFrame = { codedWidth: 100, codedHeight: 100, close: () => {} }
    const compositor = stubCompositor()

    await composeFrame(compositor, doc, 700_000, {
      getProxyFile: () => Promise.resolve({} as unknown as File),
      getImageBitmap: () => Promise.reject(new Error('not used')),
      frameSources: {
        getFrame: (assetId: string, _file: File, localMicros: number) => {
          requestedLocalMicros.push({ assetId, localMicros })
          return Promise.resolve(fakeFrame as unknown as VideoFrame)
        },
        getLastFailureMessage: () => undefined,
      } as unknown as FrameSourceManager,
    })

    const bCall = requestedLocalMicros.find((r) => r.assetId === 'b')
    // 700_000 is 100_000µs into the 400_000µs transition (which starts at
    // 600_000 — clipA's end minus the transition duration); clip B should be
    // sampled 100_000µs into its own footage from its in-point, not frozen
    // at inPointMicros itself.
    expect(bCall?.localMicros).toBe(2_000_000 + 100_000)
  })
})
