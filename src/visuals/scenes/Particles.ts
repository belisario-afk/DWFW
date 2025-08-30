import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class ParticlesScene extends BaseScene {
  private scene!: THREE.Scene
  private pts!: THREE.Points
  private mat!: THREE.ShaderMaterial
  private coverTex: THREE.Texture | null = null
  private count = 0
  private spread = 6.0

  async init(scene: THREE.Scene) {
    this.scene = scene
    // Pull config
    this.count = this.engine.config.particles.count
    this.spread = this.engine.config.particles.spread

    if (this.engine.albumURL) {
      this.coverTex = await new Promise<THREE.Texture>((resolve) => {
        new THREE.TextureLoader().load(this.engine.albumURL!, (t) => { t.colorSpace = THREE.SRGBColorSpace; resolve(t) })
      })
    }

    const positions = new Float32Array(this.count * 3)
    const seeds = new Float32Array(this.count * 4)
    for (let i = 0; i < this.count; i++) {
      const u = Math.random(), v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      const r = this.spread * Math.cbrt(Math.random())
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uRMS: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
        uColA: { value: new THREE.Color(this.engine.palette.primary) },
        uColB: { value: new THREE.Color(this.engine.palette.secondary) },
        uColC: { value: new THREE.Color(this.engine.palette.tert) },
        uCover: { value: this.coverTex },
        uSize: { value: this.engine.config.particles.size },
        uIntensity: { value: this.engine.config.intensity },
        uSpeed: { value: this.engine.config.speed }
      },
      vertexShader: `
        precision highp float;
        attribute vec4 seed;
        uniform float uTime, uRMS, uBass, uMid, uHigh, uSize, uIntensity, uSpeed;
        varying float vGlow;
        varying vec3 vDir;

        vec3 flow(vec3 p, float t){
          return vec3(
            sin(0.16*p.y + t*0.6),
            cos(0.12*p.x - t*0.5),
            sin(0.14*p.z + t*0.7)
          );
        }

        void main(){
          vec3 P = position;
          float t = uTime * uSpeed + seed.x*10.0;
          vec3 vel = flow(P*0.55 + seed.yzw*4.0, t);
          P += vel * (0.22 + uIntensity*0.4 + uBass*0.8);
          P *= 1.0 + uRMS*0.15;

          vGlow = uHigh*1.1 + uMid*0.3;
          vDir = normalize(P);

          float ps = uSize * (1.0 + uBass*3.5 + uHigh*1.2);
          gl_PointSize = ps;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColA, uColB, uColC;
        uniform sampler2D uCover;
        varying float vGlow; varying vec3 vDir;

        void main(){
          vec2 pc = gl_PointCoord - 0.5;
          float r = length(pc);
          float a = smoothstep(0.55, 0.0, r);
          vec2 suv = vec2(atan(vDir.z, vDir.x) / 6.2831 + 0.5, asin(clamp(vDir.y, -1.0, 1.0)) / 3.14159 + 0.5);
          vec3 cover = vec3(0.0);
          if (true) { // safe branch; some bundlers can't compare sampler2D
            cover = texture2D(uCover, suv).rgb;
          }
          vec3 base = mix(uColA, uColB, vGlow);
          base = mix(base, uColC, 0.35*vGlow);
          if (cover.r + cover.g + cover.b > 0.01) base = mix(base, cover, 0.22);
          float core = smoothstep(0.2, 0.0, r);
          vec3 col = base * (0.45*a + 0.65*core);
          gl_FragColor = vec4(col, a);
        }
      `
    })

    this.pts = new THREE.Points(geo, this.mat)
    this.scene.add(this.pts)
  }

  update(t: number, dt: number): void {
    const f = this.engine.analyzer.frame
    const u = this.mat.uniforms
    u.uTime.value = t
    u.uRMS.value = f.rms
    u.uBass.value = f.bands.bass
    u.uMid.value = f.bands.mid
    u.uHigh.value = f.bands.highs
    // Sync to live config in case user tweaks sliders
    u.uSize.value = this.engine.config.particles.size
    u.uIntensity.value = this.engine.config.intensity
    u.uSpeed.value = this.engine.config.speed
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.mat.uniforms.uColA.value.set(p.primary)
    this.mat.uniforms.uColB.value.set(p.secondary)
    this.mat.uniforms.uColC.value.set(p.tert)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.pts)
    this.pts.geometry.dispose()
    this.mat.dispose()
    if (this.coverTex) this.coverTex.dispose()
  }
}