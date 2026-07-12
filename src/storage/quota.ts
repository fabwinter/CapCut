export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 }
  return navigator.storage.estimate()
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}

/** Asks the browser not to evict our OPFS data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}
