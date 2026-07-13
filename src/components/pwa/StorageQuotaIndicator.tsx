import { useEffect, useState } from 'react'
import { getStorageQuota } from '#/editor/pwa/pwa'

export function StorageQuotaIndicator() {
  const [quota, setQuota] = useState<{ usage: number; quota: number; percent: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const updateQuota = async () => {
      const q = await getStorageQuota()
      if (mounted) {
        setQuota(q)
        setIsLoading(false)
      }
    }

    updateQuota()

    // Poll every 5 seconds
    const interval = setInterval(updateQuota, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  if (isLoading || !quota) return null

  const usageGB = (quota.usage / 1024 / 1024 / 1024).toFixed(1)
  const quotaGB = (quota.quota / 1024 / 1024 / 1024).toFixed(1)
  const isLow = quota.percent > 80
  const isCritical = quota.percent > 95

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Storage</span>
        <span className={isCritical ? 'text-destructive' : isLow ? 'text-yellow-600' : ''}>
          {usageGB}GB / {quotaGB}GB
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            isCritical
              ? 'bg-destructive'
              : isLow
                ? 'bg-yellow-600'
                : 'bg-green-600'
          }`}
          style={{ width: `${Math.min(quota.percent, 100)}%` }}
        />
      </div>
      {isCritical && (
        <p className="text-xs text-destructive">Storage nearly full — delete unused projects</p>
      )}
    </div>
  )
}
