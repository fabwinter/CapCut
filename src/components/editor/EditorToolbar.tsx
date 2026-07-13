import { useCallback, useState } from 'react'
import { ChevronLeftIcon, TrashIcon, CopyIcon, ScissorsIcon } from 'lucide-react'
import type { ProjectDoc } from '#/editor/doc/schema'
import type { Clip } from '#/editor/doc/schema'
import { microsToSeconds } from '#/editor/doc/time'
import { Button } from '#/components/ui/button'
import { useEditorStore } from '#/editor/state/editorStore'
import {
  setClipSpeed,
  setClipVolume,
  setClipMuted,
  setClipFadeIn,
  setClipFadeOut,
  setProjectAspect,
  extractAudioFromClip,
} from '#/editor/doc/commands/editing'
import { deleteClip, duplicateClip, splitClip } from '#/editor/doc/commands/clips'

type ToolbarPage = 'main' | 'speed' | 'volume' | 'fade' | 'aspect' | 'extract'

interface EditorToolbarProps {
  doc: ProjectDoc
  selectedClipId: string | null
}

/**
 * Contextual toolbar that shows different inspector pages.
 * Pages: Speed, Volume, Fade, Aspect, Extract Audio.
 */
export function EditorToolbar({ doc, selectedClipId }: EditorToolbarProps) {
  const [page, setPage] = useState<ToolbarPage>('main')
  const { dispatch } = useEditorStore()

  const selectedClip = selectedClipId
    ? doc.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === selectedClipId)
    : null

  const fps = doc.settings.fps

  // Quick actions
  const handleDelete = useCallback(() => {
    if (!selectedClipId) return
    dispatch(deleteClip(selectedClipId))
  }, [selectedClipId, dispatch])

  const handleDuplicate = useCallback(() => {
    if (!selectedClipId) return
    dispatch(duplicateClip(selectedClipId, fps))
  }, [selectedClipId, dispatch, fps])

  const handleSplit = useCallback(() => {
    if (!selectedClipId || !selectedClip) return
    // Split at center of clip
    const midpoint = selectedClip.startMicros + selectedClip.durationMicros / 2
    dispatch(splitClip(selectedClipId, midpoint, fps))
  }, [selectedClipId, selectedClip, dispatch, fps])

  if (!selectedClip) {
    return (
      <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
        No clip selected
      </div>
    )
  }

  return (
    <div className="border-t border-border/50 bg-card/40 px-3 py-2">
      {page === 'main' && (
        <MainPage
          clip={selectedClip}
          onSpeedClick={() => setPage('speed')}
          onVolumeClick={() => setPage('volume')}
          onFadeClick={() => setPage('fade')}
          onAspectClick={() => setPage('aspect')}
          onExtractClick={() => setPage('extract')}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onSplit={handleSplit}
        />
      )}

      {page === 'speed' && (
        <SpeedPage
          clip={selectedClip}
          onBack={() => setPage('main')}
          onSpeedChange={(speed) => {
            dispatch(setClipSpeed(selectedClip.id, speed))
          }}
        />
      )}

      {page === 'volume' && (
        <VolumePage
          clip={selectedClip}
          onBack={() => setPage('main')}
          onVolumeChange={(volume) => {
            dispatch(setClipVolume(selectedClip.id, volume))
          }}
          onMutedChange={(muted) => {
            dispatch(setClipMuted(selectedClip.id, muted))
          }}
        />
      )}

      {page === 'fade' && (
        <FadePage
          clip={selectedClip}
          onBack={() => setPage('main')}
          onFadeInChange={(seconds) => {
            dispatch(setClipFadeIn(selectedClip.id, seconds))
          }}
          onFadeOutChange={(seconds) => {
            dispatch(setClipFadeOut(selectedClip.id, seconds))
          }}
        />
      )}

      {page === 'aspect' && (
        <AspectPage
          onBack={() => setPage('main')}
          onAspectChange={(aspect) => {
            dispatch(setProjectAspect(aspect))
          }}
        />
      )}

      {page === 'extract' && (
        <ExtractPage
          onBack={() => setPage('main')}
          onExtract={() => {
            dispatch(extractAudioFromClip(selectedClip.id))
            setPage('main')
          }}
        />
      )}
    </div>
  )
}

function MainPage({
  clip,
  onSpeedClick,
  onVolumeClick,
  onFadeClick,
  onAspectClick,
  onExtractClick,
  onDelete,
  onDuplicate,
  onSplit,
}: {
  clip: Clip
  onSpeedClick: () => void
  onVolumeClick: () => void
  onFadeClick: () => void
  onAspectClick: () => void
  onExtractClick: () => void
  onDelete: () => void
  onDuplicate: () => void
  onSplit: () => void
}) {
  return (
    <div className="space-y-2">
      {/* Clip info */}
      <div className="text-xs text-muted-foreground">
        {clip.assetId && `Clip: ${clip.assetId.slice(0, 8)}`}
      </div>

      {/* Control buttons */}
      <div className="flex gap-1 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={onSpeedClick}
          className="text-xs h-8"
        >
          Speed {clip.speed.toFixed(1)}×
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onVolumeClick}
          className="text-xs h-8"
        >
          Vol {Math.round(clip.volume * 100)}%
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onFadeClick}
          className="text-xs h-8"
        >
          Fade
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onAspectClick}
          className="text-xs h-8"
        >
          Aspect
        </Button>
        {clip.assetId && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExtractClick}
            className="text-xs h-8"
          >
            Extract
          </Button>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onDuplicate}
          aria-label="Duplicate"
          className="h-8 w-8"
        >
          <CopyIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSplit}
          aria-label="Split"
          className="h-8 w-8"
        >
          <ScissorsIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete"
          className="h-8 w-8 text-destructive"
        >
          <TrashIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function SpeedPage({
  clip,
  onBack,
  onSpeedChange,
}: {
  clip: Clip
  onBack: () => void
  onSpeedChange: (speed: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">Speed</span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
          <Button
            key={speed}
            variant={clip.speed === speed ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSpeedChange(speed)}
            className="text-xs h-8"
          >
            {speed}×
          </Button>
        ))}
      </div>

      <input
        type="range"
        min="0.1"
        max="10"
        step="0.1"
        value={clip.speed}
        onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <span className="text-xs text-muted-foreground">
        Duration: {(clip.durationMicros / 1_000_000).toFixed(2)}s
      </span>
    </div>
  )
}

function VolumePage({
  clip,
  onBack,
  onVolumeChange,
  onMutedChange,
}: {
  clip: Clip
  onBack: () => void
  onVolumeChange: (volume: number) => void
  onMutedChange: (muted: boolean) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">Volume</span>
      </div>

      <div className="flex gap-1">
        <Button
          variant={clip.muted ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMutedChange(!clip.muted)}
          className="text-xs h-8"
        >
          {clip.muted ? 'Unmute' : 'Mute'}
        </Button>
      </div>

      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={clip.volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <span className="text-xs text-muted-foreground">
        {Math.round(clip.volume * 100)}%
      </span>
    </div>
  )
}

function FadePage({
  clip,
  onBack,
  onFadeInChange,
  onFadeOutChange,
}: {
  clip: Clip
  onBack: () => void
  onFadeInChange: (seconds: number) => void
  onFadeOutChange: (seconds: number) => void
}) {
  const fadeInSeconds = microsToSeconds(clip.fadeInMicros)
  const fadeOutSeconds = microsToSeconds(clip.fadeOutMicros)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">Fade</span>
      </div>

      <div>
        <label className="text-xs font-medium">Fade In</label>
        <input
          type="range"
          min="0"
          max="3"
          step="0.05"
          value={fadeInSeconds}
          onChange={(e) => onFadeInChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <span className="text-xs text-muted-foreground">
          {fadeInSeconds.toFixed(2)}s
        </span>
      </div>

      <div>
        <label className="text-xs font-medium">Fade Out</label>
        <input
          type="range"
          min="0"
          max="3"
          step="0.05"
          value={fadeOutSeconds}
          onChange={(e) => onFadeOutChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <span className="text-xs text-muted-foreground">
          {fadeOutSeconds.toFixed(2)}s
        </span>
      </div>
    </div>
  )
}

function AspectPage({
  onBack,
  onAspectChange,
}: {
  onBack: () => void
  onAspectChange: (aspect: '9:16' | '16:9' | '1:1' | '4:5') => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">Aspect Ratio</span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {(['9:16', '16:9', '1:1', '4:5'] as const).map((aspect) => (
          <Button
            key={aspect}
            variant="outline"
            size="sm"
            onClick={() => onAspectChange(aspect)}
            className="text-xs h-8"
          >
            {aspect}
          </Button>
        ))}
      </div>
    </div>
  )
}

function ExtractPage({
  onBack,
  onExtract,
}: {
  onBack: () => void
  onExtract: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">Extract Audio</span>
      </div>

      <div className="text-xs text-muted-foreground">
        Extract audio track from this video clip to edit separately.
      </div>

      <Button
        onClick={onExtract}
        className="w-full"
      >
        Extract
      </Button>
    </div>
  )
}
