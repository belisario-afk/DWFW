import { Auth } from '@auth/pkce'

type TrackState = SpotifyApi.CurrentPlaybackResponse

type ListenerMap = {
  track: (state: TrackState | null) => void
  devices: (devices: SpotifyApi.UserDevicesResponse['devices']) => void
  rateLimit: (retryAfterMs: number) => void
}

export class SpotifyAPI {
  private auth: Auth
  private listeners: { [K in keyof ListenerMap]?: Set<ListenerMap[K]> } = {}
  private backoffUntil = 0

  constructor(auth: Auth) { this.auth = auth }

  on<K extends keyof ListenerMap>(evt: K, cb: ListenerMap[K]) {
    if (!this.listeners[evt]) this.listeners[evt] = new Set()
    this.listeners[evt]!.add(cb)
  }
  off<K extends keyof ListenerMap>(evt: K, cb: ListenerMap[K]) { this.listeners[evt]?.delete(cb) }
  emit<K extends keyof ListenerMap>(evt: K, payload: Parameters<ListenerMap[K]>[0]) {
    this.listeners[evt]?.forEach((cb) => cb(payload as any))
  }

  private async fetch(path: string, init?: RequestInit) {
    const now = Date.now()
    if (now < this.backoffUntil) {
      await new Promise((r) => setTimeout(r, this.backoffUntil - now))
    }
    const token = await this.auth.ensureToken()
    const res = await fetch('https://api.spotify.com/v1' + path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('Retry-After') || '1', 10) * 1000
      this.backoffUntil = Date.now() + ra
      this.emit('rateLimit', ra)
      await new Promise((r) => setTimeout(r, ra))
      return this.fetch(path, init)
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Spotify API ${res.status}: ${text}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  async getPlaybackState() {
    return this.fetch('/me/player') as Promise<TrackState>
  }

  async refreshDevices() {
    const d = await this.fetch('/me/player/devices') as SpotifyApi.UserDevicesResponse
    this.emit('devices', d.devices)
    return d.devices
  }

  async transferPlayback(deviceId: string) {
    await this.fetch('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: true }) })
  }

  async play(uri?: string | string[], positionMs?: number) {
    const body: any = {}
    if (Array.isArray(uri)) body.uris = uri
    else if (uri) body.uris = [uri]
    if (typeof positionMs === 'number') body.position_ms = positionMs
    await this.fetch('/me/player/play', { method: 'PUT', body: JSON.stringify(body) })
  }
  async pause() { await this.fetch('/me/player/pause', { method: 'PUT' }) }
  async next() { await this.fetch('/me/player/next', { method: 'POST' }) }
  async previous() { await this.fetch('/me/player/previous', { method: 'POST' }) }
  async seek(ms: number) { await this.fetch(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' }) }
  async setVolume(vol: number) { await this.fetch(`/me/player/volume?volume_percent=${Math.round(vol * 100)}`, { method: 'PUT' }) }

  async getAudioFeatures(trackId: string) {
    return this.fetch(`/audio-features/${trackId}`) as Promise<SpotifyApi.AudioFeaturesResponse>
  }
  async getAudioAnalysis(trackId: string) {
    return this.fetch(`/audio-analysis/${trackId}`) as Promise<SpotifyApi.AudioAnalysisResponse>
  }
}