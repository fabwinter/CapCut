import { PauseIcon, PlayIcon, RotateCcwIcon, Volume2Icon, VolumeXIcon, MaximizeIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { setClipTransform } from '#/editor/doc/commands/transform'
import type { ProjectDoc, Transform } from '#/editor/doc/schema'
import { projectDurationMicros } from '#/editor/doc/schema'
import { microsToSeconds } from '#/editor/doc/time'
import { hitTestClip, sourceDimensionsFor } from '#/editor/playback/hitTest'
import { computeQuadCorners, type Point, type Quad } from '#/editor/playback/compositor/transform2d'
import { Transport } from '#/editor/playback/transport'
import { useEditorStore } from '#/editor/state/editorStore'

interface PreviewCanvasProps {
  projectId: string
  doc: ProjectDoc
}

function formatTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const m = Math.floor(totalMs / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface ActivePointer {
  x: number
  y: number
}

interface ManipulateGesture {
  clipId: string
  origin: Transform
  downPoint: Point
  pointers: Map<number, ActivePointer>
  pinchStart?: { distance: number; angle: number }
  moved: boolean
  lastPatch: Partial<Transform>
}

export function PreviewCanvas({ projectId, doc }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const transportRef = useRef<Transport | null>(null)
  const gestureRef = useRef<ManipulateGesture | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectionQuad, setSelectionQuad] = useState<Quad | undefined>(undefined)
  const [renderError, setRenderError] = useState<string | undefined>(undefined)

  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const playheadMicros = useEditorStore((s) => s.playheadMicros)
  const selectClip = useEditorStore((s) => s.selectClip)
  const dispatch = useEditorStore((s) => s.dispatch)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const transport = new Transport(projectId, () => useEditorStore.getState().doc!, canvas, {
      onTick: (micros) => useEditorStore.getState().setPlayhead(micros),
      onPlayStateChange: (playing) => setIsPlaying(playing),
      onRenderError: (_clipId, message) => setRenderError(message),
      onFrameRendered: (hadError) => {
        if (!hadError) setRenderError(undefined)
      },
    })
    transportRef.current = transport
    return () => {
      transport.destroy()
      transportRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one Transport per mounted editor; projectId doesn't change without remounting the route
  }, [projectId])

  function computeSelectionQuad(override?: Partial<Transform>): Quad | undefined {
    if (!selectedClipId) return undefined
    for (const track of doc.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId)
      if (!clip) continue
      if (playheadMicros < clip.startMicros || playheadMicros >= clip.startMicros + clip.durationMicros) return undefined
      const transform = override ? { ...clip.transform, ...override } : clip.transform
      const { width, height } = sourceDimensionsFor(doc, clip, doc.settings.width, doc.settings.height)
      return computeQuadCorners(transform, width, height, doc.settings.width, doc.settings.height)
    }
    return undefined
  }

  // Paused single-frame render whenever the doc, playhead, or selection changes — edits show up live.
  useEffect(() => {
    const transport = transportRef.current
    setSelectionQuad(computeSelectionQuad())
    if (!transport || transport.isPlaying) return
    void transport.renderFrameAt(playheadMicros)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computeSelectionQuad closes over doc/playheadMicros/selectedClipId, already listed below
  }, [doc, playheadMicros, selectedClipId])

  function togglePlay() {
    const transport = transportRef.current
    if (!transport) return
    if (transport.isPlaying) transport.pause()
    else void transport.play(playheadMicros)
  }

  function toggleLoop() {
    const newLooping = !isLooping
    setIsLooping(newLooping)
    transportRef.current?.setLoop(newLooping)
  }

  function toggleMute() {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    transportRef.current?.setMasterVolume(newMuted ? 0 : 1)
  }

  async function toggleFullscreen() {
    const container = previewContainerRef.current
    if (!container) return
    if (!isFullscreen) {
      try {
        await container.requestFullscreen?.()
        setIsFullscreen(true)
      } catch {
        // Fullscreen not supported or denied (e.g., iOS Safari) — add CSS theater mode as fallback
        setIsFullscreen(true)
      }
    } else {
      try {
        await document.exitFullscreen?.()
      } catch {
        // Already exited or not supported
      }
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Space toggles play/pause — a desktop-bonus shortcut (ARCHITECTURE §1).
  // Reads fresh state via getState() rather than closing over `playheadMicros`
  // so this listener doesn't need to be torn down and re-added every tick.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const target = e.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      e.preventDefault()
      const transport = transportRef.current
      if (!transport) return
      if (transport.isPlaying) transport.pause()
      else void transport.play(useEditorStore.getState().playheadMicros)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function toCanvasPoint(clientX: number, clientY: number): Point {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * doc.settings.width,
      y: ((clientY - rect.top) / rect.height) * doc.settings.height,
    }
  }

  function findClipTransform(clipId: string): Transform | undefined {
    for (const track of doc.tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) return clip.transform
    }
    return undefined
  }

  function applyOverride(gesture: ManipulateGesture) {
    transportRef.current?.setTransformOverride(gesture.clipId, gesture.lastPatch)
    void transportRef.current?.renderFrameAt(playheadMicros)
    setSelectionQuad(computeSelectionQuad(gesture.lastPatch))
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const point = toCanvasPoint(e.clientX, e.clientY)
    const existing = gestureRef.current

    if (existing) {
      // A second pointer joined an in-progress manipulation — start pinch tracking.
      existing.pointers.set(e.pointerId, point)
      canvasRef.current?.setPointerCapture(e.pointerId)
      if (existing.pointers.size === 2) {
        existing.pinchStart = pinchState(existing.pointers)
      }
      return
    }

    const hit = hitTestClip(doc, playheadMicros, point, doc.settings.width, doc.settings.height)
    if (!hit) {
      selectClip(null)
      return
    }
    selectClip(hit.id)
    const origin = findClipTransform(hit.id)
    if (!origin) return

    const gesture: ManipulateGesture = {
      clipId: hit.id,
      origin,
      downPoint: point,
      pointers: new Map([[e.pointerId, point]]),
      moved: false,
      lastPatch: {},
    }
    gestureRef.current = gesture
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const gesture = gestureRef.current
    if (!gesture || !gesture.pointers.has(e.pointerId)) return
    const point = toCanvasPoint(e.clientX, e.clientY)
    gesture.pointers.set(e.pointerId, point)
    gesture.moved = true

    if (gesture.pointers.size === 2 && gesture.pinchStart) {
      const now = pinchState(gesture.pointers)
      const scale = gesture.origin.scale * (now.distance / gesture.pinchStart.distance)
      const rotation = gesture.origin.rotation + ((now.angle - gesture.pinchStart.angle) * 180) / Math.PI
      gesture.lastPatch = { ...gesture.lastPatch, scale, rotation }
      applyOverride(gesture)
      return
    }

    if (gesture.pointers.size === 1) {
      const dx = point.x - gesture.downPoint.x
      const dy = point.y - gesture.downPoint.y
      gesture.lastPatch = { ...gesture.lastPatch, x: gesture.origin.x + dx, y: gesture.origin.y + dy }
      applyOverride(gesture)
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const gesture = gestureRef.current
    if (!gesture) return
    gesture.pointers.delete(e.pointerId)
    if (gesture.pointers.size > 0) {
      // Pinch collapsing back to a single pointer — keep dragging with that one.
      gesture.pinchStart = undefined
      return
    }
    if (gesture.moved) {
      dispatch(setClipTransform(gesture.clipId, gesture.lastPatch))
    }
    transportRef.current?.setTransformOverride(gesture.clipId, null)
    void transportRef.current?.renderFrameAt(playheadMicros)
    gestureRef.current = null
  }

  const duration = microsToSeconds(projectDurationMicros(doc))
  const current = microsToSeconds(playheadMicros)

  return (
    <div
      ref={previewContainerRef}
      className="flex min-h-0 flex-1 flex-col"
      data-fullscreen={isFullscreen}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 50 } : undefined}
    >
      {/* container-type:size lets the aspect box below contain-fit with pure CSS
          (cqw/cqh). The old `height:100%` + max-w-full approach silently broke
          the aspect ratio whenever width was the binding constraint. */}
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden [container-type:size]">
        <div
          className="bg-black ring-1 ring-white/10"
          style={{
            aspectRatio: `${doc.settings.width} / ${doc.settings.height}`,
            width: `min(100cqw, 100cqh * ${(doc.settings.width / doc.settings.height).toFixed(6)})`,
          }}
        >
          <div className="relative size-full">
            <canvas
              ref={canvasRef}
              data-preview-canvas
              data-selected-clip={selectedClipId ?? ''}
              className="size-full touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {selectionQuad && (
              <svg
                data-selection-overlay
                className="pointer-events-none absolute inset-0 size-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={selectionQuad
                    .map((p) => `${(p.x / doc.settings.width) * 100},${(p.y / doc.settings.height) * 100}`)
                    .join(' ')}
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
            {renderError && (
              <div
                data-render-error
                className="pointer-events-none absolute inset-x-2 bottom-2 rounded bg-destructive/90 px-2 py-1 text-[0.6875rem] text-destructive-foreground"
              >
                {renderError}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 bg-black/60 px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          data-action={isPlaying ? 'pause' : 'play'}
          onClick={togglePlay}
        >
          {isPlaying ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Loop playback"
          data-action="toggle-loop"
          data-active={isLooping}
          onClick={toggleLoop}
          className={isLooping ? 'text-primary' : ''}
        >
          <RotateCcwIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          data-action="toggle-mute"
          data-muted={isMuted}
          onClick={toggleMute}
          className={isMuted ? 'text-muted-foreground' : ''}
        >
          {isMuted ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
        </Button>
        <span className="text-[0.6875rem] text-white/70 tabular-nums">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <div className="ml-auto" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fullscreen"
          data-action="toggle-fullscreen"
          onClick={toggleFullscreen}
        >
          <MaximizeIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function pinchState(pointers: Map<number, ActivePointer>): { distance: number; angle: number } {
  const [a, b] = [...pointers.values()]
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  }
}
