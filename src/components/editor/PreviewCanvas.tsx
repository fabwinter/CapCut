import { useEffect, useRef, useCallback, useState } from 'react'
import { PlayIcon, PauseIcon, StepBackIcon, StepForwardIcon, SkipBackIcon, SkipForwardIcon } from 'lucide-react'
import type { ProjectDoc, Effect } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { microsToSeconds, secondsToMicros } from '#/editor/doc/time'
import { Compositor } from '#/editor/playback/compositor'
import { Transport } from '#/editor/playback/transport'
import { FrameSource } from '#/editor/media/frameSource'
import { Button } from '#/components/ui/button'

/**
 * Apply effects to a video frame using canvas processing.
 * Creates a new VideoFrame with effects applied.
 */
function applyEffectsToFrame(frame: VideoFrame, effects: Effect[], width: number, height: number): VideoFrame {
  // Create canvas and draw the video frame
  const canvas = new OffscreenCanvas(frame.displayWidth || width, frame.displayHeight || height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return frame
  }

  // Draw the original frame
  ctx.drawImage(frame as any, 0, 0)

  // Get image data to manipulate pixels
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Apply each effect
  for (const effect of effects) {
    switch (effect.type) {
      case 'brightness': {
        const amount = effect.params.amount ?? 0
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] + amount * 255)
          data[i + 1] = Math.min(255, data[i + 1] + amount * 255)
          data[i + 2] = Math.min(255, data[i + 2] + amount * 255)
        }
        break
      }
      case 'contrast': {
        const factor = effect.params.factor ?? 1
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128))
          data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128))
          data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128))
        }
        break
      }
      case 'saturation': {
        const amount = effect.params.amount ?? 0
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const gray = r * 0.299 + g * 0.587 + b * 0.114
          data[i] = Math.min(255, Math.max(0, gray + (r - gray) * (1 + amount)))
          data[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * (1 + amount)))
          data[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * (1 + amount)))
        }
        break
      }
      // TODO: Implement temperature, vignette, lut effects
    }
  }

  // Put modified image data back
  ctx.putImageData(imageData, 0, 0)

  // Create new VideoFrame from modified canvas
  const effectsFrame = new VideoFrame(canvas as any, {
    timestamp: frame.timestamp ?? 0,
    duration: frame.duration ?? 0,
  })

  return effectsFrame
}

interface PreviewCanvasProps {
  doc: ProjectDoc
  onTimeChange?: (time: Micros) => void
}

/**
 * Preview canvas with playback controls.
 * Renders composition of all tracks in real-time.
 */
export function PreviewCanvas({ doc, onTimeChange }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compositorRef = useRef<Compositor | null>(null)
  const transportRef = useRef<Transport | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState<Micros>(0)

  const { width, height, fps, background } = doc.settings

  // Create frame source for decoding video frames
  const frameSourceRef = useRef<FrameSource | null>(null)

  // Initialize compositor and transport
  useEffect(() => {
    if (!canvasRef.current) return

    try {
      const compositor = new Compositor({
        canvas: canvasRef.current,
        width,
        height,
      })
      compositorRef.current = compositor

      // Create frame source for this project
      const frameSource = new FrameSource(doc.id)
      frameSourceRef.current = frameSource

      const durationMicros = Math.max(
        ...doc.tracks.map((track) => {
          let max = 0
          for (const clip of track.clips) {
            const end = clip.startMicros + clip.durationMicros
            if (end > max) max = end
          }
          return max
        }),
        1_000_000
      )

      const transport = new Transport(durationMicros, fps)
      transportRef.current = transport

      transport.onTimeChange((time) => {
        setCurrentTime(time)
        onTimeChange?.(time)
        renderFrame(compositor, frameSource, doc, time)
      })

      transport.onPlayStateChanged(setIsPlaying)

      // Initial render
      compositor.renderBackground(background)
    } catch (err) {
      console.error('Failed to initialize preview:', err)
    }

    return () => {
      compositorRef.current?.dispose()
      transportRef.current?.close()
      frameSourceRef.current = null
    }
  }, [doc, fps, width, height, background, onTimeChange])

  const renderFrame = useCallback(
    (compositor: Compositor, frameSource: FrameSource, doc: ProjectDoc, timeMicros: Micros) => {
      // Render background first
      compositor.renderBackground(doc.settings.background)

      // Find all clips that are active at this time
      for (const track of doc.tracks) {
        for (const clip of track.clips) {
          // Check if clip is playing at this time
          if (timeMicros < clip.startMicros || timeMicros >= clip.startMicros + clip.durationMicros) {
            continue // Not playing
          }

          // Calculate time within the clip
          const clipLocalTime = timeMicros - clip.startMicros

          if (track.kind === 'text') {
            // Render text clip
            if (clip.text) {
              try {
                const textCanvas = new OffscreenCanvas(width, height)
                const ctx = textCanvas.getContext('2d')
                if (ctx) {
                  // Clear canvas
                  ctx.clearRect(0, 0, width, height)

                  // Configure text rendering
                  ctx.font = `${clip.text.fontSize}px ${clip.text.fontFamily}`
                  ctx.fillStyle = clip.text.color
                  ctx.textAlign = clip.text.align as CanvasTextAlign
                  ctx.textBaseline = 'middle'

                  // Add stroke if needed
                  if (clip.text.strokeWidth > 0) {
                    ctx.strokeStyle = clip.text.strokeColor || '#000000'
                    ctx.lineWidth = clip.text.strokeWidth
                    ctx.strokeText(clip.text.content, width / 2, height / 2)
                  }

                  // Draw text
                  ctx.fillText(clip.text.content, width / 2, height / 2)

                  // Render using compositor
                  const imageData = ctx.getImageData(0, 0, width, height)
                  compositor.renderClip({
                    imageData,
                    opacity: clip.transform.opacity,
                    x: clip.transform.x,
                    y: clip.transform.y,
                    scaleX: clip.transform.scale,
                    scaleY: clip.transform.scale,
                    rotation: clip.transform.rotation,
                    blendMode: 'normal'
                  })
                }
              } catch (err) {
                console.error('Failed to render text clip:', err)
              }
            }
          } else if (track.kind === 'video' || track.kind === 'audio') {
            // Render video/audio clip
            const inPoint = clip.inPointMicros || 0
            const sourceTime = inPoint + Math.floor(clipLocalTime / clip.speed)

            // Get frame from source
            if (clip.assetId) {
              frameSource.getFrame(clip.assetId, sourceTime, fps, 'proxy')
                .then((decodedFrame) => {
                  if (decodedFrame) {
                    // Render the frame using compositor
                    const frame = decodedFrame.frame

                    // Calculate display size (fit to canvas)
                    const scaleX = width / (frame.displayWidth || width)
                    const scaleY = height / (frame.displayHeight || height)
                    const scale = Math.min(scaleX, scaleY)

                    // Apply effects to frame if present
                    let effectsFrame = frame
                    if (clip.effects && clip.effects.length > 0) {
                      try {
                        effectsFrame = applyEffectsToFrame(frame, clip.effects, width, height)
                      } catch (err) {
                        console.error('Failed to apply effects:', err)
                      }
                    }

                    compositor.renderClip({
                      videoFrame: effectsFrame,
                      opacity: clip.transform.opacity,
                      x: clip.transform.x,
                      y: clip.transform.y,
                      scaleX: scale * clip.transform.scale,
                      scaleY: scale * clip.transform.scale,
                      rotation: clip.transform.rotation,
                      blendMode: 'normal'
                    })
                  }
                })
                .catch((err) => {
                  console.error('Failed to decode frame:', err)
                })
            }
          }
        }
      }
    },
    [width, height]
  )

  const projectDuration = Math.max(
    ...doc.tracks.map((track) => {
      let max = 0
      for (const clip of track.clips) {
        const end = clip.startMicros + clip.durationMicros
        if (end > max) max = end
      }
      return max
    }),
    1_000_000
  )

  const handlePlayPause = useCallback(() => {
    if (!transportRef.current) return

    if (isPlaying) {
      transportRef.current.pause()
    } else {
      transportRef.current.play()
    }
  }, [isPlaying])

  const handleStop = useCallback(() => {
    if (!transportRef.current) return
    transportRef.current.pause()
    transportRef.current.seek(0)
  }, [])

  const handleSkipStart = useCallback(() => {
    if (!transportRef.current) return
    transportRef.current.pause()
    transportRef.current.seek(0)
    setCurrentTime(0)
  }, [])

  const handleSkipEnd = useCallback(() => {
    if (!transportRef.current) return
    transportRef.current.pause()
    transportRef.current.seek(projectDuration)
    setCurrentTime(projectDuration)
  }, [projectDuration])

  const handlePrevFrame = useCallback(() => {
    if (!transportRef.current) return
    transportRef.current.pause()
    const frameMicros = secondsToMicros(1 / fps)
    const newTime = Math.max(0, currentTime - frameMicros)
    transportRef.current.seek(newTime)
    setCurrentTime(newTime)
  }, [currentTime, fps])

  const handleNextFrame = useCallback(() => {
    if (!transportRef.current) return
    transportRef.current.pause()
    const frameMicros = secondsToMicros(1 / fps)
    const newTime = Math.min(projectDuration, currentTime + frameMicros)
    transportRef.current.seek(newTime)
    setCurrentTime(newTime)
  }, [currentTime, projectDuration, fps])

  const handleSeek = useCallback((time: Micros) => {
    if (!transportRef.current) return
    transportRef.current.seek(time)
    setCurrentTime(time)
  }, [])

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="max-h-full max-w-full"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      </div>

      {/* Controls */}
      <div className="border-t border-border/50 px-3 py-2 space-y-2">
        {/* Transport buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkipStart}
            aria-label="Skip to start"
            title="Skip to start"
            className="h-8 w-8"
          >
            <SkipBackIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevFrame}
            aria-label="Previous frame"
            title="Previous frame"
            className="h-8 w-8"
          >
            <StepBackIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="h-8 w-8"
          >
            {isPlaying ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStop}
            aria-label="Stop"
            title="Stop"
            className="h-8 w-8"
          >
            <div className="size-2 bg-current rounded-sm" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextFrame}
            aria-label="Next frame"
            title="Next frame"
            className="h-8 w-8"
          >
            <StepForwardIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkipEnd}
            aria-label="Skip to end"
            title="Skip to end"
            className="h-8 w-8"
          >
            <SkipForwardIcon className="size-3.5" />
          </Button>

          {/* Timecode */}
          <span className="text-xs font-mono text-muted-foreground ml-2 w-16">
            {formatTime(currentTime)}
          </span>

          {/* Duration */}
          <span className="text-xs font-mono text-muted-foreground w-16">
            / {formatTime(projectDuration)}
          </span>
        </div>

        {/* Seek slider */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max={projectDuration}
            value={currentTime}
            onChange={(e) => handleSeek(parseInt(e.target.value))}
            className="flex-1 h-2 bg-muted rounded-full cursor-pointer accent-primary"
            aria-label="Seek timeline"
          />
        </div>
      </div>
    </div>
  )
}

function formatTime(micros: Micros): string {
  const seconds = microsToSeconds(micros)
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}
