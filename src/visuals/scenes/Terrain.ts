import * as THREE from 'three'
import { BaseScene } from '@visuals/engine'

export class TerrainScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  private t = 0
  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.PlaneGeometry(20, 20, 256, 256)
    this.mat = new THREE.ShaderMaterial({
      wireframe: false,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uColor: { value: new THREE.Color('#ffd166') }
      },
      vertexShader: `
        varying vec2 vUv; varying float vH;
        uniform float uTime, uBass, uMid, uHigh;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          float a = hash(i);
          float b = hash(i+vec2(1,0));
          float c = hash(i+vec2(0,1));
          float d = hash(i+vec2(1,1));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a,b,u.x)+ (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        void main(){
          vUv = uv;
          vec3 pos = position;
          float amp = 0.5 + uBass*2.0 + uMid*1.0;
          float h = 0.0;
          h += noise(uv*12.0 + uTime*0.1) * 0.5;
          h += noise(uv*24.0 + uTime*0.2) * 0.25;
          h += noise(uv*48.0 + uTime*0.4) * 0.125*uHigh;
          h *= amp;
          pos.z += h;
          vH = h;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv; varying float vH;
        uniform vec3 uColor;
        void main(){
          float shade = smoothstep(0.0, 2.0, vH);
          vec3 col = mix(vec3(0.02,0.02,0.03), uColor, shade);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.rotation.x = -Math.PI/3
    this.scene.add(this.mesh)
  }
  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    this.t += dt
    this.mat.uniforms.uTime.value = this.t
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
  }
  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uColor.value.set(p.tert)
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}