export function safeGet<T = any>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return raw as unknown as T }
  } catch { return null }
}
export function safeSet(key: string, value: any) {
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value)
    sessionStorage.setItem(key, v)
  } catch {}
}
export function safeDel(key: string) {
  try { sessionStorage.removeItem(key) } catch {}
}