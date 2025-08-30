import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class KaleidoscopeScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.PlaneGeometry(2, 2)
    const texLoader = new THREE.TextureLoader()
    const tex = this.engine.albumURL ? texLoader.load(this.engine.albumURL) : null
    if (tex) { tex.colorSpace = THREE.SRGBColorSpace }
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uTex: { value: tex },
        uSeg: { value: 8.0 },
        uRot: { value: 0.0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uBass, uMid, uHigh, uSeg, uRot;
        uniform sampler2D uTex;

        vec2 kale(vec2 uv, float seg, float rot) {
          vec2 p = uv * 2.0 - 1.0;
          float a = atan(p.y, p.x) + rot;
          float r = length(p);
          float s = 6.2831853 / seg;
          a = mod(a, s);
          a = abs(a - s*0.5);
          vec2 pp = vec2(cos(a), sin(a)) * r;
          return pp*0.5 + 0.5;
        }

        void main() {
          float seg = floor(uSeg + uBass*6.0);
          float rot = uTime*0.2 + uMid*1.5;
          vec2 uv = kale(vUv, max(seg, 3.0), rot);
          vec3 col = texture2D(uTex, uv).rgb;
          // punch with highs
          col += vec3(uHigh*0.2, uHigh*0.1, uHigh*0.3);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.scene.add(this.mesh)
  }
  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    if (!this.mat) return
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
  }
  setPalette(_p: any): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}