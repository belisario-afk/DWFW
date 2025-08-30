import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class TerrainScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  private t = 0

  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.PlaneGeometry(40, 40, 300, 300)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
        uColDeep: { value: new THREE.Color('#0a0b12') },
        uColLow: { value: new THREE.Color(this.engine.palette.primary) },
        uColMid: { value: new THREE.Color(this.engine.palette.secondary) },
        uColHigh: { value: new THREE.Color(this.engine.palette.tert) }
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
        float fbm(vec2 p){
          float v = 0.0; float a = 0.5;
          for(int i=0; i<6; i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
          return v;
        }
        void main(){
          vUv = uv;
          vec3 pos = position;
          float t = uTime*0.2;
          float amp = 2.2 + uBass*8.0 + uMid*4.0;
          float h = fbm(uv*6.0 + t) * amp;
          h += sin((uv.x + uv.y + t)*3.14159) * (0.2 + uHigh*0.8);
          pos.z += h;
          vH = h;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv; varying float vH;
        uniform vec3 uColDeep, uColLow, uColMid, uColHigh;
        void main(){
          float h = clamp(vH/6.0, 0.0, 1.0);
          vec3 col = mix(uColLow, uColMid, smoothstep(0.2, 0.6, h));
          col = mix(col, uColHigh, smoothstep(0.6, 1.0, h));
          col = mix(uColDeep, col, smoothstep(0.05, 0.85, vUv.y));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.rotation.x = -Math.PI / 3
    this.scene.add(this.mesh)
  }

  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    this.t += dt
    this.mat.uniforms.uTime.value = this.t
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
    this.engine.camera.position.x = Math.sin(this.t * 0.15) * 2.0
    this.engine.camera.position.y = 2.0 + Math.sin(this.t * 0.07) * 0.5
    this.engine.camera.lookAt(0, 0, 0)
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uColLow.value.set(p.primary)
    this.mat.uniforms.uColMid.value.set(p.secondary)
    this.mat.uniforms.uColHigh.value.set(p.tert)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}