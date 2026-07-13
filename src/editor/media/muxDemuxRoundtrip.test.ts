import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { describe, expect, it } from 'vitest'
import { demuxVideoTrack } from './demux'

/** jsdom's File doesn't implement .stream(), which demux.ts's pumpFile relies on — this test only needs the subset it actually uses. */
function streamableFile(buffer: ArrayBuffer, name: string): File {
  const blob = new Blob([buffer])
  return Object.assign(blob, {
    name,
    lastModified: Date.now(),
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer))
          controller.close()
        },
      }),
  }) as unknown as File
}

/**
 * Exercises the exact interop our own code depends on: mp4-muxer writes the
 * proxy container during import (videoDerivatives.ts), and our own
 * mp4box-based demux.ts re-parses that same container during playback
 * (frameSource.ts) to configure a VideoDecoder. If mp4-muxer's box layout
 * and mp4box.js's box parsing (specifically `getCodecDescription`'s walk of
 * stsd entries) don't agree, the codec `description` (avcC — SPS/PPS) that
 * comes back is wrong or missing, and VideoDecoder.configure() silently
 * fails to ever produce output — decode always "fails" on a container we
 * produced and consume ourselves, even though decode of the *original*
 * camera-produced file worked fine (proven by proxy generation succeeding
 * in the first place).
 *
 * No real WebCodecs needed: mp4-muxer's addVideoChunkRaw takes plain bytes,
 * so this is a pure Node-runnable round-trip of the container format.
 */
describe('proxy mp4 mux -> demux round-trip', () => {
  it('recovers the exact codec description bytes that were muxed in', async () => {
    const width = 64
    const height = 36
    // A syntactically valid AVCDecoderConfigurationRecord (avcC payload, no
    // box wrapper — this is the exact shape WebCodecs' VideoDecoderConfig
    // .description carries): version, profile, compat, level,
    // lengthSizeMinusOne, nb_SPS + one SPS, nb_PPS + one PPS. Content bytes
    // are arbitrary; the *structure* has to be real or mp4box's avcC parser
    // reads past the end looking for a PPS section that isn't there —
    // which is a bug in a hand-rolled test fixture, not in the pipeline.
    const description = new Uint8Array([
      0x01, 0x42, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x05, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01, 0x00, 0x03, 0x11, 0x22, 0x33,
    ])
    const fakeFrameData = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x65, 0x88, 0x84, 0x00])

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height },
      fastStart: 'in-memory',
    })
    muxer.addVideoChunkRaw(fakeFrameData, 'key', 0, 33_333, {
      decoderConfig: {
        codec: 'avc1.42001f',
        codedWidth: width,
        codedHeight: height,
        description,
      },
    })
    muxer.finalize()

    const file = streamableFile(muxer.target.buffer as ArrayBuffer, 'proxy.mp4')

    let recoveredDescription: Uint8Array | undefined
    let recoveredCodec: string | undefined
    let recoveredWidth: number | undefined
    let sampleCount = 0

    await demuxVideoTrack(file, {
      onTrackInfo: (info) => {
        recoveredDescription = info.description
        recoveredCodec = info.codec
        recoveredWidth = info.width
      },
      onSample: () => {
        sampleCount++
      },
    })

    expect(recoveredWidth).toBe(width)
    expect(recoveredCodec).toMatch(/^avc1\./)
    expect(sampleCount).toBe(1)
    expect(recoveredDescription).toBeDefined()
    expect(new Uint8Array(recoveredDescription!)).toEqual(description)
  })
})
