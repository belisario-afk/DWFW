import type { VisualEngine } from '@visuals/engine'
import type { Analyzer } from '@audio/analyzer'
import type { SpotifyAPI } from '@spotify/api'
import { idb } from '@utils/db'

type Cue = { bar: number; action: string; scene?: string; params?: any }

export class Director {
  private engine: VisualEngine
  private analyzer: Analyzer
  private api: SpotifyAPI
  private cues: Cue[] = []
  private currentBar = 0
  private barsPerPhrase = 4
  private trackId: string | null = null

  constructor(engine: VisualEngine, analyzer: Analyzer, api: SpotifyAPI) {
    this.engine = engine
    this.analyzer = analyzer
    this.api = api

    analyzer.onFrame(f => {
      // Beat grid from tempo
      const spb = 60 / f.tempo
      const beats = Math.floor(f.time / spb)
      if (beats !== this.currentBar) {
        this.currentBar = beats
        // phrase boundary crossfade
        if (beats % this.barsPerPhrase === 0) {
          // no-op; scene change happens on cue or auto-cine
        }
        // fire cues
        this.cues.filter(c => c.bar === beats).forEach(c => {
          if (c.scene) this.engine.switchScene(c.scene, 1.5)
        })
      }
    })
  }

  onTrack(state: SpotifyApi.CurrentPlaybackResponse) {
    const id = state?.item?.id || null
    if (id && id !== this.trackId) {
      this.trackId = id
      this.loadCues(id)
      // Auto-cinematic: choose scene by features
      this.api.getAudioFeatures(id).then(feat => {
        const e = feat.energy
        const d = feat.danceability
        const v = feat.valence
        const sel =
          e > 0.7 && d > 0.6 ? 'Particles' :
          d > 0.7 && v > 0.5 ? 'Fluid' :
          e > 0.6 && v < 0.4 ? 'Tunnel' :
          e < 0.3 ? 'Typography' : 'Terrain'
        this.engine.switchScene(sel, 1.2)
      }).catch(() => {})
    }
  }

  async addCue(c: Cue) {
    this.cues.push(c)
    if (this.trackId) await idb.put(`cues:${this.trackId}`, this.cues)
  }

  async loadCues(trackId: string) {
    this.cues = await idb.get(`cues:${trackId}`) || []
  }

  listCues() { return this.cues.slice().sort((a,b)=>a.bar-b.bar) }
}