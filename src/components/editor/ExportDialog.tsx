import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Progress } from '#/components/ui/progress'
import type { ProjectDoc } from '#/editor/doc/schema'
import { EXPORT_PRESETS, exportProject, type ExportPreset, type ExportProgress } from '#/editor/export/exporter'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  doc: ProjectDoc
}

type ExportState = 'idle' | 'exporting' | 'done' | 'error' | 'cancelled'

export function ExportDialog({ open, onOpenChange, projectId, projectName, doc }: ExportDialogProps) {
  const [preset, setPreset] = useState<ExportPreset>(EXPORT_PRESETS[EXPORT_PRESETS.length - 1])
  const [state, setState] = useState<ExportState>('idle')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
    setState('idle')
    setProgress(null)
    setError(null)
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [open])

  async function startExport() {
    setState('exporting')
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await exportProject({
        projectId,
        doc,
        preset,
        onProgress: setProgress,
        signal: controller.signal,
      })
      const url = URL.createObjectURL(result.blob)
      setResultUrl(url)
      setState('done')

      const file = new File([result.blob], `${projectName}.mp4`, { type: 'video/mp4' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: projectName })
        } catch {
          // User dismissed the share sheet, or it failed — the download button stays available as a fallback.
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'ExportCancelledError') {
        setState('cancelled')
      } else {
        setState('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const percent = progress ? Math.round((progress.framesEncoded / progress.totalFrames) * 100) : 0
  const etaSeconds =
    progress && progress.fps > 0 ? Math.max(0, (progress.totalFrames - progress.framesEncoded) / progress.fps) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-export-dialog>
        <DialogHeader>
          <DialogTitle>Export video</DialogTitle>
          <DialogDescription>Renders an MP4 you can save or share.</DialogDescription>
        </DialogHeader>

        {state === 'idle' && (
          <div className="flex gap-2">
            {EXPORT_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant={preset.label === p.label ? 'default' : 'outline'}
                data-preset={p.label}
                onClick={() => setPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}

        {state === 'exporting' && (
          <div className="flex flex-col gap-2" data-export-state="exporting">
            <Progress value={percent} />
            <p className="text-muted-foreground text-xs">
              {progress?.framesEncoded ?? 0} / {progress?.totalFrames ?? 0} frames
              {etaSeconds !== undefined ? ` — ~${Math.ceil(etaSeconds)}s left` : null}
            </p>
          </div>
        )}

        {state === 'done' && resultUrl && (
          <div className="flex flex-col gap-2" data-export-state="done">
            <p className="text-sm">Export complete.</p>
            <a href={resultUrl} download={`${projectName}.mp4`} data-export-download>
              <Button className="w-full">Download MP4</Button>
            </a>
          </div>
        )}

        {state === 'error' && (
          <p className="text-destructive text-xs" data-export-state="error">
            {error}
          </p>
        )}

        {state === 'cancelled' && (
          <p className="text-muted-foreground text-xs" data-export-state="cancelled">
            Export cancelled.
          </p>
        )}

        <DialogFooter>
          {state === 'idle' && (
            <Button data-action="start-export" onClick={startExport}>
              Export
            </Button>
          )}
          {state === 'exporting' && (
            <Button variant="outline" data-action="cancel-export" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          )}
          {(state === 'done' || state === 'error' || state === 'cancelled') && (
            <Button variant="outline" data-action="close-export" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
