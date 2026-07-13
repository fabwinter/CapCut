import { z } from 'zod'
import type { Micros } from './time'

export const CURRENT_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const AssetKindSchema = z.enum(['video', 'image', 'audio'])
export type AssetKind = z.infer<typeof AssetKindSchema>

export const AssetStatusSchema = z.enum(['importing', 'processing', 'ready', 'error'])
export type AssetStatus = z.infer<typeof AssetStatusSchema>

export const AssetProxySchema = z.object({
  opfsPath: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type AssetProxy = z.infer<typeof AssetProxySchema>

export const AssetRefSchema = z.object({
  id: z.string(),
  kind: AssetKindSchema,
  opfsPath: z.string(),
  originalName: z.string(),
  status: AssetStatusSchema,
  errorMessage: z.string().optional(),
  durationMicros: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  proxy: AssetProxySchema.optional(),
  thumbnailsPath: z.string().optional(),
  waveformPath: z.string().optional(),
  createdAt: z.number().int(),
})
export type AssetRef = z.infer<typeof AssetRefSchema>

// ---------------------------------------------------------------------------
// Tracks & clips
// ---------------------------------------------------------------------------

export const TrackKindSchema = z.enum(['video', 'overlay', 'text', 'audio'])
export type TrackKind = z.infer<typeof TrackKindSchema>

export const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
})
export type Transform = z.infer<typeof TransformSchema>

export function createDefaultTransform(): Transform {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }
}

export const EffectTypeSchema = z.enum([
  'brightness',
  'contrast',
  'saturation',
  'temperature',
  'vignette',
  'lut',
])
export type EffectType = z.infer<typeof EffectTypeSchema>

export const EffectSchema = z.object({
  id: z.string(),
  type: EffectTypeSchema,
  params: z.record(z.string(), z.number()),
  lutAssetId: z.string().optional(),
})
export type Effect = z.infer<typeof EffectSchema>

export const KeyframablePropertySchema = z.enum(['x', 'y', 'scale', 'rotation', 'opacity', 'volume'])
export type KeyframableProperty = z.infer<typeof KeyframablePropertySchema>

export const EasingSchema = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut'])
export type Easing = z.infer<typeof EasingSchema>

export const KeyframeSchema = z.object({
  id: z.string(),
  property: KeyframablePropertySchema,
  atMicros: z.number().int().nonnegative(),
  value: z.number(),
  easing: EasingSchema,
})
export type Keyframe = z.infer<typeof KeyframeSchema>

export const TextAnimationSchema = z.enum(['none', 'fadeIn', 'slideIn', 'popIn'])
export type TextAnimation = z.infer<typeof TextAnimationSchema>

export const TextAlignSchema = z.enum(['left', 'center', 'right'])
export type TextAlign = z.infer<typeof TextAlignSchema>

export const TextPayloadSchema = z.object({
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().nonnegative(),
  align: TextAlignSchema,
  animationIn: TextAnimationSchema,
  animationOut: TextAnimationSchema,
})
export type TextPayload = z.infer<typeof TextPayloadSchema>

export function createDefaultTextPayload(content: string): TextPayload {
  return {
    content,
    fontFamily: 'Inter Variable',
    fontSize: 48,
    color: '#ffffff',
    strokeWidth: 0,
    align: 'center',
    animationIn: 'none',
    animationOut: 'none',
  }
}

export const TransitionTypeSchema = z.enum(['crossDissolve', 'dipToBlack', 'wipe', 'slide'])
export type TransitionType = z.infer<typeof TransitionTypeSchema>

export const TransitionSchema = z.object({
  type: TransitionTypeSchema,
  durationMicros: z.number().int().positive(),
})
export type Transition = z.infer<typeof TransitionSchema>

export const ClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  assetId: z.string().optional(),
  startMicros: z.number().int().nonnegative(),
  durationMicros: z.number().int().positive(),
  inPointMicros: z.number().int().nonnegative(),
  outPointMicros: z.number().int().nonnegative().optional(),
  speed: z.number().positive(),
  volume: z.number().min(0).max(2),
  muted: z.boolean(),
  fadeInMicros: z.number().int().nonnegative(),
  fadeOutMicros: z.number().int().nonnegative(),
  transform: TransformSchema,
  effects: z.array(EffectSchema),
  keyframes: z.array(KeyframeSchema),
  transitionOut: TransitionSchema.optional(),
  text: TextPayloadSchema.optional(),
})
export type Clip = z.infer<typeof ClipSchema>

export const TrackSchema = z.object({
  id: z.string(),
  kind: TrackKindSchema,
  name: z.string(),
  muted: z.boolean(),
  locked: z.boolean(),
  clips: z.array(ClipSchema),
})
export type Track = z.infer<typeof TrackSchema>

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectSettingsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  background: z.string(),
})
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>

export const ProjectDocSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  name: z.string().min(1).max(200),
  createdAt: z.number().int(),
  modifiedAt: z.number().int(),
  settings: ProjectSettingsSchema,
  assets: z.array(AssetRefSchema),
  tracks: z.array(TrackSchema),
})
export type ProjectDoc = z.infer<typeof ProjectDocSchema>

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createId(): string {
  return crypto.randomUUID()
}

export function createDefaultProjectSettings(): ProjectSettings {
  return { width: 1080, height: 1920, fps: 30, background: '#000000' }
}

export function createEmptyProjectDoc(name: string, settingsOverride?: Partial<ProjectSettings>): ProjectDoc {
  const now = Date.now()
  return {
    id: createId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    createdAt: now,
    modifiedAt: now,
    settings: { ...createDefaultProjectSettings(), ...settingsOverride },
    assets: [],
    tracks: [
      { id: createId(), kind: 'video', name: 'Video 1', muted: false, locked: false, clips: [] },
      { id: createId(), kind: 'audio', name: 'Audio 1', muted: false, locked: false, clips: [] },
    ],
  }
}

export function projectDurationMicros(doc: ProjectDoc): Micros {
  let max = 0
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const end = clip.startMicros + clip.durationMicros
      if (end > max) max = end
    }
  }
  return max
}
