import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class ParticlesScene extends BaseScene {
  private scene!: THREE.Scene
  private pts: THREE.Points | null = null
  private mat: THREE.ShaderMaterial | null = null
  private count = 300_000
  private spread = 6.0

  async init(scene: THREE.Scene) {
    this.scene = scene
    const positions = new Float32Array(this.count * 3)
    const seeds = new Float32Array(this.count * 4)
    for (let i = 0; i < this.count; i++) {
      const u = Math.random(), v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      const r = this.spread * Math.cbrt(Math.random())
      positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)], i * 3)
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uRMS: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
        uColA: { value: new THREE.Color(this.engine.palette.primary) },
        uColB: { value: new THREE.Color(this.engine.palette.secondary) }
      },
      vertexShader: `attribute vec4 seed; uniform float uTime,uRMS,uBass,uMid,uHigh; varying float vG; void main(){ vec3 P=position; float t=uTime+seed.x*10.0; P+=vec3(sin(.16*P.y+t*.6),cos(.12*P.x-t*.5),sin(.14*P.z+t*.7))*(.2+.4*uRMS+.8*uBass); vG=uHigh; gl_PointSize=1.6*(1.0+uBass*3.0+uHigh*1.2); gl_Position=projectionMatrix*modelViewMatrix*vec4(P,1.0); }`,
      fragmentShader: `precision highp float; uniform vec3 uColA,uColB; varying float vG; void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(.55,0.,length(d)); vec3 col=mix(uColA,uColB,vG); float core=smoothstep(.2,0.,length(d)); gl_FragColor=vec4(col*(.45*a+.65*core), a); }`
    })
    this.pts = new THREE.Points(geo, this.mat)
    this.scene.add(this.pts)
  }

  update(t: number): void {
    if (!this.mat) return
    const f = this.engine.analyzer.frame
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uRMS.value = f.rms
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    if (!this.mat) return
    this.mat.uniforms.uColA.value.set(p.primary)
    this.mat.uniforms.uColB.value.set(p.secondary)
  }

  dispose(scene: THREE.Scene): void {
    if (this.pts) { scene.remove(this.pts); this.pts.geometry.dispose(); (this.pts.material as any)?.dispose?.() }
    this.pts = null
    this.mat = null
  }
}