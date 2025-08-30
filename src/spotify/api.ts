export class SpotifyAPI {
  constructor(private token: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    })
    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized')
      if (res.status === 403) throw new Error('Forbidden')
      throw new Error(`${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<T>
  }

  getPlaybackState() { return this.call<SpotifyApi.CurrentPlaybackResponse>('/me/player') }
  getAudioAnalysis(id: string) { return this.call<any>(`/audio-analysis/${id}`) }
  getAudioFeatures(id: string) { return this.call<any>(`/audio-features/${id}`) }

  // Optional pass-throughs used by UI (no-op if not using Web Playback SDK)
  play(body?: any) { return this.call('/me/player/play', { method: 'PUT', body: body ? JSON.stringify(body) : undefined }) }
  pause() { return this.call('/me/player/pause', { method: 'PUT' }) }
  next() { return this.call('/me/player/next', { method: 'POST' }) }
  previous() { return this.call('/me/player/previous', { method: 'POST' }) }
  setVolume(v: number) { return this.call(`/me/player/volume?volume_percent=${Math.round(v*100)}`, { method: 'PUT' }) }
  seek(ms: number) { return this.call(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' }) }
  transferPlayback(deviceId: string) { return this.call('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: true }) }) }
}