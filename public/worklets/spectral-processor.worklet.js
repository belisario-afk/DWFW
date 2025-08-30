// AudioWorklet processor that emits synthetic analysis frames to keep visuals alive without capture.
class SpectralProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super()
    this.t = 0
    this.bpm = 120
    this.beatPhase = 0
    this.chroma = new Float32Array(12)
    this.port.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'setFFT') {
        // no-op here; kept for compatibility
      }
    }
  }
  process(_in, outputs, _params) {
    const out = outputs[0][0]
    for (let i = 0; i < out.length; i++) out[i] = 0
    const dt = out.length / sampleRate
    this.t += dt
    const t = this.t
    const bass = 0.2 + 0.2 * Math.max(0, Math.sin(t*1.2))
    const mid = 0.2 + 0.2 * Math.max(0, Math.sin(t*0.9 + 1.2))
    const highs = 0.2 + 0.2 * Math.max(0, Math.sin(t*1.8 + 2.4))
    const sc = 2000 + 1000*Math.sin(t*0.7)
    const rms = 0.2 + 0.1*Math.sin(t*0.5)
    const flux = Math.max(0, Math.sin(t*2.0))
    const onset = flux > 0.95
    const spb = 60 / this.bpm
    this.beatPhase = (this.beatPhase + dt / spb) % 1
    this.port.postMessage({
      rms, spectralCentroid: sc, flux, onset,
      tempo: this.bpm, beatConfidence: 0.7, beatPhase: this.beatPhase,
      chroma: this.chroma, bands: { bass, lowMid: (bass+mid)/2, mid, highMid: (mid+highs)/2, highs },
      lufsShort: -18, novelty: flux, time: this.t
    })
    return true
  }
}
registerProcessor('spectral-processor', SpectralProcessor)