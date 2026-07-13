import { memo } from 'react'
import type { PositionedClip } from '#/editor/doc/selectors/layout'

interface ClipViewProps {
  pclip: PositionedClip
  isSelected: boolean
  onClick: () => void
  onTrimStart: (deltaX: number) => void
  onTrimEnd: (deltaX: number) => void
}

/**
 * A single clip in the timeline.
 * Renders:
 * - Clip body with color-coded track type (video=black, audio=cyan, etc.)
 * - Clip duration / label
 * - Trim handles (left/right edges)
 * - Selection highlight if selected
 */
export const ClipView = memo(function ClipView({
  pclip,
  isSelected,
  onClick,
  onTrimStart,
  onTrimEnd,
}: ClipViewProps) {
  const { clip } = pclip
  const minWidth = 40 // Don't render clips narrower than this

  if (pclip.widthPx < minWidth) {
    // Render a narrow clip indicator
    return (
      <div
        className="absolute h-full cursor-pointer"
        style={{
          left: `${pclip.startPx}px`,
          width: `${pclip.widthPx}px`,
          top: 0,
        }}
        onClick={onClick}
      >
        <div
          className={`h-full w-full rounded-sm border ${
            isSelected
              ? 'border-white/80 bg-white/20'
              : 'border-white/20 bg-white/5'
          }`}
        />
      </div>
    )
  }

  const trackKind = pclip.track.kind
  const bgColor = getTrackColor(trackKind)

  return (
    <div
      className="absolute cursor-pointer group"
      style={{
        left: `${pclip.startPx}px`,
        width: `${pclip.widthPx}px`,
        top: 0,
        height: '100%',
      }}
      onClick={onClick}
    >
      {/* Trim handle: left edge */}
      <div
        className="absolute top-0 bottom-0 left-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 bg-white/20 hover:bg-white/40 transition-opacity"
        onMouseDown={(e) => {
          e.stopPropagation()
          startTrimHandle(e, onTrimStart)
        }}
        onTouchStart={(e) => {
          e.stopPropagation()
          startTrimHandle(e, onTrimStart)
        }}
      />

      {/* Clip body */}
      <div
        className={`h-full rounded-md overflow-hidden border-2 transition-colors ${
          isSelected
            ? 'border-white/80 shadow-lg shadow-white/20'
            : 'border-white/40'
        } ${bgColor}`}
      >
        {/* Clip content: label + waveform placeholder */}
        <div className="h-full flex flex-col items-center justify-center text-white/60 text-xs px-2 py-1">
          {clip.text?.content || clip.assetId || 'Clip'}
        </div>
      </div>

      {/* Trim handle: right edge */}
      <div
        className="absolute top-0 bottom-0 right-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 bg-white/20 hover:bg-white/40 transition-opacity"
        onMouseDown={(e) => {
          e.stopPropagation()
          startTrimHandle(e, onTrimEnd)
        }}
        onTouchStart={(e) => {
          e.stopPropagation()
          startTrimHandle(e, onTrimEnd)
        }}
      />

      {/* Speed indicator if not 1x */}
      {clip.speed !== 1 && (
        <div className="absolute top-1 right-1 bg-white/30 text-white text-xs px-1 rounded">
          {clip.speed.toFixed(1)}x
        </div>
      )}
    </div>
  )
})

function getTrackColor(kind: string): string {
  switch (kind) {
    case 'video':
      return 'bg-slate-900'
    case 'audio':
      return 'bg-cyan-900'
    case 'text':
      return 'bg-amber-900'
    case 'overlay':
      return 'bg-violet-900'
    default:
      return 'bg-slate-900'
  }
}

function startTrimHandle(
  e: React.MouseEvent | React.TouchEvent,
  callback: (deltaX: number) => void
) {
  const startX = 'touches' in e ? e.touches[0].clientX : e.clientX
  let lastX = startX

  function handleMove(moveEvent: MouseEvent | TouchEvent) {
    const currentX = 'touches' in moveEvent ? (moveEvent as TouchEvent).touches[0].clientX : (moveEvent as MouseEvent).clientX
    const deltaX = currentX - lastX
    lastX = currentX
    callback(deltaX)
  }

  function handleEnd() {
    document.removeEventListener('mousemove', handleMove)
    document.removeEventListener('touchmove', handleMove)
    document.removeEventListener('mouseup', handleEnd)
    document.removeEventListener('touchend', handleEnd)
  }

  document.addEventListener('mousemove', handleMove)
  document.addEventListener('touchmove', handleMove)
  document.addEventListener('mouseup', handleEnd)
  document.addEventListener('touchend', handleEnd)
}
