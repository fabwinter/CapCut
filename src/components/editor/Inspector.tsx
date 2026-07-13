import { RotateCwIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '#/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '#/components/ui/drawer'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Slider } from '#/components/ui/slider'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import { useIsMobile } from '#/hooks/use-mobile'
import { setClipFades, setClipMuted, setClipSpeed, setClipVolume } from '#/editor/doc/commands/clipProperties'
import { addKeyframe, deleteKeyframe } from '#/editor/doc/commands/keyframes'
import { setAdjustment, setLut } from '#/editor/doc/commands/effects'
import { setClipText } from '#/editor/doc/commands/text'
import { setTransitionOut } from '#/editor/doc/commands/transitions'
import { setClipTransform } from '#/editor/doc/commands/transform'
import { BUILTIN_LUTS } from '#/editor/playback/compositor/lutStore'
import type { Clip, EffectType, KeyframableProperty, ProjectDoc, TextAlign, TextAnimation, TransitionType } from '#/editor/doc/schema'
import { findAdjacentNextClip } from '#/editor/doc/selectors/transitions'
import { microsToSeconds, secondsToMicros } from '#/editor/doc/time'
import { useEditorStore } from '#/editor/state/editorStore'

const TRANSITION_LABELS: Record<TransitionType, string> = {
  crossDissolve: 'Cross',
  dipToBlack: 'Black',
  wipe: 'Wipe',
  slide: 'Slide',
}
const TRANSITION_TYPES = Object.keys(TRANSITION_LABELS) as TransitionType[]

const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right']
const TEXT_ANIMATIONS: TextAnimation[] = ['none', 'fadeIn', 'slideIn', 'popIn']

const ADJUSTMENTS: { type: EffectType; label: string; min: number; max: number; neutral: number; step: number }[] = [
  { type: 'brightness', label: 'Brightness', min: -1, max: 1, neutral: 0, step: 0.02 },
  { type: 'contrast', label: 'Contrast', min: 0, max: 2, neutral: 1, step: 0.02 },
  { type: 'saturation', label: 'Saturation', min: 0, max: 2, neutral: 1, step: 0.02 },
  { type: 'temperature', label: 'Temperature', min: -1, max: 1, neutral: 0, step: 0.02 },
  { type: 'vignette', label: 'Vignette', min: 0, max: 1, neutral: 0, step: 0.02 },
]

const KEYFRAME_PROPERTIES: Exclude<KeyframableProperty, 'volume'>[] = ['x', 'y', 'scale', 'rotation', 'opacity']

function findClip(doc: ProjectDoc, clipId: string): Clip | undefined {
  for (const track of doc.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

export function Inspector() {
  const doc = useEditorStore((s) => s.doc)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const playheadMicros = useEditorStore((s) => s.playheadMicros)
  const dispatch = useEditorStore((s) => s.dispatch)
  const selectClip = useEditorStore((s) => s.selectClip)
  const isMobile = useIsMobile()

  const clip = useMemo(() => (doc && selectedClipId ? findClip(doc, selectedClipId) : undefined), [doc, selectedClipId])

  if (!doc || !clip) {
    // On mobile the inspector is a bottom sheet that only appears once a
    // clip is selected — there's no room for a permanent placeholder panel.
    if (isMobile) return null
    return (
      <aside data-inspector className="border-border bg-card/40 flex w-72 shrink-0 items-center justify-center border-l p-4">
        <p className="text-muted-foreground text-center text-xs">Select a clip to edit its properties.</p>
      </aside>
    )
  }

  const nextClip = findAdjacentNextClip(doc, clip)
  const clipLocalPlayhead = Math.max(0, Math.min(clip.durationMicros, playheadMicros - clip.startMicros))
  const lutEffect = clip.effects.find((e) => e.type === 'lut')

  const sections = (
    <>
      {clip.text && (
        <Section title="Text">
          <Textarea
            data-field="text-content"
            value={clip.text.content}
            placeholder="Enter text"
            onChange={(e) => dispatch(setClipText(clip.id, { content: e.target.value }))}
          />
          <SliderRow
            data-field="text-font-size"
            label={`${Math.round(clip.text.fontSize)}px`}
            value={clip.text.fontSize}
            min={12}
            max={200}
            step={1}
            onCommit={(v) => dispatch(setClipText(clip.id, { fontSize: v }))}
          />
          <label className="flex items-center justify-between pt-1 text-xs">
            <span className="text-muted-foreground">Color</span>
            <input
              type="color"
              data-field="text-color"
              value={clip.text.color}
              onChange={(e) => dispatch(setClipText(clip.id, { color: e.target.value }))}
              className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent"
            />
          </label>
          <div className="flex gap-1">
            {TEXT_ALIGNS.map((align) => (
              <Button
                key={align}
                size="xs"
                variant={clip.text!.align === align ? 'default' : 'outline'}
                data-field={`text-align-${align}`}
                onClick={() => dispatch(setClipText(clip.id, { align }))}
              >
                {align[0].toUpperCase() + align.slice(1)}
              </Button>
            ))}
          </div>
          <label className="flex items-center justify-between pt-1 text-xs">
            <span className="text-muted-foreground">Animate in</span>
            <NativeSelect
              data-field="text-animation-in"
              size="sm"
              value={clip.text.animationIn}
              onChange={(e) => dispatch(setClipText(clip.id, { animationIn: e.target.value as TextAnimation }))}
            >
              {TEXT_ANIMATIONS.map((a) => (
                <NativeSelectOption key={a} value={a}>
                  {a}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center justify-between pt-1 text-xs">
            <span className="text-muted-foreground">Animate out</span>
            <NativeSelect
              data-field="text-animation-out"
              size="sm"
              value={clip.text.animationOut}
              onChange={(e) => dispatch(setClipText(clip.id, { animationOut: e.target.value as TextAnimation }))}
            >
              {TEXT_ANIMATIONS.map((a) => (
                <NativeSelectOption key={a} value={a}>
                  {a}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </Section>
      )}

      {!clip.text && (
        <Section title="Speed">
          <SliderRow
            data-field="speed"
            label={`${clip.speed.toFixed(1)}x`}
            value={clip.speed}
            min={0.1}
            max={4}
            step={0.1}
            onCommit={(v) => dispatch(setClipSpeed(clip.id, v))}
          />
        </Section>
      )}

      {!clip.text && (
        <Section title="Volume">
          <SliderRow
            data-field="volume"
            label={`${Math.round(clip.volume * 100)}%`}
            value={clip.volume}
            min={0}
            max={2}
            step={0.05}
            onCommit={(v) => dispatch(setClipVolume(clip.id, v))}
          />
          <label className="flex items-center justify-between pt-1 text-xs">
            <span className="text-muted-foreground">Mute</span>
            <Switch
              data-field="mute"
              checked={clip.muted}
              onCheckedChange={(checked) => dispatch(setClipMuted(clip.id, checked))}
            />
          </label>
          <Button
            size="xs"
            variant="outline"
            className="mt-1"
            data-field="add-keyframe-volume"
            onClick={() => dispatch(addKeyframe(clip.id, 'volume', clipLocalPlayhead, clip.volume))}
          >
            ◇ Add volume keyframe at playhead
          </Button>
        </Section>
      )}

      {!clip.text && (
        <Section title="Fade">
          <SliderRow
            data-field="fade-in"
            label={`In ${microsToSeconds(clip.fadeInMicros).toFixed(1)}s`}
            value={clip.fadeInMicros}
            min={0}
            max={clip.durationMicros}
            step={100_000}
            onCommit={(v) => dispatch(setClipFades(clip.id, { fadeInMicros: v }))}
          />
          <SliderRow
            data-field="fade-out"
            label={`Out ${microsToSeconds(clip.fadeOutMicros).toFixed(1)}s`}
            value={clip.fadeOutMicros}
            min={0}
            max={clip.durationMicros}
            step={100_000}
            onCommit={(v) => dispatch(setClipFades(clip.id, { fadeOutMicros: v }))}
          />
        </Section>
      )}

      {!clip.text && <Section title="Rotate">
        <div className="flex items-center justify-between gap-2">
          <span data-field="rotation-degrees" className="text-muted-foreground text-[0.6875rem]">
            {(((clip.transform.rotation % 360) + 360) % 360).toFixed(0)}°
          </span>
          <Button
            size="xs"
            variant="outline"
            data-field="rotate-90"
            onClick={() => dispatch(setClipTransform(clip.id, { rotation: clip.transform.rotation + 90 }))}
          >
            <RotateCwIcon className="mr-1 size-3" /> Rotate 90°
          </Button>
        </div>
        <p className="text-muted-foreground text-[0.6875rem]">
          If a video plays back rotated incorrectly, use this to correct it manually.
        </p>
      </Section>}

      <Section title="Opacity">
        <SliderRow
          data-field="opacity"
          label={`${Math.round(clip.transform.opacity * 100)}%`}
          value={clip.transform.opacity}
          min={0}
          max={1}
          step={0.05}
          onCommit={(v) => dispatch(setClipTransform(clip.id, { opacity: v }))}
        />
      </Section>

      <Section title="Adjust">
        <div className="flex flex-col gap-2">
          {ADJUSTMENTS.map(({ type, label, min, max, neutral, step }) => {
            const current = clip.effects.find((e) => e.type === type)?.params.value ?? neutral
            return (
              <SliderRow
                key={type}
                data-field={type}
                label={label}
                value={current}
                min={min}
                max={max}
                step={step}
                onCommit={(v) => dispatch(setAdjustment(clip.id, type, v, neutral))}
              />
            )
          })}
        </div>
      </Section>

      <Section title="LUT">
        <div className="flex flex-wrap gap-1">
          <Button
            size="xs"
            variant={!lutEffect ? 'default' : 'outline'}
            data-field="lut-none"
            onClick={() => dispatch(setLut(clip.id, null))}
          >
            None
          </Button>
          {BUILTIN_LUTS.map((lutId) => (
            <Button
              key={lutId}
              size="xs"
              variant={lutEffect?.lutAssetId === lutId ? 'default' : 'outline'}
              data-field={`lut-${lutId}`}
              onClick={() => dispatch(setLut(clip.id, lutId, lutEffect?.lutAssetId === lutId ? lutEffect.params.value : 1))}
            >
              {lutId[0].toUpperCase() + lutId.slice(1)}
            </Button>
          ))}
        </div>
        {lutEffect && (
          <SliderRow
            data-field="lut-intensity"
            label={`${Math.round(lutEffect.params.value * 100)}%`}
            value={lutEffect.params.value}
            min={0}
            max={1}
            step={0.05}
            onCommit={(v) => lutEffect.lutAssetId && dispatch(setLut(clip.id, lutEffect.lutAssetId, v))}
          />
        )}
      </Section>

      <Section title="Transition to next clip">
        {nextClip ? (
          <>
            <div className="flex flex-wrap gap-1">
              {TRANSITION_TYPES.map((type) => (
                <Button
                  key={type}
                  size="xs"
                  variant={clip.transitionOut?.type === type ? 'default' : 'outline'}
                  data-field={`transition-${type}`}
                  onClick={() =>
                    dispatch(setTransitionOut(clip.id, { type, durationMicros: clip.transitionOut?.durationMicros ?? 500_000 }))
                  }
                >
                  {TRANSITION_LABELS[type]}
                </Button>
              ))}
              {clip.transitionOut && (
                <Button size="xs" variant="ghost" data-field="transition-none" onClick={() => dispatch(setTransitionOut(clip.id, null))}>
                  None
                </Button>
              )}
            </div>
            {clip.transitionOut && (
              <SliderRow
                data-field="transition-duration"
                label={`${microsToSeconds(clip.transitionOut.durationMicros).toFixed(1)}s`}
                value={clip.transitionOut.durationMicros}
                min={secondsToMicros(0.1)}
                max={Math.max(secondsToMicros(0.2), Math.min(clip.durationMicros, nextClip.durationMicros))}
                step={100_000}
                onCommit={(v) => dispatch(setTransitionOut(clip.id, { type: clip.transitionOut!.type, durationMicros: v }))}
              />
            )}
          </>
        ) : (
          <p data-field="transition-unavailable" className="text-muted-foreground text-[0.6875rem]">
            Move this clip flush against another clip on the same track to add a transition between them.
          </p>
        )}
      </Section>

      <Section title="Keyframes">
        <div className="flex flex-wrap gap-1">
          {KEYFRAME_PROPERTIES.map((prop) => (
            <Button
              key={prop}
              size="xs"
              variant="outline"
              data-field={`add-keyframe-${prop}`}
              onClick={() => dispatch(addKeyframe(clip.id, prop, clipLocalPlayhead, clip.transform[prop]))}
            >
              ◇ {prop}
            </Button>
          ))}
        </div>
        {clip.keyframes.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {[...clip.keyframes]
              .sort((a, b) => a.atMicros - b.atMicros)
              .map((k) => (
                <li key={k.id} className="text-muted-foreground flex items-center justify-between text-[0.6875rem]">
                  <span>
                    {k.property} @ {microsToSeconds(k.atMicros).toFixed(2)}s = {k.value.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete keyframe"
                    onClick={() => dispatch(deleteKeyframe(clip.id, k.id))}
                    className="hover:text-foreground"
                  >
                    <XIcon className="size-3" />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </>
  )

  if (isMobile) {
    return (
      <Drawer
        open
        direction="bottom"
        onOpenChange={(open) => {
          if (!open) selectClip(null)
        }}
      >
        <DrawerContent data-inspector className="max-h-[75vh]">
          <DrawerHeader>
            <DrawerTitle>Clip properties</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-3 pb-4">{sections}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <aside data-inspector className="border-border bg-card/40 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l p-3">
      {sections}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </div>
  )
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (value: number) => void
  'data-field'?: string
}

function SliderRow({ label, value, min, max, step, onCommit, ...rest }: SliderRowProps) {
  return (
    <div className="flex items-center gap-2" {...rest}>
      <Slider
        className="flex-1"
        value={value}
        min={min}
        max={max}
        step={step}
        onValueCommitted={(v) => onCommit(v as number)}
      />
      <span className="text-muted-foreground w-14 shrink-0 text-right text-[0.6875rem] tabular-nums">{label}</span>
    </div>
  )
}
