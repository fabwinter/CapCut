import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertCodecsSupported, DEFAULT_VIDEO_DERIVATIVES_OPTIONS, drawRotatedFrame } from './videoDerivatives'

/** Records every canvas call in order so the exact transform+draw sequence can be asserted. */
function fakeCtx(): { calls: string[]; ctx: OffscreenCanvasRenderingContext2D } {
  const calls: string[] = []
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    rotate: (a: number) => calls.push(`rotate(${a.toFixed(4)})`),
    drawImage: (_source: unknown, dx: number, dy: number, dw: number, dh: number) =>
      calls.push(`drawImage(${dx},${dy},${dw},${dh})`),
  } as unknown as OffscreenCanvasRenderingContext2D
  return { calls, ctx }
}

const INFO = { videoCodec: 'avc1.640028', width: 1920, height: 1080, fps: 30 }

function stubIsConfigSupported(overrides: {
  decode?: boolean
  encode?: boolean
  proxyDecode?: boolean
}) {
  vi.stubGlobal('VideoDecoder', {
    isConfigSupported: vi.fn(async (config: { codedWidth: number }) => ({
      supported: config.codedWidth === INFO.width ? (overrides.decode ?? true) : (overrides.proxyDecode ?? true),
    })),
  })
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn(async () => ({ supported: overrides.encode ?? true })),
  })
}

describe('assertCodecsSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes when the original decodes, the proxy encodes, and the proxy decodes back', async () => {
    stubIsConfigSupported({})
    await expect(assertCodecsSupported(INFO, DEFAULT_VIDEO_DERIVATIVES_OPTIONS)).resolves.toBeUndefined()
  })

  it('rejects when the original video codec cannot be decoded', async () => {
    stubIsConfigSupported({ decode: false })
    await expect(assertCodecsSupported(INFO, DEFAULT_VIDEO_DERIVATIVES_OPTIONS)).rejects.toThrow(/cannot decode video codec/)
  })

  it('rejects when the proxy codec cannot be encoded', async () => {
    stubIsConfigSupported({ encode: false })
    await expect(assertCodecsSupported(INFO, DEFAULT_VIDEO_DERIVATIVES_OPTIONS)).rejects.toThrow(/cannot encode proxy codec/)
  })

  it('rejects when the device can encode the proxy codec but not decode it back — the gap that let a proxy import successfully yet never play', async () => {
    stubIsConfigSupported({ proxyDecode: false })
    await expect(assertCodecsSupported(INFO, DEFAULT_VIDEO_DERIVATIVES_OPTIONS)).rejects.toThrow(
      /can encode proxy codec .* but cannot decode it back/,
    )
  })

  it('rejects fast with no track info instead of proceeding into a doomed pipeline', async () => {
    stubIsConfigSupported({})
    await expect(assertCodecsSupported({}, DEFAULT_VIDEO_DERIVATIVES_OPTIONS)).rejects.toThrow(/No video track found/)
  })
})

describe('drawRotatedFrame', () => {
  it('draws straight through with no transform for an unrotated source', () => {
    const { calls, ctx } = fakeCtx()
    drawRotatedFrame(ctx, {} as CanvasImageSource, 0, 200, 100)
    expect(calls).toEqual(['save', 'drawImage(0,0,200,100)', 'restore'])
  })

  it('rotates 90 clockwise into a canvas already sized for the swapped (display) dimensions', () => {
    const { calls, ctx } = fakeCtx()
    // outWidth/outHeight are the *display* (post-rotation) canvas size —
    // the source frame's own native size is the swap of that.
    drawRotatedFrame(ctx, {} as CanvasImageSource, 90, 200, 100)
    expect(calls).toEqual(['save', 'translate(200,0)', 'rotate(1.5708)', 'drawImage(0,0,100,200)', 'restore'])
  })

  it('rotates 180 in place — no dimension swap', () => {
    const { calls, ctx } = fakeCtx()
    drawRotatedFrame(ctx, {} as CanvasImageSource, 180, 200, 100)
    expect(calls).toEqual(['save', 'translate(200,100)', 'rotate(3.1416)', 'drawImage(0,0,200,100)', 'restore'])
  })

  it('rotates 270 clockwise (90 counter-clockwise) into the swapped canvas', () => {
    const { calls, ctx } = fakeCtx()
    drawRotatedFrame(ctx, {} as CanvasImageSource, 270, 200, 100)
    expect(calls).toEqual(['save', 'translate(0,100)', 'rotate(-1.5708)', 'drawImage(0,0,100,200)', 'restore'])
  })
})
