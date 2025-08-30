import * as THREE from 'three'
import { BaseScene } from '@visuals/engine'

export class TunnelScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.PlaneGeometry(2, 2)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uSteps: { value: 512.0 },
        uColA: { value: new THREE.Color('#00ffff') },
        uColB: { value: new THREE.Color('#ff00ff') }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uBass, uMid, uHigh, uSteps;
        uniform vec3 uColA, uColB;

        float sdTorus( vec3 p, vec2 t )
        {
          vec2 q = vec2(length(p.xz)-t.x,p.y);
          return length(q)-t.y;
        }

        vec3 rotY(vec3 p, float a) {
          float c = cos(a), s = sin(a);
          return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
        }

        float map(vec3 p){
          p = rotY(p, sin(uTime*0.3)*0.5);
          float d = sdTorus(p, vec2(1.2 + 0.2*sin(uTime*0.5) + uBass*0.4, 0.25 + 0.1*uMid));
          return d;
        }

        vec3 shade(vec3 p, vec3 rd){
          vec2 e = vec2(0.01, 0.0);
          float d = map(p);
          vec3 n = normalize(vec3(
            map(p+e.xyy)-d,
            map(p+e.yxy)-d,
            map(p+e.yyx)-d
          ));
          float diff = clamp(dot(n, -rd), 0.0, 1.0);
          vec3 col = mix(uColA, uColB, diff + uHigh*0.5);
          return col * (diff + 0.2);
        }

        void main(){
          vec3 ro = vec3(0.0, 0.0, -3.0);
          vec3 rd = normalize(vec3(vUv, 1.8));
          float t = 0.0;
          float d;
          vec3 p;
          float steps = uSteps;
          for (int i=0;i<1024;i++){
            if (float(i) > steps) break;
            p = ro + rd * t;
            d = map(p);
            if (d<0.001) break;
            t += d * 0.75;
          }
          vec3 col = shade(p, rd);
          // neon glow
          col += 0.08 / (abs(map(p))+0.001);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
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
    this.mat.uniforms.uColA.value.set(p.primary)
    this.mat.uniforms.uColB.value.set(p.secondary)
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}