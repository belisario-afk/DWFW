import * as THREE from 'three'
import { BaseScene } from '@visuals/engine'

export class ParticlesScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Points
  private mat!: THREE.ShaderMaterial
  private count = 1_000_000
  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1,1,1,1)
    geo.index = quad.index
    geo.attributes.position = quad.attributes.position
    const positions = new Float32Array(this.count * 3)
    const seeds = new Float32Array(this.count * 4)
    for (let i=0;i<this.count;i++){
      positions[i*3+0] = (Math.random()*2-1)*50
      positions[i*3+1] = (Math.random()*2-1)*50
      positions[i*3+2] = (Math.random()*2-1)*50
      seeds.set([Math.random(),Math.random(),Math.random(),Math.random()], i*4)
    }
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(positions, 3))
    geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4))
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uInt: { value: 0.7 },
        uColorA: { value: new THREE.Color('#ff5a5f') },
        uColorB: { value: new THREE.Color('#2ec4b6') }
      },
      vertexShader: `
        attribute vec3 offset;
        attribute vec4 seed;
        uniform float uTime;
        uniform float uBass, uMid, uHigh, uInt;
        varying float vGlow;
        void main(){
          float t = uTime + seed.x*10.0;
          vec3 pos = offset;
          // curl-ish motion
          pos.xyz += vec3(
            sin(t*0.31+seed.y*6.2831),
            cos(t*0.21+seed.z*6.2831),
            sin(t*0.17+seed.w*6.2831)
          ) * (0.5 + uInt*1.5);
          // audio displacement
          pos *= 1.0 + uBass*0.25 + uMid*0.1;
          vGlow = uHigh * 0.9 + uMid*0.2;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = 1.5 + uBass*6.0 + uHigh*2.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColorA, uColorB;
        varying float vGlow;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.6, 0.0, d);
          vec3 col = mix(uColorA, uColorB, vGlow);
          gl_FragColor = vec4(col, a);
        }
      `
    })
    this.mat = mat
    this.mesh = new THREE.Points(geo, mat)
    this.scene.add(this.mesh)
  }
  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
  }
  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uColorA.value.set(p.primary)
    this.mat.uniforms.uColorB.value.set(p.secondary)
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}