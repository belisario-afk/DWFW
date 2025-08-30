import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class CoverParticlesScene extends BaseScene {
  private scene!: THREE.Scene
  private pts!: THREE.Points
  private mat!: THREE.ShaderMaterial
  private count = 400_000

  async init(scene: THREE.Scene) {
    this.scene = scene
    const positions = await this.sampleCover(this.count)
    const colors = new Float32Array(this.count * 3)
    for (let i=0;i<this.count;i++) {
      // Start near origin; offset in shader
      colors.set([Math.random(), Math.random(), Math.random()], i*3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('colorSeed', new THREE.BufferAttribute(colors, 3))

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uColA: { value: new THREE.Color(this.engine.palette.primary) },
        uColB: { value: new THREE.Color(this.engine.palette.secondary) },
        uInt: { value: 0.9 }
      },
      vertexShader: `
        attribute vec3 colorSeed;
        uniform float uTime, uBass, uMid, uHigh, uInt;
        varying float vGlow;
        varying vec3 vCol;
        // simple curl-like field
        vec3 flow(vec3 p, float t){
          return vec3(
            sin(p.y*0.15 + t*0.7),
            cos(p.z*0.1 + t*0.6),
            sin(p.x*0.12 + t*0.5)
          );
        }
        void main(){
          vec3 pos = position;
          vec3 vel = flow(pos*0.5, uTime) * (0.6 + uInt*0.6);
          pos += vel * (0.5 + uBass*1.2);
          vGlow = uHigh*0.8 + uMid*0.2;
          vCol = colorSeed;
          gl_PointSize = 1.0 + uBass*5.0 + uHigh*1.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColA, uColB;
        varying float vGlow;
        varying vec3 vCol;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.6, 0.0, d);
          vec3 col = mix(uColA, uColB, vGlow);
          gl_FragColor = vec4(col, a);
        }
      `
    })
    this.pts = new THREE.Points(geo, this.mat)
    this.scene.add(this.pts)
  }

  private async sampleCover(count: number): Promise<Float32Array> {
    const arr = new Float32Array(count * 3)
    const url = this.engine.albumURL
    if (!url) {
      for (let i=0;i<count;i++){
        arr[i*3+0] = (Math.random()*2-1) * 8
        arr[i*3+1] = (Math.random()*2-1) * 8
        arr[i*3+2] = (Math.random()*2-1) * 2
      }
      return arr
    }
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image()
      im.onload = () => res(im)
      im.onerror = rej
      im.src = url
    })
    const c = document.createElement('canvas')
    const size = 256
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data

    let n = 0
    for (let i=0;i<size*size && n<count;i++){
      const a = data[i*4+3]
      const r = data[i*4], g = data[i*4+1], b = data[i*4+2]
      const l = (r+g+b)/3
      if (a > 200 && l > 40) {
        const x = (i % size) / size * 2 - 1
        const y = Math.floor(i / size) / size * 2 - 1
        arr[n*3+0] = x * 8
        arr[n*3+1] = y * 8
        arr[n*3+2] = (Math.random()*2-1) * 0.5
        n++
      }
    }
    // Fill remainder randomly
    for (; n<count; n++) {
      arr[n*3+0] = (Math.random()*2-1) * 8
      arr[n*3+1] = (Math.random()*2-1) * 8
      arr[n*3+2] = (Math.random()*2-1) * 0.5
    }
    return arr
  }

  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    if (!this.mat) return
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
  }
  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uColA.value.set(p.primary)
    this.mat.uniforms.uColB.value.set(p.secondary)
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.pts)
    this.pts.geometry.dispose()
    this.mat.dispose()
  }
}