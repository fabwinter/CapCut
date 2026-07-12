import { AlertCircleIcon, FilmIcon, ImageIcon, LoaderCircleIcon, Music2Icon, UploadIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import type { AssetRef } from '#/editor/doc/schema'
import { microsToSeconds } from '#/editor/doc/time'
import { importMediaFile } from '#/editor/media/import'
import { useEditorStore } from '#/editor/state/editorStore'
import { readThumbnail } from '#/editor/media/assetStorage'

interface MediaLibraryProps {
  projectId: string
}

export function MediaLibrary({ projectId }: MediaLibraryProps) {
  const doc = useEditorStore((s) => s.doc)
  const dispatch = useEditorStore((s) => s.dispatch)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      importMediaFile(projectId, file, dispatch).catch((err: unknown) => {
        console.error('Import failed', err)
      })
    }
  }

  const assets = doc?.assets ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center justify-between border-b p-2">
        <span className="text-muted-foreground text-xs font-medium">Media</span>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Import media"
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon className="size-4" />
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <UploadIcon className="text-muted-foreground/40 size-6" />
            <p className="text-muted-foreground text-xs">No media yet</p>
            <Button size="lg" className="h-9 px-3 text-xs" onClick={() => inputRef.current?.click()}>
              Import
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {assets.map((asset) => (
              <AssetRow key={asset.id} projectId={projectId} asset={asset} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AssetRow({ projectId, asset }: { projectId: string; asset: AssetRef }) {
  const KindIcon = asset.kind === 'video' ? FilmIcon : asset.kind === 'audio' ? Music2Icon : ImageIcon
  const thumbnailUrl = useAssetThumbnail(projectId, asset)

  return (
    <li
      data-asset-row
      data-asset-status={asset.status}
      className="hover:bg-muted flex min-h-11 items-center gap-2 rounded-md p-1.5"
    >
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <KindIcon className="text-muted-foreground size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{asset.originalName}</p>
        <p className="text-muted-foreground text-[0.6875rem]">
          {asset.durationMicros ? `${microsToSeconds(asset.durationMicros).toFixed(1)}s` : asset.kind}
        </p>
      </div>
      <StatusIndicator asset={asset} />
    </li>
  )
}

function StatusIndicator({ asset }: { asset: AssetRef }) {
  if (asset.status === 'importing' || asset.status === 'processing') {
    return (
      <LoaderCircleIcon
        data-asset-status-icon="processing"
        className="text-muted-foreground size-3.5 shrink-0 animate-spin"
      />
    )
  }
  if (asset.status === 'error') {
    return (
      <Badge variant="destructive" title={asset.errorMessage} data-asset-status-icon="error">
        <AlertCircleIcon className="size-3" />
        Error
      </Badge>
    )
  }
  return null
}

/** Loads the first generated thumbnail for an asset (once ready) as an object URL. */
function useAssetThumbnail(projectId: string, asset: AssetRef): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const ready = asset.status === 'ready' && !!asset.thumbnailsPath

  useEffect(() => {
    if (!ready) return
    let objectUrl: string | undefined
    let cancelled = false
    readThumbnail(projectId, asset.id, 0)
      .then((file) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(file)
        setUrl(objectUrl)
      })
      .catch(() => {
        // No thumbnail (e.g. an audio-only asset) — fall back to the kind icon.
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the asset actually becomes ready
  }, [projectId, asset.id, ready])

  return url
}
