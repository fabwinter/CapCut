import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { ASPECT_RATIO_PRESETS, FPS_PRESETS, matchAspectRatioPreset } from '#/editor/doc/aspectRatioPresets'
import { setProjectSettings } from '#/editor/doc/commands/project'
import type { Command } from '#/editor/doc/commands/types'
import type { ProjectDoc } from '#/editor/doc/schema'

interface ProjectSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  doc: ProjectDoc
  dispatch: (command: Command) => void
}

/**
 * Canvas dimensions and frame rate, editable any time — not just at project
 * creation or by whatever the first imported video happened to be. Custom
 * width/height stay editable as free-form numbers alongside the presets
 * since not every source matches a standard ratio.
 */
export function ProjectSettingsDialog({ open, onOpenChange, doc, dispatch }: ProjectSettingsDialogProps) {
  const [width, setWidth] = useState(doc.settings.width)
  const [height, setHeight] = useState(doc.settings.height)
  const [fps, setFps] = useState(doc.settings.fps)

  // Re-sync from the doc whenever the dialog opens, so it never shows stale
  // values from a previous open (or from another surface changing settings).
  useEffect(() => {
    if (!open) return
    setWidth(doc.settings.width)
    setHeight(doc.settings.height)
    setFps(doc.settings.fps)
  }, [open, doc.settings.width, doc.settings.height, doc.settings.fps])

  const activePreset = matchAspectRatioPreset(width, height)

  function save() {
    const cleanWidth = Math.max(2, Math.round(width))
    const cleanHeight = Math.max(2, Math.round(height))
    const cleanFps = Math.max(1, fps)
    dispatch(setProjectSettings({ width: cleanWidth, height: cleanHeight, fps: cleanFps }))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-project-settings-dialog>
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>Canvas aspect ratio and frame rate — affects preview and export alike.</DialogDescription>
        </DialogHeader>

        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">Aspect ratio</p>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_RATIO_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant={activePreset?.label === preset.label ? 'default' : 'outline'}
                data-aspect-ratio={preset.label}
                onClick={() => {
                  setWidth(preset.width)
                  setHeight(preset.height)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              min={2}
              data-field="width"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-muted-foreground text-xs">×</span>
            <Input
              type="number"
              min={2}
              data-field="height"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-muted-foreground text-xs">px</span>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">Frame rate</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FPS_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={fps === preset ? 'default' : 'outline'}
                data-fps={preset}
                onClick={() => setFps(preset)}
              >
                {preset}
              </Button>
            ))}
            <Input
              type="number"
              min={1}
              max={120}
              data-field="fps"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="w-16"
            />
            <span className="text-muted-foreground text-xs">fps</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-10" data-action="save-project-settings" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
