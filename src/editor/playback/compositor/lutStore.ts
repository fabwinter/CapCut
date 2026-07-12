/** Built-in LUTs shipped as 8x8x8 strip textures (64x8 PNG) under public/builtin-assets/luts/. */
export const BUILTIN_LUTS = ['warm', 'cool', 'noir'] as const
export type BuiltinLutId = (typeof BUILTIN_LUTS)[number]

export function isBuiltinLutId(id: string): id is BuiltinLutId {
  return (BUILTIN_LUTS as readonly string[]).includes(id)
}

const cache = new Map<string, Promise<ImageBitmap>>()

/** Fetches and decodes a built-in LUT strip texture, caching the bitmap across calls. */
export function loadLutBitmap(lutId: string): Promise<ImageBitmap> {
  let pending = cache.get(lutId)
  if (!pending) {
    pending = fetch(`/builtin-assets/luts/${lutId}.png`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch LUT "${lutId}"`)
        return res.blob()
      })
      .then((blob) => createImageBitmap(blob))
    cache.set(lutId, pending)
  }
  return pending
}
