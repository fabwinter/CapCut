import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { FilmIcon, MoreVerticalIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
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
import { projectDurationMicros, type ProjectDoc } from '#/editor/doc/schema'
import { microsToSeconds } from '#/editor/doc/time'
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
  const { projects, isLoading, createProject, renameProject, duplicateProject, removeProject } =
    useProjects()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameTarget, setRenameTarget] = useState<ProjectDoc | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectDoc | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    const name = newName.trim() || 'Untitled Project'
    setBusy(true)
    const doc = await createProject(name)
    setBusy(false)
    setCreateOpen(false)
    setNewName('')
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
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CapCut for iPad</h1>
        <Button size="lg" className="h-11 gap-2 px-4 text-sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          New Project
        </Button>
      </header>

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
