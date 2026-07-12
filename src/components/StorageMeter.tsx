import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { getStorageEstimate, isStoragePersisted, requestPersistentStorage } from '#/storage/quota'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1
  do {
    value /= 1024
    unitIndex++
  } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

/** Storage quota meter + a one-tap `persist()` request, per ARCHITECTURE §5's OPFS-eviction risk. */
export function StorageMeter() {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getStorageEstimate(), isStoragePersisted()]).then(([est, p]) => {
      if (cancelled) return
      setEstimate(est)
      setPersisted(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePersist() {
    setRequesting(true)
    const granted = await requestPersistentStorage()
    setPersisted(granted)
    setRequesting(false)
  }

  if (!estimate || !estimate.quota) return null

  const usedBytes = estimate.usage ?? 0
  const quotaBytes = estimate.quota
  const percent = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0

  return (
    <div
      data-storage-meter
      data-persisted={persisted ?? undefined}
      className="border-border bg-card/40 mb-6 flex items-center gap-3 rounded-lg border px-3 py-2 text-xs"
    >
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground flex items-center justify-between gap-2">
          <span>
            {formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used
          </span>
          <span>{percent}%</span>
        </div>
        <div className="bg-muted mt-1 h-1 w-full overflow-hidden rounded-full">
          <div className="bg-primary h-full" style={{ width: `${percent}%` }} />
        </div>
      </div>
      {persisted === false && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          data-action="request-persist"
          disabled={requesting}
          onClick={handlePersist}
        >
          {requesting ? 'Requesting…' : 'Keep media safe'}
        </Button>
      )}
      {persisted === true && (
        <span data-persisted-label className="text-muted-foreground shrink-0">
          Storage protected
        </span>
      )}
    </div>
  )
}
