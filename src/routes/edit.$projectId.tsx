import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckIcon, ChevronLeftIcon, LoaderCircleIcon, RedoIcon, SettingsIcon, UndoIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ExportDialog } from '#/components/editor/ExportDialog'
import { Inspector } from '#/components/editor/Inspector'
import { MediaLibrary } from '#/components/editor/MediaLibrary'
import { PreviewCanvas } from '#/components/editor/PreviewCanvas'
import { ProjectSettingsDialog } from '#/components/editor/ProjectSettingsDialog'
import { Timeline } from '#/components/editor/timeline/Timeline'
import { deleteClip } from '#/editor/doc/commands/clips'
import { renameProject } from '#/editor/doc/commands/project'
import { projectDurationMicros } from '#/editor/doc/schema'
import { frameDurationMicros } from '#/editor/doc/time'
import { useEditorStore } from '#/editor/state/editorStore'
import { loadProject } from '#/storage/idb'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export const Route = createFileRoute('/edit/$projectId')({ component: Editor })

type LoadState = 'loading' | 'ready' | 'not-found'

function Editor() {
  const { projectId } = Route.useParams()
  const navigate = useNavigate()
  const {
    doc,
    canUndo,
    canRedo,
    isDirty,
    isSaving,
    selectedClipId,
    playheadMicros,
    setPlayhead,
    openProject,
    dispatch,
    undo,
    redo,
    closeProject,
    selectClip,
  } = useEditorStore()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Desktop bonus (ARCHITECTURE §1: secondary on iPad, but cheap and expected on desktop browsers).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || exportOpen) return
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault()
        dispatch(deleteClip(selectedClipId))
        selectClip(null)
        return
      }
      if (e.key === 'Escape' && selectedClipId) {
        selectClip(null)
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setPlayhead(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        if (doc) setPlayhead(projectDurationMicros(doc))
        return
      }
      if (e.key === 'ArrowLeft' && doc) {
        e.preventDefault()
        setPlayhead(Math.max(0, playheadMicros - frameDurationMicros(doc.settings.fps)))
        return
      }
      if (e.key === 'ArrowRight' && doc) {
        e.preventDefault()
        setPlayhead(playheadMicros + frameDurationMicros(doc.settings.fps))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, dispatch, selectClip, selectedClipId, exportOpen, doc, playheadMicros, setPlayhead])

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    loadProject(projectId).then((loaded) => {
      if (cancelled) return
      if (loaded) {
        openProject(loaded)
        setLoadState('ready')
      } else {
        setLoadState('not-found')
      }
    })
    return () => {
      cancelled = true
      closeProject()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/close are stable store actions; re-running per projectId is what we want
  }, [projectId])

  if (loadState === 'not-found') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm">Project not found.</p>
        <Button onClick={() => navigate({ to: '/' })}>Back to projects</Button>
      </div>
    )
  }

  if (loadState === 'loading' || !doc) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoaderCircleIcon className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-3 [padding-top:env(safe-area-inset-top)]">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Back to projects"
          onClick={() => navigate({ to: '/' })}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <ProjectNameField name={doc.name} onCommit={(name) => dispatch(renameProject(name))} />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <UndoIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <RedoIcon className="size-4" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator isDirty={isDirty} isSaving={isSaving} />
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Project settings"
            data-action="project-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button size="lg" className="h-9 px-4 text-sm" data-action="export" onClick={() => setExportOpen(true)}>
            Export
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <aside className="border-border w-64 shrink-0 border-r">
          <MediaLibrary projectId={projectId} />
        </aside>

        {/* min-w-0: without it this flex item's min-width tracks the timeline's
            intrinsic content width, and a long project pushes the Inspector and
            even the preview canvas past the right edge of the screen. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="bg-black/90 flex min-h-0 flex-1 flex-col overflow-hidden">
            <PreviewCanvas projectId={projectId} doc={doc} />
          </div>

          <div className="border-border bg-card/40 h-56 shrink-0 border-t [padding-bottom:env(safe-area-inset-bottom)]">
            <Timeline projectId={projectId} doc={doc} />
          </div>
        </div>

        <Inspector />
      </main>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        projectName={doc.name}
        doc={doc}
      />

      <ProjectSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} doc={doc} dispatch={dispatch} />
    </div>
  )
}

function ProjectNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  useEffect(() => {
    if (!editing) setValue(name)
  }, [name, editing])

  function commit() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== name) onCommit(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setValue(name)
            setEditing(false)
          }
        }}
        className="h-9 w-48 text-sm"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="max-w-48 truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-muted"
    >
      {name}
    </button>
  )
}

function SaveIndicator({ isDirty, isSaving }: { isDirty: boolean; isSaving: boolean }) {
  const state = isSaving ? 'saving' : isDirty ? 'unsaved' : 'saved'
  if (state === 'saving') {
    return (
      <span data-save-state={state} className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <LoaderCircleIcon className="size-3 animate-spin" />
        Saving…
      </span>
    )
  }
  if (state === 'unsaved') {
    return (
      <span data-save-state={state} className="text-muted-foreground text-xs">
        Unsaved changes
      </span>
    )
  }
  return (
    <span data-save-state={state} className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <CheckIcon className="size-3" />
      Saved
    </span>
  )
}
