import { SpotifyAPI } from './api'
import { Analyzer } from '@audio/analyzer'

declare global {
  interface Window { onSpotifyWebPlaybackSDKReady: () => void }
}

export class Playback {
  private api: SpotifyAPI
  private analyzer: Analyzer
  private player: Spotify.Player | null = null
  private deviceId: string | null = null
  private premium = false

  constructor(api: SpotifyAPI, analyzer: Analyzer) {
    this.api = api
    this.analyzer = analyzer
  }

  async init() {
    // Determine premium by trying to get product
    try {
      const profile = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${await (this.api as any).auth.ensureToken()}` }
      }).then(r => r.json())
      this.premium = (profile.product === 'premium')
    } catch { this.premium = false }

    if (this.premium) {
      await this.loadSDK()
      await this.setupPlayer()
    }

    // Wire UI updates
    setInterval(async () => {
      const st = await this.api.getPlaybackState().catch(() => null)
      this.api.emit('track', st)
    }, 2000)
  }

  private async loadSDK() {
    if (document.getElementById('spotify-sdk')) return
    await new Promise<void>((resolve) => {
      const s = document.createElement('script')
      s.id = 'spotify-sdk'
      s.src = 'https://sdk.scdn.co/spotify-player.js'
      document.body.appendChild(s)
      window.onSpotifyWebPlaybackSDKReady = () => resolve()
    })
  }

  private async setupPlayer() {
    const token = await (this.api as any).auth.ensureToken()
    this.player = new window.Spotify.Player({
      name: 'DWFW Web Player',
      getOAuthToken: (cb) => cb(token),
      volume: 0.8
    })

    this.player.addListener('ready', async ({ device_id }) => {
      this.deviceId = device_id
      console.log('Player ready', device_id)
      // Transfer playback to this device
      await this.api.transferPlayback(device_id).catch(console.warn)
    })
    this.player.addListener('not_ready', ({ device_id }) => {
      console.warn('Device ID has gone offline', device_id)
    })
    this.player.addListener('player_state_changed', (state) => {
      if (!state) return
      const pos = state.position
      const dur = state.duration
      const paused = state.paused
      // UI updates handled elsewhere via /me/player polling
      // Attach audio output to Analyzer via HTMLAudioElement sinkId is not available; Web Playback SDK is encrypted.
      // We rely on Web API analysis + app-level timer; for visualization we also use microphone-like capture if available.
    })

    await this.player.connect()
  }
}