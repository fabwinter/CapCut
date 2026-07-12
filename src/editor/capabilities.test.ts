import { describe, expect, it } from 'vitest'
import { probeCapabilities } from './capabilities'

describe('probeCapabilities', () => {
  it('degrades gracefully when WebCodecs/OPFS are unavailable (jsdom has neither)', async () => {
    const caps = await probeCapabilities()
    // SharedArrayBuffer is a JS language global (present under Node, unlike
    // the DOM-only APIs below), so it's checked separately from the rest.
    expect(caps).toEqual({
      webCodecs: false,
      videoDecodeH264: false,
      videoEncodeH264: false,
      audioDecodeAAC: false,
      audioEncodeAAC: false,
      opfs: false,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      crossOriginIsolated: false,
      webgl2: false,
    })
  })
})
