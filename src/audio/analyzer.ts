// Real-time audio feature extractor using WebAudio + AudioWorklet
// Features: FFT 4096/8192, spectral flux, onsets, tempo/beat grid, chroma (12), loudness trend (approx LUFS), novelty curve.

export type AnalysisFrame = {
  rms: number
  spectralCentroid: number
  flux: number
  onset: boolean
  tempo: number
  beatConfidence: number
  beatPhase: number // 0..1 within beat
  chroma: Float32Array // 12
  bands: { bass: number; lowMid: number; mid: number; highMid: number; highs: number }
  lufsShort: number
  novelty: number
  time: number
}

export class Analyzer {
  ctx!: AudioContext
  workletNode!: AudioWorkletNode
  frame: AnalysisFrame = this.blank()
  private listeners = new Set<(f: AnalysisFrame) => void>()
  private desiredFFT = 4096

  async init(fftSize = 4096) {
    this.desiredFFT = fftSize
    this.ctx = new AudioContext({ latencyHint: 'interactive' })

    // Load worklet from public/ to avoid bundler/URL issues in prod and dev.
    const workletURL = `${import.meta.env.BASE_URL}worklets/spectral-processor.worklet.js`
    try {
      await this.ctx.audioWorklet.addModule(workletURL)
    } catch (e) {
      console.error('Failed to load AudioWorklet module:', workletURL, e)
      throw e
    }

    this.workletNode = new AudioWorkletNode(this.ctx, 'spectral-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { fftSize }
    })

    this.workletNode.port.onmessage = (ev) => {
      const f = ev.data as AnalysisFrame
      this.frame = f
      this.listeners.forEach(cb => cb(f))
    }

    // Connect to destination; processor outputs silence so nothing audible.
    this.workletNode.connect(this.ctx.destination)
  }

  setFFT(size: number) {
    this.workletNode.port.postMessage({ type: 'setFFT', size })
  }

  onFrame(cb: (f: AnalysisFrame) => void) { this.listeners.add(cb) }
  offFrame(cb: (f: AnalysisFrame) => void) { this.listeners.delete(cb) }

  private blank(): AnalysisFrame {
    return {
      rms: 0, spectralCentroid: 0, flux: 0, onset: false, tempo: 120, beatConfidence: 0, beatPhase: 0,
      chroma: new Float32Array(12), bands: { bass: 0, lowMid: 0, mid: 0, highMid: 0, highs: 0 },
      lufsShort: -23, novelty: 0, time: 0
    }
  }
}