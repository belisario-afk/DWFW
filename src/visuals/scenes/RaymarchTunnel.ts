import * as THREE from 'three'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

export class RaymarchTunnelScene extends SceneBase implements BaseScene {
  private quad!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  private uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1,1) },
    uBands: { value: new THREE.Vector4(0,0,0,0) }, // bass, lowMid, mid, highs
    uCentroid: { value: 0.5 },
    uPrimary: { value: new THREE.Color('#ff5a5f') },
    uSecondary: { value: new THREE.Color('#2ec4b6') },
    uTert: { value: new THREE.Color('#ffd166') },
    uBG: { value: new THREE.Color('#0a0a0a') }
  }

  async init(scene: THREE.Scene): Promise<void> {
    const geom = new THREE.PlaneGeometry(2, 2)
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `void main(){ gl_Position = vec4(position,1.0); }`,
      fragmentShader: this.frag(),
      depthWrite: false
    })
    this.quad = new THREE.Mesh(geom, this.mat)
    this.quad.frustumCulled = false
    scene.add(this.quad)
    this.onResize()
    addEventListener('resize', this.onResize)
  }

  private onResize = () => {
    this.uniforms.uRes.value.set(innerWidth, innerHeight)
  }

  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    this.uniforms.uTime.value = t
    this.uniforms.uBands.value.set(
      THREE.MathUtils.clamp(f.bands.bass*2.5, 0, 1),
      THREE.MathUtils.clamp(f.bands.lowMid*2.3, 0, 1),
      THREE.MathUtils.clamp(f.bands.mid*2.0, 0, 1),
      THREE.MathUtils.clamp(f.bands.highs*1.8, 0, 1)
    )
    this.uniforms.uCentroid.value = THREE.MathUtils.clamp(f.spectralCentroid/9000, 0, 1)

    // Subtle camera FOV wobble via engine camera (optional)
    if (f.beatConfidence > 0.4) {
      const ph = f.beatPhase
      this.engine.camera.fov = 60 + Math.sin(ph*6.2831)*1.2
      this.engine.camera.updateProjectionMatrix()
    }
  }

  setPalette(p: Palette): void {
    (this.uniforms.uPrimary.value as THREE.Color).set(p.primary)
    (this.uniforms.uSecondary.value as THREE.Color).set(p.secondary)
    (this.uniforms.uTert.value as THREE.Color).set(p.tert)
    (this.uniforms.uBG.value as THREE.Color).set(p.bg)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.quad)
    ;(this.quad.geometry as THREE.BufferGeometry).dispose()
    this.mat.dispose()
    removeEventListener('resize', this.onResize)
  }

  private frag(): string {
    return `
      precision highp float;
      uniform float uTime;
      uniform vec2 uRes;
      uniform vec4 uBands; // bass, lowMid, mid, highs
      uniform float uCentroid;
      uniform vec3 uPrimary, uSecondary, uTert, uBG;

      // SDF helpers
      float sdTorus( vec3 p, vec2 t ) {
        vec2 q = vec2(length(p.xz)-t.x,p.y);
        return length(q)-t.y;
      }
      float sdCappedCylinder( vec3 p, float h, float r ){
        vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(r,h);
        return min(max(d.x,d.y),0.0) + length(max(d,0.0));
      }
      mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

      // Map scene distance with audio-driven twist and radius
      float map(vec3 p){
        float twist = (0.35 + uBands.x*0.5) * 0.7;
        float z = p.z + uTime * (1.8 + uBands.x*1.2);
        float a = z * twist;
        p.xy = rot(a) * p.xy;

        float rad = 1.7 + uBands.y*0.6 + 0.25*sin(z*0.7);
        float tube = sdCappedCylinder(p, 8.0, rad);
        float rims = sdTorus(p, vec2(rad*0.75, 0.12 + uBands.w*0.15));
        return min(tube, rims);
      }

      vec3 getNormal(vec3 p){
        float e = 0.001;
        vec2 h = vec2(1.0,-1.0)*0.5773;
        return normalize( h.xyy*map(p+h.xyy*e) +
                          h.yyx*map(p+h.yyx*e) +
                          h.yxy*map(p+h.yxy*e) +
                          h.xxx*map(p+h.xxx*e) );
      }

      void main(){
        vec2 uv = (gl_FragCoord.xy*2.0 - uRes) / min(uRes.x, uRes.y);

        // Ray
        vec3 ro = vec3(0.0, 0.0, 4.5);
        vec3 rd = normalize(vec3(uv, -1.8)); // pinhole

        // Raymarch
        float t = 0.0;
        float glow = 0.0;
        vec3 col = uBG;
        bool hit = false;
        for(int i=0;i<96;i++){
          vec3 pos = ro + rd * t;
          float d = map(pos);
          glow += exp(-abs(d)*12.0) * (0.012 + 0.02*uBands.z);
          if (d < 0.001){
            // Shade
            vec3 n = getNormal(pos);
            vec3 l = normalize(vec3(0.6, 0.8, 0.4));
            float diff = clamp(dot(n,l), 0.0, 1.0);
            float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 1.8);
            vec3 a = mix(uPrimary, uSecondary, 0.5 + 0.5*sin(uTime*0.2 + pos.z*0.3));
            vec3 b = mix(uTert, uSecondary, 0.5 + 0.5*sin(uTime*0.3 + pos.x*0.5));
            col = mix(a, b, 0.4 + 0.6*uCentroid) * (0.2 + 0.8*diff) + rim * 0.9;
            hit = true;
            break;
          }
          t += clamp(d*0.7, 0.01, 0.2);
          if (t > 24.0) break;
        }

        // Composite
        vec3 fogCol = mix(uBG, uSecondary, 0.08 + 0.15*uCentroid);
        float fog = 1.0 - exp(-t*0.07);
        vec3 glowCol = mix(uPrimary, uTert, 0.5 + 0.5*uCentroid);
        vec3 outCol = mix(col, fogCol, fog) + glowCol * glow;
        gl_FragColor = vec4(outCol, 1.0);
      }
    `
  }
}