// Enhanced analyzer: optional precise path via captured tab/system audio using AnalyserNode (FFT 4096/8192).
// Falls back to AudioWorklet-driven timing if capture isn't enabled.

export type AnalysisFrame = {
  rms: number
  spectralCentroid: number
  flux: number
  onset: boolean
  tempo: number
  beatConfidence: number
  beatPhase: number
  chroma: Float32Array
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

  // Precise path
  private analyserNode: AnalyserNode | null = null
  private srcNode: MediaStreamAudioSourceNode | null = null
  private freq!: Float32Array
  private timeData!: Float32Array
  private lastMag!: Float32Array
  private rafId = 0
  private onsetHist: number[] = []
  private onsetPtr = 0

  usingCapture = false

  async init(fftSize = 4096) {
    this.desiredFFT = fftSize
    this.ctx = new AudioContext({ latencyHint: 'interactive' })

    // Worklet for baseline timing so visuals animate even without capture.
    const workletURL = `${import.meta.env.BASE_URL}worklets/spectral-processor.worklet.js`
    await this.ctx.audioWorklet.addModule(workletURL)
    this.workletNode = new AudioWorkletNode(this.ctx, 'spectral-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { fftSize }
    })
    this.workletNode.port.onmessage = (ev) => {
      if (this.usingCapture) return
      const f = ev.data as AnalysisFrame
      this.frame = f
      this.listeners.forEach(cb => cb(f))
    }
    this.workletNode.connect(this.ctx.destination)
  }

  async enableDisplayCapture(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false })
      await this.connectStream(stream)
      this.usingCapture = true
      return true
    } catch {
      this.usingCapture = false
      return false
    }
  }

  private async connectStream(stream: MediaStream) {
    if (this.srcNode) { try { this.srcNode.disconnect() } catch {} }
    this.srcNode = this.ctx.createMediaStreamSource(stream)
    if (this.analyserNode) { try { this.analyserNode.disconnect() } catch {} }
    this.analyserNode = this.ctx.createAnalyser()
    this.analyserNode.fftSize = this.desiredFFT
    this.analyserNode.smoothingTimeConstant = 0.7
    this.freq = new Float32Array(this.analyserNode.frequencyBinCount)
    this.timeData = new Float32Array(this.analyserNode.fftSize)
    this.lastMag = new Float32Array(this.analyserNode.frequencyBinCount)
    this.srcNode.connect(this.analyserNode)
    this.tick()
  }

  setFFT(size: number) {
    this.desiredFFT = size
    if (this.analyserNode) {
      this.analyserNode.fftSize = size
      this.freq = new Float32Array(this.analyserNode.frequencyBinCount)
      this.timeData = new Float32Array(this.analyserNode.fftSize)
      this.lastMag = new Float32Array(this.analyserNode.frequencyBinCount)
    } else {
      this.workletNode?.port.postMessage({ type: 'setFFT', size })
    }
  }

  onFrame(cb: (f: AnalysisFrame) => void) { this.listeners.add(cb) }
  offFrame(cb: (f: AnalysisFrame) => void) { this.listeners.delete(cb) }

  private tick = () => {
    if (!this.analyserNode) return
    this.analyserNode.getFloatFrequencyData(this.freq)
    const mag = this.freq
    // Normalize to positive magnitudes
    let sumMag = 0
    const N = mag.length
    const magsLin = new Float32Array(N)
    for (let i=0;i<N;i++) {
      const m = Math.pow(10, mag[i]/20) // convert dB to linear
      magsLin[i] = m
      sumMag += m
    }
    // Bands (log-ish buckets)
    const bands = this.computeBands(magsLin, this.ctx.sampleRate, this.analyserNode.fftSize)
    // RMS from time domain
    this.analyserNode.getFloatTimeDomainData(this.timeData)
    let rms = 0; for (let i=0;i<this.timeData.length;i++) rms += this.timeData[i]*this.timeData[i]
    rms = Math.sqrt(rms / this.timeData.length)
    const spectralCentroid = this.computeCentroid(magsLin, this.ctx.sampleRate, this.analyserNode.fftSize)
    // Spectral flux
    let flux = 0
    for (let i=0;i<N;i++) {
      const d = magsLin[i] - this.lastMag[i]
      if (d > 0) flux += d
      this.lastMag[i] = magsLin[i]
    }
    // Adaptive onset
    const now = this.ctx.currentTime
    this.onsetHist.push(flux)
    if (this.onsetHist.length > 120) this.onsetHist.shift()
    const mean = this.onsetHist.reduce((a,b)=>a+b,0)/this.onsetHist.length
    const sd = Math.sqrt(this.onsetHist.reduce((a,b)=>a+(b-mean)*(b-mean),0)/this.onsetHist.length)
    const onset = flux > mean + 2.5*sd

    const frame = {
      rms,
      spectralCentroid,
      flux,
      onset,
      tempo: this.frame.tempo, // director may override
      beatConfidence: this.frame.beatConfidence,
      beatPhase: this.frame.beatPhase,
      chroma: this.estimateChroma(magsLin, this.ctx.sampleRate, this.analyserNode.fftSize),
      bands,
      lufsShort: -18, // approx placeholder
      novelty: flux,
      time: now
    } satisfies AnalysisFrame

    this.frame = frame
    this.listeners.forEach(cb => cb(frame))
    this.rafId = requestAnimationFrame(this.tick)
  }

  private computeBands(mags: Float32Array, sr: number, fftSize: number) {
    const ny = sr/2, binHz = ny / mags.length
    const sumRange = (lo: number, hi: number) => {
      const i0 = Math.max(0, Math.floor(lo / binHz))
      const i1 = Math.min(mags.length-1, Math.ceil(hi / binHz))
      let s = 0
      for (let i=i0;i<=i1;i++) s += mags[i]
      return s / (i1-i0+1)
    }
    return {
      bass: sumRange(20, 120),
      lowMid: sumRange(120, 400),
      mid: sumRange(400, 2000),
      highMid: sumRange(2000, 6000),
      highs: sumRange(6000, 16000)
    }
  }

  private computeCentroid(mags: Float32Array, sr: number, fftSize: number) {
    const ny = sr/2, binHz = ny / mags.length
    let num = 0, den = 0
    for (let i=0;i<mags.length;i++) {
      const f = i*binHz
      const m = mags[i]
      num += f*m; den += m
    }
    return den > 0 ? num/den : 0
  }

  private estimateChroma(mags: Float32Array, sr: number, fftSize: number) {
    const chroma = new Float32Array(12)
    const ny = sr/2, binHz = ny / mags.length
    for (let i=1;i<mags.length;i++) {
      const f = i*binHz
      const m = mags[i]
      const pitch = 69 + 12*Math.log2(f/440)
      const cls = Math.round(pitch) % 12
      if (isFinite(cls)) chroma[(cls+12)%12] += m
    }
    let sum = 0; for (let i=0;i<12;i++) sum += chroma[i]
    if (sum>0) for (let i=0;i<12;i++) chroma[i] /= sum
    return chroma
  }

  stopCapture() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.usingCapture = false
    try { this.srcNode?.disconnect(); this.analyserNode?.disconnect() } catch {}
    this.srcNode = null; this.analyserNode = null
  }

  private blank(): AnalysisFrame {
    return {
      rms: 0, spectralCentroid: 0, flux: 0, onset: false, tempo: 120, beatConfidence: 0, beatPhase: 0,
      chroma: new Float32Array(12),
      bands: { bass: 0, lowMid: 0, mid: 0, highMid: 0, highs: 0 },
      lufsShort: -23, novelty: 0, time: 0
    }
  }
}