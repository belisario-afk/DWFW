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
  private trackId: string | null = null

  // Beat/section map from Spotify audio-analysis
  private barStarts: number[] = []
  private sectionStarts: number[] = []
  private msOffset = 0

  constructor(engine: VisualEngine, analyzer: Analyzer, api: SpotifyAPI) {
    this.engine = engine
    this.analyzer = analyzer
    this.api = api

    // Align analyzer beatPhase to playback time using bar grid if available
    setInterval(async () => {
      const st = await this.api.getPlaybackState().catch(()=>null)
      if (!st?.item?.id) return
      const pos = st.progress_ms || 0
      const beatPhase = this.phaseAt(pos, this.barStarts)
      this.analyzer.frame.beatPhase = beatPhase
      this.analyzer.frame.tempo = this.estimateTempo()
      this.analyzer.frame.beatConfidence = this.barStarts.length ? 0.9 : 0.5
    }, 250)
  }

  private phaseAt(ms: number, starts: number[]) {
    if (!starts.length) return this.analyzer.frame.beatPhase
    for (let i=0;i<starts.length-1;i++){
      if (ms >= starts[i] && ms < starts[i+1]) {
        const span = starts[i+1] - starts[i]
        return span>0 ? (ms - starts[i]) / span : 0
      }
    }
    return 0
  }
  private estimateTempo() {
    if (this.barStarts.length > 1) {
      let acc = 0, n = 0
      for (let i=1;i<Math.min(this.barStarts.length, 16);i++) { acc += this.barStarts[i]-this.barStarts[i-1]; n++ }
      const spb = (acc/n)/1000
      return spb>0 ? 60/spb : this.analyzer.frame.tempo
    }
    return this.analyzer.frame.tempo
  }

  onTrack(state: SpotifyApi.CurrentPlaybackResponse) {
    const id = state?.item?.id || null
    if (id && id !== this.trackId) {
      this.trackId = id
      this.loadCues(id)
      // Fetch audio analysis and build bar/section arrays
      this.api.getAudioAnalysis(id).then(aa => {
        this.barStarts = (aa.bars || []).map(b => Math.round(b.start * 1000))
        this.sectionStarts = (aa.sections || []).map(s => Math.round(s.start * 1000))
      }).catch(()=>{})
      // Auto-cinematic
      this.api.getAudioFeatures(id).then(feat => {
        const e = feat.energy, d = feat.danceability, v = feat.valence, ins = feat.instrumentalness || 0
        const sel =
          e > 0.75 && d > 0.6 ? 'CoverParticles' :
          d > 0.7 && v > 0.5 ? 'Kaleidoscope' :
          e > 0.6 && v < 0.4 ? 'Tunnel' :
          ins > 0.7 ? 'Typography' :
          e < 0.35 ? 'Fluid' : 'Terrain'
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