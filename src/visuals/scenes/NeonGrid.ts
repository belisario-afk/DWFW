import * as THREE from 'three'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

const vert = `
uniform float uTime;
uniform float uWarp;
varying vec3 vPos;
varying vec2 vUv2;
void main() {
  vec3 p = position;
  // Gentle Z-warp for perspective pulses
  float z = p.z;
  p.y += sin(z*0.5 + uTime*1.2) * 0.02 * uWarp;
  vPos = p;
  vUv2 = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const frag = `
precision highp float;
varying vec3 vPos;
varying vec2 vUv2;

uniform float uTime;
uniform float uBass;
uniform float uCentroid;
uniform float uSweep; // decaying sweep value [0..1]
uniform vec3 uAcc1;
uniform vec3 uAcc2;
uniform vec3 uBG;
uniform float uFogD;
uniform float uHueShift;

// Hash helpers
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 17143.123); }

// Hue rotate (approx)
vec3 hueShift(vec3 c, float a){
  const mat3 R = mat3(
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114
  );
  const mat3 I = mat3(
    0.701, -0.587, -0.114,
    -0.299, 0.413, -0.114,
    -0.3, -0.588, 0.886
  );
  return clamp((R + I * cos(a) + cross(mat3(0,0,0,0,0,-1,0,1,0), I) * sin(a)) * c, 0.0, 1.0);
}

float gridLine(float x, float spacing, float width){
  float gx = abs(fract(x/spacing) - 0.5);
  float d = smoothstep(width*0.9, width, gx);
  return 1.0 - d;
}

void main(){
  // World coords projected across plane
  vec3 p = vPos;
  // Grid parameters
  float spacing = mix(0.8, 1.4, 0.2 + 0.8*clamp(uCentroid,0.0,1.0));
  float lw = mix(0.008, 0.025, 0.2 + uBass*0.8);
  // Animated sweep line
  float sweep = exp(-3.0*uSweep) * smoothstep(0.0, 1.0, sin(uTime*6.2831));

  float gx = gridLine(p.x + sin(uTime*0.8 + p.z*0.5)*0.15*uBass, spacing, lw);
  float gz = gridLine(p.z + cos(uTime*0.7 + p.x*0.35)*0.12*uBass, spacing, lw);

  float grid = max(gx, gz);

  // Horizon sun (screen-space y ~ top)
  float sunY = 0.25;
  float sun = smoothstep(0.18, 0.0, abs(vUv2.y - (1.0 - sunY))) * 0.8;
  // Fog
  float fog = exp(-uFogD * (p.z + 10.0) * 0.25);

  vec3 gridCol = mix(uAcc1, uAcc2, 0.5 + 0.5*sin(uTime*0.25 + p.z*0.1));
  gridCol = hueShift(gridCol, uHueShift + (uCentroid-0.5)*0.8);
  vec3 col = uBG;
  col = mix(col, gridCol, grid * fog);
  col += sun * hueShift(uAcc2, -0.4);
  col += sweep * 0.07;

  gl_FragColor = vec4(col, 1.0);
}
`

export class NeonGridScene extends SceneBase implements BaseScene {
  private plane!: THREE.Mesh
  private uniforms = {
    uTime: { value: 0 },
    uWarp: { value: 0.2 },
    uBass: { value: 0 },
    uCentroid: { value: 0.5 },
    uSweep: { value: 0 },
    uAcc1: { value: new THREE.Color('#ff3ec8').toArray() as unknown as THREE.Vector3 },
    uAcc2: { value: new THREE.Color('#2ec4b6').toArray() as unknown as THREE.Vector3 },
    uBG: { value: new THREE.Color('#0a0a0a').toArray() as unknown as THREE.Vector3 },
    uFogD: { value: 0.03 },
    uHueShift: { value: 0.0 }
  }

  async init(scene: THREE.Scene): Promise<void> {
    const geom = new THREE.PlaneGeometry(40, 80, 2, 2)
    geom.rotateX(-Math.PI/2)
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      transparent: false
    })
    this.plane = new THREE.Mesh(geom, mat)
    this.plane.position.z = -10
    scene.add(this.plane)

    // Subtle haze box to help bloom
    const hemi = new THREE.HemisphereLight(0xffffff, 0x101010, 0.35)
    scene.add(hemi)
  }

  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    // Simple EMA smoothing
    const ema = (cur: number, target: number, a: number) => cur + (target - cur) * (1 - Math.exp(-a * dt))

    const bass = THREE.MathUtils.clamp(f.bands.bass*1.8, 0, 1)
    const centroidNorm = THREE.MathUtils.clamp(f.spectralCentroid / 8000, 0, 1)
    this.uniforms.uBass.value = ema(this.uniforms.uBass.value, bass, 6.0)
    this.uniforms.uCentroid.value = ema(this.uniforms.uCentroid.value, centroidNorm, 4.0)
    this.uniforms.uTime.value = t
    this.uniforms.uWarp.value = ema(this.uniforms.uWarp.value, 0.15 + bass*0.2, 4.0)

    // Onset sweep (decay towards 0)
    const sweep = Math.max(0, this.uniforms.uSweep.value - dt*2.5)
    this.uniforms.uSweep.value = sweep + (f.onset ? 0.6 : 0)

    // Gentle camera dolly on beats if phase known
    if (f.beatConfidence > 0.4) {
      const ph = f.beatPhase // 0..1
      const z = -10 - Math.sin(ph * Math.PI*2.0) * (0.4 + 0.4*bass)
      this.engine.camera.position.z = z
      this.engine.camera.lookAt(0, 0, -12)
    }
  }

  setPalette(p: Palette): void {
    ;(this.uniforms.uAcc1.value as any).set(p.primary)
    ;(this.uniforms.uAcc2.value as any).set(p.secondary)
    ;(this.uniforms.uBG.value as any).set(p.bg)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.plane)
    ;(this.plane.geometry as THREE.BufferGeometry).dispose()
    ;(this.plane.material as THREE.Material).dispose()
  }
}