import { computeGainEnvelope } from '#/editor/playback/audioEnvelope'
import { projectDurationMicros, type ProjectDoc } from '#/editor/doc/schema'
import { microsToSeconds } from '#/editor/doc/time'

export const EXPORT_AUDIO_SAMPLE_RATE = 48_000

/**
 * Mixes every clip's audio (video-with-audio and audio-kind clips, honoring
 * per-clip volume/mute/fade/speed and track mute) down to one buffer
 * spanning the whole project, via `OfflineAudioContext` — the same gain-
 * envelope math `Transport` uses for realtime playback, just scheduled
 * against a non-realtime context instead. Returns `undefined` when the
 * project has no audio at all, so callers can skip the audio track entirely.
 */
export async function mixdownAudio(
  doc: ProjectDoc,
  getOriginalFile: (assetId: string) => Promise<File>,
): Promise<AudioBuffer | undefined> {
  const durationSeconds = microsToSeconds(projectDurationMicros(doc))
  if (durationSeconds <= 0) return undefined

  const audioBufferCache = new Map<string, Promise<AudioBuffer | undefined>>()
  function getSourceAudioBuffer(assetId: string, ctx: OfflineAudioContext): Promise<AudioBuffer | undefined> {
    let p = audioBufferCache.get(assetId)
    if (!p) {
      p = getOriginalFile(assetId)
        .then((file) => file.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .catch(() => undefined)
      audioBufferCache.set(assetId, p)
    }
    return p
  }

  const length = Math.max(1, Math.ceil(durationSeconds * EXPORT_AUDIO_SAMPLE_RATE))
  const ctx = new OfflineAudioContext(2, length, EXPORT_AUDIO_SAMPLE_RATE)
  const master = ctx.createGain()
  master.connect(ctx.destination)

  let scheduledAny = false

  for (const track of doc.tracks) {
    if (track.muted || track.kind === 'text') continue
    for (const clip of track.clips) {
      if (clip.muted) continue
      const asset = doc.assets.find((a) => a.id === clip.assetId)
      if (!asset || (asset.kind !== 'audio' && asset.kind !== 'video')) continue

      const buffer = await getSourceAudioBuffer(asset.id, ctx)
      if (!buffer) continue

      const sourceOffsetSeconds = Math.min(buffer.duration, Math.max(0, clip.inPointMicros / 1_000_000))
      const sourceSpanSeconds = (clip.durationMicros * clip.speed) / 1_000_000
      const playableSourceSeconds = Math.min(sourceSpanSeconds, buffer.duration - sourceOffsetSeconds)
      if (playableSourceSeconds <= 0) continue

      const whenSeconds = clip.startMicros / 1_000_000
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = clip.speed
      const gain = ctx.createGain()
      const envelope = computeGainEnvelope(clip, 0)
      for (const point of envelope) {
        if (point.ramp) gain.gain.linearRampToValueAtTime(point.value, whenSeconds + point.atSeconds)
        else gain.gain.setValueAtTime(point.value, whenSeconds + point.atSeconds)
      }
      source.connect(gain).connect(master)
      source.start(whenSeconds, sourceOffsetSeconds, playableSourceSeconds)
      scheduledAny = true
    }
  }

  if (!scheduledAny) return undefined
  return ctx.startRendering()
}
