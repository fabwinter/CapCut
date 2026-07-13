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
import { setClipText, setClipEffect, removeClipEffect, setClipTransition, removeClipTransition } from '#/editor/doc/commands/styling'
import { deleteClip, duplicateClip, splitClip } from '#/editor/doc/commands/clips'

type ToolbarPage = 'main' | 'speed' | 'volume' | 'fade' | 'aspect' | 'extract' | 'text' | 'effects' | 'transition'

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
          onTextClick={() => setPage('text')}
          onEffectsClick={() => setPage('effects')}
          onTransitionClick={() => setPage('transition')}
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

      {page === 'text' && selectedClip.text && (
        <TextPage
          clip={selectedClip}
          onBack={() => setPage('main')}
          onTextChange={(text) => {
            dispatch(setClipText(selectedClip.id, text))
          }}
        />
      )}

      {page === 'effects' && (
        <EffectsPage
          clip={selectedClip}
          onBack={() => setPage('main')}
          onEffectChange={(effectType, params) => {
            dispatch(setClipEffect(selectedClip.id, effectType, params))
          }}
          onEffectRemove={(effectType) => {
            dispatch(removeClipEffect(selectedClip.id, effectType))
          }}
        />
      )}

      {page === 'transition' && (
        <TransitionPage
          clip={selectedClip}
          onBack={() => setPage('main')}
          onTransitionChange={(type, duration) => {
            dispatch(setClipTransition(selectedClip.id, type, duration))
          }}
          onTransitionRemove={() => {
            dispatch(removeClipTransition(selectedClip.id))
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
  onTextClick,
  onEffectsClick,
  onTransitionClick,
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
  onTextClick: () => void
  onEffectsClick: () => void
  onTransitionClick: () => void
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
        {clip.text && (
          <Button
            variant="outline"
            size="sm"
            onClick={onTextClick}
            className="text-xs h-8"
          >
            Text
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onEffectsClick}
          className="text-xs h-8"
        >
          Effects {clip.effects.length > 0 && `(${clip.effects.length})`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onTransitionClick}
          className="text-xs h-8"
        >
          Transition {clip.transitionOut && '✓'}
        </Button>
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

function TextPage({
  clip,
  onBack,
  onTextChange,
}: {
  clip: Clip
  onBack: () => void
  onTextChange: (text: any) => void
}) {
  const text = clip.text
  if (!text) return null

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
        <span className="text-sm font-medium">Text</span>
      </div>

      <div>
        <label className="text-xs font-medium">Font Size</label>
        <input
          type="range"
          min="8"
          max="120"
          step="1"
          value={text.fontSize}
          onChange={(e) => onTextChange({ fontSize: parseInt(e.target.value) })}
          className="w-full"
        />
        <span className="text-xs text-muted-foreground">
          {text.fontSize}px
        </span>
      </div>

      <div>
        <label className="text-xs font-medium">Color</label>
        <input
          type="color"
          value={text.color}
          onChange={(e) => onTextChange({ color: e.target.value })}
          className="w-full h-8 rounded cursor-pointer"
        />
      </div>

      <div>
        <label className="text-xs font-medium">Align</label>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <Button
              key={align}
              variant={text.align === align ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTextChange({ align })}
              className="text-xs h-8 flex-1"
            >
              {align.charAt(0).toUpperCase() + align.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium">Animation In</label>
        <div className="flex gap-1 flex-wrap">
          {(['none', 'fadeIn', 'slideIn', 'popIn'] as const).map((anim) => (
            <Button
              key={anim}
              variant={text.animationIn === anim ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTextChange({ animationIn: anim })}
              className="text-xs h-8"
            >
              {anim}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function EffectsPage({
  clip,
  onBack,
  onEffectChange,
  onEffectRemove,
}: {
  clip: Clip
  onBack: () => void
  onEffectChange: (type: any, params: Record<string, number>) => void
  onEffectRemove: (type: any) => void
}) {
  const effectTypes: Array<'brightness' | 'contrast' | 'saturation' | 'temperature' | 'vignette' | 'lut'> = [
    'brightness',
    'contrast',
    'saturation',
    'temperature',
    'vignette',
  ]

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
        <span className="text-sm font-medium">Effects</span>
      </div>

      <div className="space-y-2">
        {effectTypes.map((effectType) => {
          const effect = clip.effects.find((e) => e.type === effectType)
          const isActive = !!effect

          return (
            <div key={effectType}>
              <Button
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (isActive) {
                    onEffectRemove(effectType)
                  } else {
                    onEffectChange(effectType, { value: 1 })
                  }
                }}
                className="text-xs h-8 w-full"
              >
                {effectType.charAt(0).toUpperCase() + effectType.slice(1)} {isActive && '✓'}
              </Button>
              {isActive && effect && (
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={effect.params.value ?? 1}
                  onChange={(e) =>
                    onEffectChange(effectType, { value: parseFloat(e.target.value) })
                  }
                  className="w-full mt-1"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TransitionPage({
  clip,
  onBack,
  onTransitionChange,
  onTransitionRemove,
}: {
  clip: Clip
  onBack: () => void
  onTransitionChange: (type: any, duration: number) => void
  onTransitionRemove: () => void
}) {
  const transitionTypes: Array<'crossDissolve' | 'dipToBlack' | 'wipe' | 'slide'> = [
    'crossDissolve',
    'dipToBlack',
    'wipe',
    'slide',
  ]

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
        <span className="text-sm font-medium">Transition</span>
      </div>

      <div>
        <label className="text-xs font-medium">Type</label>
        <div className="flex gap-1 flex-wrap">
          {transitionTypes.map((type) => (
            <Button
              key={type}
              variant={clip.transitionOut?.type === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTransitionChange(type, clip.transitionOut?.durationMicros ?? 300_000)}
              className="text-xs h-8"
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      {clip.transitionOut && (
        <div>
          <label className="text-xs font-medium">Duration</label>
          <input
            type="range"
            min="0"
            max="1000000"
            step="50000"
            value={clip.transitionOut.durationMicros}
            onChange={(e) =>
              onTransitionChange(clip.transitionOut!.type, parseInt(e.target.value))
            }
            className="w-full"
          />
          <span className="text-xs text-muted-foreground">
            {(clip.transitionOut.durationMicros / 1_000_000).toFixed(2)}s
          </span>
        </div>
      )}

      {clip.transitionOut && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onTransitionRemove}
          className="w-full text-xs h-8"
        >
          Remove Transition
        </Button>
      )}
    </div>
  )
}
