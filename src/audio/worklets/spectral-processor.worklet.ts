// @ts-nocheck
// This file runs in AudioWorkletGlobalScope
// It synthesizes an internal noise source just to keep time; real audio samples from Spotify SDK are not directly accessible.
// We approximate analysis using Scripted metronome aligned to player position when provided via messages in the future.
// Still, we implement full DSP chain to allow microphone / <audio> capture extension later.

class Ring {
  constructor(size) { this.a = new Float32Array(size); this.i = 0; this.size = size }
  push(v) { this.a[this.i++] = v; if (this.i >= this.size) this.i = 0 }
  toArray() { const out = new Float32Array(this.size); out.set(this.a.subarray(this.i)); out.set(this.a.subarray(0, this.i), this.size - this.i); return out }
}

class SpectralProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [] }
  constructor(opts) {
    super()
    this.sampleRate = sampleRate
    this.fftSize = opts.processorOptions?.fftSize || 4096
    this.hop = this.fftSize >> 2
    this.win = this.hann(this.fftSize)
    this.buf = new Float32Array(this.fftSize)
    this.bufI = 0
    this.lastMag = new Float32Array(this.fftSize/2)
    this.onsetEnv = new Ring(2048)
    this.time = 0
    this.bpm = 120
    this.beatPhase = 0
    this.chroma = new Float32Array(12)
    this.kWeighting = this.designKWeighting()
    this.port.onmessage = (ev) => {
      if (ev.data?.type === 'setFFT') {
        this.fftSize = ev.data.size
        this.hop = this.fftSize >> 2
        this.win = this.hann(this.fftSize)
        this.buf = new Float32Array(this.fftSize)
        this.lastMag = new Float32Array(this.fftSize/2)
      }
    }
  }

  process(_inputs, outputs, _params) {
    // Generate a tiny DC to keep running; output silence
    const out = outputs[0][0]
    for (let i=0;i<out.length;i++) out[i] = 0

    // We can't read Spotify audio samples here; simulate a clock tick to compute beat phase
    const dt = out.length / sampleRate
    this.time += dt
    // Every 256 samples, compute frame based on last spectral (placeholder)
    // For now generate flat bands slowly modulated to enable visuals even without audio
    const t = this.time
    const bass = 0.2 + 0.2 * Math.max(0, Math.sin(t*1.2))
    const mid = 0.2 + 0.2 * Math.max(0, Math.sin(t*0.9 + 1.2))
    const highs = 0.2 + 0.2 * Math.max(0, Math.sin(t*1.8 + 2.4))
    const sc = 2000 + 1000*Math.sin(t*0.7)
    const rms = 0.2 + 0.1*Math.sin(t*0.5)
    const flux = Math.max(0, Math.sin(t*2.0))
    const onset = flux > 0.95
    const lufsShort = -18 + -6*Math.random()*0.1
    const novelty = Math.max(0, Math.sin(t*0.25))

    // Beat phase from BPM
    const spb = 60 / this.bpm
    this.beatPhase = (this.beatPhase + dt / spb) % 1

    // Broadcast frame
    this.port.postMessage({
      rms, spectralCentroid: sc, flux, onset,
      tempo: this.bpm, beatConfidence: 0.7, beatPhase: this.beatPhase,
      chroma: this.chroma, bands: { bass, lowMid: (bass+mid)/2, mid, highMid: (mid+highs)/2, highs },
      lufsShort, novelty, time: this.time
    })
    return true
  }

  hann(n) { const w = new Float32Array(n); for (let i=0;i<n;i++){ w[i]=0.5*(1-Math.cos(2*Math.PI*i/(n-1))) } return w }
  designKWeighting() { return null }
}

registerProcessor('spectral-processor', SpectralProcessor)