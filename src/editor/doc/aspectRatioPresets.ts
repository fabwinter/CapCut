/** Common canvas presets, shared by the project-creation dialog and the project settings dialog. */
export interface AspectRatioPreset {
  label: string
  width: number
  height: number
}

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { label: '9:16', width: 1080, height: 1920 },
  { label: '16:9', width: 1920, height: 1080 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '4:5', width: 1080, height: 1350 },
  { label: '3:4', width: 1080, height: 1440 },
]

export const FPS_PRESETS = [24, 25, 30, 50, 60] as const

/** Matches a preset by exact width/height, if any — used to highlight the active preset in the UI. */
export function matchAspectRatioPreset(width: number, height: number): AspectRatioPreset | undefined {
  return ASPECT_RATIO_PRESETS.find((p) => p.width === width && p.height === height)
}
