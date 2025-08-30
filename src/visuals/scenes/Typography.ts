import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class TypographyScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.PlaneGeometry(2, 2)
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uRMS: { value: 0 },
        uCentroid: { value: 2000 },
        uPrimary: { value: new THREE.Color('#ff5a5f') },
        uSecondary: { value: new THREE.Color('#2ec4b6') }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uRMS, uCentroid;
        uniform vec3 uPrimary, uSecondary;
        void main(){
          vec2 uv = vUv*2.0-1.0;
          float w = 0.05 + uRMS*0.3;
          float s = 1.0 + (uCentroid/4000.0 - 0.5) * 0.6;
          uv.x *= s;
          float bar = smoothstep(w, 0.0, abs(uv.y)) * smoothstep(0.9, 0.2, abs(uv.x));
          vec3 col = mix(uSecondary, uPrimary, bar);
          float glow = 0.02 / (abs(uv.y)+0.001) * uRMS*2.0;
          gl_FragColor = vec4(col + glow, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.scene.add(this.mesh)
  }
  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uRMS.value = f.rms
    this.mat.uniforms.uCentroid.value = f.spectralCentroid
  }
  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uPrimary.value.set(p.primary)
    this.mat.uniforms.uSecondary.value.set(p.secondary)
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}