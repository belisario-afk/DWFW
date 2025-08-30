export const idb = {
  async get<T = any>(key: string): Promise<T | undefined> {
    return new Promise((res, rej) => {
      const r = indexedDB.open('dwfw', 1)
      r.onupgradeneeded = () => { r.result.createObjectStore('kv') }
      r.onerror = () => rej(r.error)
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', 'readonly')
        const store = tx.objectStore('kv')
        const req = store.get(key)
        req.onsuccess = () => res(req.result as T)
        req.onerror = () => rej(req.error)
      }
    })
  },
  async put(key: string, value: any) {
    return new Promise<void>((res, rej) => {
      const r = indexedDB.open('dwfw', 1)
      r.onupgradeneeded = () => { r.result.createObjectStore('kv') }
      r.onerror = () => rej(r.error)
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', 'readwrite')
        tx.objectStore('kv').put(value, key)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      }
    })
  }
}

export async function cacheCover(url: string): Promise<{ url: string, etag?: string }> {
  const key = `cover:${url}`
  const cached = await idb.get<{ blob: Blob, etag?: string }>(key)
  const headers: Record<string, string> = {}
  if (cached?.etag) headers['If-None-Match'] = cached.etag
  const res = await fetch(url, { headers })
  if (res.status === 304 && cached) {
    const cachedURL = URL.createObjectURL(cached.blob)
    return { url: cachedURL, etag: cached.etag }
  }
  const blob = await res.blob()
  const etag = res.headers.get('ETag') || undefined
  await idb.put(key, { blob, etag })
  return { url: URL.createObjectURL(blob), etag }
}