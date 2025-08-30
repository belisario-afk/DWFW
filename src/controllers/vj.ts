import type { VisualEngine } from '@visuals/engine'

export class VJ {
  private engine: VisualEngine
  private midiLearn = false
  private mapping: Record<number, (v: number) => void> = {}

  constructor(engine: VisualEngine) {
    this.engine = engine
    this.initMIDI()
    this.bindKeyboard()
  }

  setIntensity(v: number) { /* adjust global intensity by modifying materials or engine uniforms if needed */ }
  setBloom(v: number) { /* adjust bloom effect strength if used in engine.applyPost */ }
  setGlitch(v: number) { /* placeholder */ }
  setSpeed(v: number) { this.engine.targetFPS = v > 1 ? 120 : 60 }

  async initMIDI() {
    if (!navigator.requestMIDIAccess) return
    const access = await navigator.requestMIDIAccess().catch(()=>null)
    if (!access) return
    access.inputs.forEach(input => {
      input.onmidimessage = (e) => {
        const [st, d1, d2] = e.data
        if ((st & 0xF0) === 0xB0) { // CC
          const v = d2 / 127
          const fn = this.mapping[d1]
          if (fn) fn(v)
        }
      }
    })
  }

  bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.key === '1') this.engine.switchScene('Particles')
      if (e.key === '2') this.engine.switchScene('Fluid')
      if (e.key === '3') this.engine.switchScene('Tunnel')
      if (e.key === '4') this.engine.switchScene('Terrain')
      if (e.key === '5') this.engine.switchScene('Typography')
      if (e.key === 'f') document.documentElement.requestFullscreen().catch(()=>{})
    })
  }

  enableMIDILearn(mapper: (learn: (cc: number, fn: (v:number)=>void)=>void) => void) {
    this.midiLearn = true
    mapper((cc, fn) => { this.mapping[cc] = fn })
  }
}