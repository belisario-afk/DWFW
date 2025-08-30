import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

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
        uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
        uSteps: { value: 640 },
        uColA: { value: new THREE.Color(this.engine.palette.primary) },
        uColB: { value: new THREE.Color(this.engine.palette.secondary) },
        uColC: { value: new THREE.Color(this.engine.palette.tert) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uBass, uMid, uHigh, uSteps;
        uniform vec3 uColA, uColB, uColC;

        float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; }
        float sdArch(vec3 p){ p.x = abs(p.x); vec2 d=abs(vec2(length(p.xz)-1.0, p.y))-vec2(0.05,0.4); return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }
        vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }

        float map(vec3 p){
          float bend = 0.25 * sin(uTime*0.4) + uMid*0.4;
          p = rotY(p, bend);
          float t = sdTorus(p, vec2(1.2 + uBass*0.4, 0.22 + uMid*0.18));
          float a = sdArch(p*vec3(1.0,1.0,1.2));
          return min(t, a);
        }
        vec3 shade(vec3 p, vec3 ro, vec3 rd){
          float d0 = map(p);
          vec2 e = vec2(0.01,0.0);
          vec3 n = normalize(vec3(map(p+e.xyy)-d0, map(p+e.yxy)-d0, map(p+e.yyx)-d0));
          float diff = clamp(dot(n, -rd), 0.0, 1.0);
          vec3 base = mix(uColA, uColB, 0.5 + 0.5*diff);
          base = mix(base, uColC, 0.25 + 0.25*uHigh);
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
          float emis = 0.08 / (abs(d0)+0.001) + 0.05 * rim;
          return base * (0.3 + diff*0.9) + emis;
        }
        void main(){
          vec3 ro = vec3(0.0, 0.0, -3.0);
          vec3 rd = normalize(vec3(vUv, 1.6 + uHigh*0.3));
          float t = 0.0, d; vec3 p=ro;
          float steps = uSteps;
          for (int i=0;i<1024;i++){
            if (float(i) > steps) break;
            p = ro + rd * t;
            d = map(p);
            if (d < 0.001) break;
            t += d * 0.75;
          }
          vec3 col = shade(p, ro, rd);
          float fog = exp(-0.04*t);
          col = mix(vec3(0.02,0.02,0.03), col, fog);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.scene.add(this.mesh)
  }

  update(t: number): void {
    const f = this.engine.analyzer.frame
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uColA.value.set(p.primary)
    this.mat.uniforms.uColB.value.set(p.secondary)
    this.mat.uniforms.uColC.value.set(p.tert)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}