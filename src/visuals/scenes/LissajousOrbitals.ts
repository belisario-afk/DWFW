import * as THREE from 'three'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

export class LissajousOrbitalsScene extends SceneBase implements BaseScene {
  private points!: THREE.Points
  private geom!: THREE.BufferGeometry
  private mat!: THREE.PointsMaterial
  private N = 260
  private S = 180
  private t = 0

  async init(scene: THREE.Scene): Promise<void> {
    this.geom = new THREE.BufferGeometry()
    const total = this.N * this.S
    this.geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3))
    this.geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(total * 3), 3))
    this.mat = new THREE.PointsMaterial({
      size: 0.038,
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
    scene.add(new THREE.AmbientLight(0xffffff, 0.16))
  }

  update(t: number, dt: number): void {
    this.t += dt
    const f = this.engine.analyzer.frame
    const pos = this.geom.getAttribute('position') as THREE.BufferAttribute
    const col = this.geom.getAttribute('color') as THREE.BufferAttribute

    const baseTempo = Math.max(60, Math.min(180, f.tempo || 120))
    const tn = (baseTempo - 60) / 120
    const ra = 2 + Math.round(3*tn)
    const rb = 3 + Math.round(4*(1-tn))

    const energy = THREE.MathUtils.clamp(f.rms*3.0, 0, 1)
    const scale = 2.4 + energy*1.7
    const tube = 0.011 + energy*0.03
    const chroma = f.chroma

    let iV = 0
    for (let i=0;i<this.N;i++){
      const a = i/this.N
      const phx = a*6.2831
      const phy = (1.0-a)*6.2831
      const ax = ra + 0.12*Math.sin(this.t*0.7 + a*10.0)
      const ay = rb + 0.12*Math.cos(this.t*0.6 + a*9.0)
      for (let s=0;s<this.S;s++){
        const u = s/this.S
        const ang = u*6.2831
        const x = Math.sin(ax*ang + phx)
        const y = Math.sin(ay*ang + phy)
        const z = Math.sin((ax+ay)*0.5*ang + phx*0.5) * 0.25
        const j = (Math.sin(i*17.0 + s*13.0)*0.5+0.5) * tube
        pos.setXYZ(iV, x*scale + j, y*scale + j, z*scale*0.5)
        const prc = i % 12
        const c = this.mixPalette(0.4 + 0.6*(chroma[prc] || 0.0), a)
        col.setXYZ(iV, c.r, c.g, c.b)
        iV++
      }
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    if (f.onset) this.mat.size = Math.min(0.12, this.mat.size + 0.025)
    else this.mat.size += (0.038 - this.mat.size) * (1 - Math.exp(-8*dt))

    if (f.beatConfidence > 0.4) {
      const ph = f.beatPhase
      const r = 0.6 + 0.4*energy
      this.engine.camera.position.x = Math.sin(ph*6.2831)*r
      this.engine.camera.position.y = 0.7 + Math.cos(ph*6.2831)*0.2
      this.engine.camera.position.z = -8 + Math.cos(ph*6.2831)*0.4
      this.engine.camera.lookAt(0, 0, -8)
    }
  }

  setPalette(_: Palette): void {}

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
    return c1.clone().lerp(c2, t).lerp(c3, 0.25*Math.sin(a*6.2831*2.0)*0.5+0.5)
  }
}