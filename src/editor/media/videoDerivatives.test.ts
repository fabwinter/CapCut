import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertCodecsSupported, DEFAULT_VIDEO_DERIVATIVES_OPTIONS } from './videoDerivatives'

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
