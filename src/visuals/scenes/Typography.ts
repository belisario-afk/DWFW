import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

/**
 * Premium typography-like visualizer:
 * - Circular spectrum bars (12 chroma + broadband)
 * - Beat pulse, centroid-driven spread
 * - High-contrast neon palette blending
 */
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
        uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
        uCentroid: { value: 2000 },
        uPrimary: { value: new THREE.Color(this.engine.palette.primary) },
        uSecondary: { value: new THREE.Color(this.engine.palette.secondary) },
        uTertiary: { value: new THREE.Color(this.engine.palette.tert) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uRMS, uBass, uMid, uHigh, uCentroid;
        uniform vec3 uPrimary, uSecondary, uTertiary;

        float ring(vec2 p, float r, float w){
          float d = abs(length(p) - r);
          return smoothstep(w, 0.0, d);
        }

        void main(){
          vec2 p = vUv;
          float t = uTime;

          // Base neon grid
          float g = (sin(p.x*20.0 + t*2.0)*0.5+0.5) * (cos(p.y*24.0 - t*2.2)*0.5+0.5);
          g *= 0.05;

          // Circular bars around a ring, expand with centroid
          float baseR = 0.3 + clamp(uCentroid/8000.0, 0.0, 1.0)*0.25 + uRMS*0.15;
          float r1 = ring(p, baseR, 0.02 + uRMS*0.04);

          // Radial bars (12 segments)
          float ang = atan(p.y, p.x);
          float seg = floor((ang + 3.14159) / (6.28318/12.0));
          float bar = step(0.48, fract((ang + 3.14159) * (12.0 / 6.28318)));
          float amp = 0.3 + uBass*1.8 + uMid*1.2 + uHigh*0.6;
          float bars = smoothstep(baseR-0.03, baseR+amp*0.15, length(p)) * bar;

          vec3 col = mix(uSecondary, uPrimary, r1);
          col += vec3(0.7,0.2,1.0) * bars * 0.8;
          col += uTertiary * g;

          // Center pulse
          float pulse = smoothstep(0.25, 0.0, length(p)) * (uRMS*1.2 + uHigh*0.5);
          col += vec3(1.0,0.8,0.2) * pulse * 0.35;

          // Vignette
          float vig = smoothstep(1.15, 0.45, length(p));
          col *= vig;

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
    this.mat.uniforms.uRMS.value = f.rms
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs
    this.mat.uniforms.uCentroid.value = f.spectralCentroid
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uPrimary.value.set(p.primary)
    this.mat.uniforms.uSecondary.value.set(p.secondary)
    this.mat.uniforms.uTertiary.value.set(p.tert)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}