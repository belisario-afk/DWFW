import * as THREE from 'three'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

export class LissajousOrbitalsScene extends SceneBase implements BaseScene {
  private points!: THREE.Points
  private geom!: THREE.BufferGeometry
  private mat!: THREE.PointsMaterial
  private N = 250   // orbits
  private S = 160   // samples per orbit
  private t = 0
  private huePhase = 0

  async init(scene: THREE.Scene): Promise<void> {
    this.geom = new THREE.BufferGeometry()
    const total = this.N * this.S
    const positions = new Float32Array(total * 3)
    const colors = new Float32Array(total * 3)
    // Seed positions
    for (let i=0;i<total;i++) {
      positions[i*3+0] = 0
      positions[i*3+1] = 0
      positions[i*3+2] = 0
      colors[i*3+0] = 1
      colors[i*3+1] = 1
      colors[i*3+2] = 1
    }
    this.geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    this.mat = new THREE.PointsMaterial({
      size: 0.035,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.points = new THREE.Points(this.geom, this.mat)
    this.points.position.z = -8
    scene.add(this.points)

    scene.add(new THREE.AmbientLight(0xffffff, 0.15))
  }

  update(t: number, dt: number): void {
    this.t += dt
    const f = this.engine.analyzer.frame
    const pos = this.geom.getAttribute('position') as THREE.BufferAttribute
    const col = this.geom.getAttribute('color') as THREE.BufferAttribute

    // Music-locked ratios (gentle quantization)
    const baseTempo = Math.max(60, Math.min(180, f.tempo || 120))
    const tempoNorm = (baseTempo - 60) / 120 // 0..1
    const ratioA = 2 + Math.round(3 * tempoNorm) // 2..5
    const ratioB = 3 + Math.round(4 * (1-tempoNorm)) // 3..7
    const energy = THREE.MathUtils.clamp(f.rms*3.0, 0, 1)
    const bass = THREE.MathUtils.clamp(f.bands.bass*2.5, 0, 1)

    // Points
    const total = this.N * this.S
    let idx = 0
    const scale = 2.2 + energy*1.5
    const tube = 0.01 + energy*0.03
    const chroma = f.chroma
    for (let i=0;i<this.N;i++) {
      const a = i / this.N
      const phx = a*6.2831
      const phy = (1.0-a)*6.2831
      const ax = ratioA + 0.15 * Math.sin(this.t*0.7 + a*10.0)
      const ay = ratioB + 0.15 * Math.cos(this.t*0.6 + a*9.0)
      for (let s=0;s<this.S;s++) {
        const u = s / this.S
        const ang = u*6.2831
        const x = Math.sin(ax*ang + phx)
        const y = Math.sin(ay*ang + phy)
        const z = Math.sin((ax+ay)*0.5*ang + phx*0.5) * 0.25
        const jitter = (hash(i*131 + s*911 + 7) - 0.5) * tube
        pos.setXYZ(idx, x*scale + jitter, y*scale + jitter, z*scale*0.5 + jitter)
        // Color from palette + chroma
        const prc = (i % 12)
        const chrom = chroma[prc] || 0.0
        const c = this.mixPalette(0.4 + 0.6*chrom, a)
        col.setXYZ(idx, c.r, c.g, c.b)
        idx++
      }
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    // Onset satellites: punch point size briefly
    if (f.onset) {
      this.mat.size = Math.min(0.1, this.mat.size + 0.02)
    } else {
      this.mat.size += (0.035 - this.mat.size) * (1 - Math.exp(-8*dt))
    }

    // Mild camera orbit on beats
    if (f.beatConfidence > 0.4) {
      const ph = f.beatPhase
      const r = 0.6 + 0.4*energy
      this.engine.camera.position.x = Math.sin(ph*6.2831)*r
      this.engine.camera.position.y = 0.7 + Math.cos(ph*6.2831)*0.2
      this.engine.camera.position.z = -8 + Math.cos(ph*6.2831)*0.4
      this.engine.camera.lookAt(0, 0, -8)
    }
  }

  setPalette(p: Palette): void {
    // nothing to pre-bake; colors are mixed per-vertex each frame
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points)
    this.geom.dispose()
    this.mat.dispose()
  }

  private mixPalette(t: number, a: number): THREE.Color {
    const p = this.engine.palette
    const c1 = new THREE.Color(p.primary)
    const c2 = new THREE.Color(p.secondary)
    const c3 = new THREE.Color(p.tert)
    const c = c1.clone().lerp(c2, t).lerp(c3, 0.25*Math.sin(a*6.2831*2.0)*0.5+0.5)
    return c
  }
}

function hash(x: number){ return (Math.sin(x)*43758.5453)%1 }