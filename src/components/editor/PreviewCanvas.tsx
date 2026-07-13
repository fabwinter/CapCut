import { useEffect, useRef, useCallback, useState } from 'react'
import { PlayIcon, PauseIcon, StepBackIcon, StepForwardIcon, SkipBackIcon, SkipForwardIcon } from 'lucide-react'
import type { ProjectDoc } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { microsToSeconds, secondsToMicros } from '#/editor/doc/time'
import { Compositor } from '#/editor/playback/compositor'
import { Transport } from '#/editor/playback/transport'
import { Button } from '#/components/ui/button'

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
        renderFrame(compositor, doc, time)
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
    }
  }, [doc, fps, width, height, background, onTimeChange])

  const renderFrame = useCallback(
    (compositor: Compositor, doc: ProjectDoc, _timeMicros: Micros) => {
      // Future: render actual composition
      // For now, just clear and show background
      compositor.renderBackground(doc.settings.background)
    },
    []
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
