import { useEffect, useRef, useCallback, useState } from 'react'
import { PlayIcon, PauseIcon } from 'lucide-react'
import type { ProjectDoc } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { microsToSeconds } from '#/editor/doc/time'
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

  const handlePlayPause = useCallback(() => {
    if (!transportRef.current) return

    if (isPlaying) {
      transportRef.current.pause()
    } else {
      transportRef.current.play()
    }
  }, [isPlaying])

  // Future: implement seek via scrubber interaction
  // const handleSeek = useCallback((time: Micros) => {
  //   if (!transportRef.current) return
  //   transportRef.current.seek(time)
  // }, [])

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
      <div className="border-t border-border/50 px-3 py-2 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>

        {/* Timecode */}
        <span className="text-xs font-mono text-muted-foreground w-16">
          {formatTime(currentTime)}
        </span>

        {/* Seek slider (future) */}
        <div className="flex-1 h-1 bg-muted rounded-full cursor-pointer">
          {/* Interactive slider here */}
        </div>

        {/* Duration */}
        <span className="text-xs font-mono text-muted-foreground w-16">
          {formatTime(
            Math.max(
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
          )}
        </span>
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
