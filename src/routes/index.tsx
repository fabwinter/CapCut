import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { DownloadIcon, FilmIcon, LoaderCircleIcon, MoreVerticalIcon, PlusIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { StorageMeter } from '#/components/StorageMeter'
import { ASPECT_RATIO_PRESETS } from '#/editor/doc/aspectRatioPresets'
import { projectDurationMicros, type ProjectDoc } from '#/editor/doc/schema'
import { microsToSeconds } from '#/editor/doc/time'
import { exportProjectBackup, restoreProjectBackup } from '#/storage/backup'
import { useProjects } from '#/storage/useProjects'

export const Route = createFileRoute('/')({ component: Gallery })

function formatDuration(micros: number): string {
  const totalSeconds = Math.floor(microsToSeconds(micros))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function Gallery() {
  const navigate = useNavigate()
  const { projects, isLoading, createProject, renameProject, duplicateProject, removeProject, refresh } =
    useProjects()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  // undefined = "Auto" — the project takes its dimensions/fps from the first video imported (see MediaLibrary's auto-detect), rather than a fixed preset.
  const [newAspectRatio, setNewAspectRatio] = useState<(typeof ASPECT_RATIO_PRESETS)[number] | undefined>(undefined)
  const [renameTarget, setRenameTarget] = useState<ProjectDoc | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectDoc | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  async function handleBackup(project: ProjectDoc) {
    const blob = await exportProjectBackup(project.id, project)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}.ccproj`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleRestoreFile(file: File) {
    setRestoring(true)
    setRestoreError(null)
    try {
      const doc = await restoreProjectBackup(file)
      await refresh()
      navigate({ to: '/edit/$projectId', params: { projectId: doc.id } })
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoring(false)
    }
  }

  async function handleCreate() {
    const name = newName.trim() || 'Untitled Project'
    setBusy(true)
    const doc = await createProject(
      name,
      newAspectRatio ? { width: newAspectRatio.width, height: newAspectRatio.height } : undefined,
    )
    setBusy(false)
    setCreateOpen(false)
    setNewName('')
    setNewAspectRatio(undefined)
    navigate({ to: '/edit/$projectId', params: { projectId: doc.id } })
  }

  async function handleRenameConfirm() {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (name) await renameProject(renameTarget.id, name)
    setRenameTarget(null)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    await removeProject(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-6 py-8 [padding-top:calc(env(safe-area-inset-top)+2rem)]">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">CapCut for iPad</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-11 gap-2 px-4 text-sm"
            data-action="restore-backup"
            disabled={restoring}
            onClick={() => restoreInputRef.current?.click()}
          >
            {restoring ? <LoaderCircleIcon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            {restoring ? 'Restoring…' : 'Restore Backup'}
          </Button>
          <input
            ref={restoreInputRef}
            type="file"
            data-restore-backup-input
            accept=".ccproj,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleRestoreFile(file)
            }}
          />
          <Button size="lg" className="h-11 gap-2 px-4 text-sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New Project
          </Button>
        </div>
      </header>

      {restoreError && (
        <p data-restore-error className="border-destructive/40 bg-destructive/10 text-destructive mb-6 rounded-lg border px-3 py-2 text-xs">
          Restore failed: {restoreError}
        </p>
      )}

      <StorageMeter />

      {isLoading ? (
        <div className="text-muted-foreground py-24 text-center text-sm">Loading projects…</div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group relative cursor-pointer gap-0 py-0 transition hover:ring-foreground/20"
              onClick={() =>
                navigate({ to: '/edit/$projectId', params: { projectId: project.id } })
              }
            >
              <div className="bg-muted relative flex aspect-video items-center justify-center">
                <FilmIcon className="text-muted-foreground/40 size-8" />
                <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[0.6875rem] text-white">
                  {formatDuration(projectDurationMicros(project))}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDistanceToNow(project.modifiedAt, { addSuffix: true })}
                  </p>
                </div>
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- swallow taps so they don't bubble to the card's navigate-to-editor handler */}
                <div className="-mr-1 -mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Actions for ${project.name}`}
                        />
                      }
                    >
                      <MoreVerticalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget(project)
                          setRenameValue(project.name)
                        }}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateProject(project.id)}>
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem data-action="backup-project" onClick={() => handleBackup(project)}>
                        <DownloadIcon className="size-3.5" />
                        Backup
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget(project)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <FilmIcon className="text-muted-foreground/30 size-12" />
          <p className="text-muted-foreground text-sm">No projects yet</p>
          <Button size="lg" className="h-11 gap-2 px-4 text-sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Create your first project
          </Button>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Give your project a name.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Untitled Project"
            className="h-11 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">Aspect ratio</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={!newAspectRatio ? 'default' : 'outline'}
                data-aspect-ratio="auto"
                onClick={() => setNewAspectRatio(undefined)}
              >
                Auto (from video)
              </Button>
              {ASPECT_RATIO_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={newAspectRatio?.label === preset.label ? 'default' : 'outline'}
                  data-aspect-ratio={preset.label}
                  onClick={() => setNewAspectRatio(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button className="h-10" disabled={busy} onClick={handleCreate}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="h-11 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
          />
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button className="h-10" onClick={handleRenameConfirm}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all its media. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
