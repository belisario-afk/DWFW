import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

/**
 * Cinematic fluid:
 * - High-res feedback with advected dye
 * - Audio-based injection and turbulence
 * - Smooth, bloom-ready gradients
 */
export class FluidScene extends BaseScene {
  private scene!: THREE.Scene
  private quad!: THREE.Mesh
  private simMat!: THREE.ShaderMaterial
  private viewMat!: THREE.ShaderMaterial
  private rtA!: THREE.WebGLRenderTarget
  private rtB!: THREE.WebGLRenderTarget
  private clock = 0
  private res = 1024
  private coverTex: THREE.Texture | null = null

  async init(scene: THREE.Scene) {
    this.scene = scene

    if (this.engine.albumURL) {
      this.coverTex = await new Promise<THREE.Texture>((resolve) => {
        new THREE.TextureLoader().load(this.engine.albumURL!, (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          resolve(t)
        })
      })
    }

    const gl = this.engine.renderer
    const pars = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }
    this.rtA = new THREE.WebGLRenderTarget(this.res, this.res, pars)
    this.rtB = new THREE.WebGLRenderTarget(this.res, this.res, pars)

    const geo = new THREE.PlaneGeometry(2, 2)

    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rtA.texture },
        uTime: { value: 0 },
        uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uRMS: { value: 0 },
        uCover: { value: this.coverTex },
        uPaletteA: { value: new THREE.Color(this.engine.palette.primary) },
        uPaletteB: { value: new THREE.Color(this.engine.palette.secondary) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex, uCover;
        uniform vec3 uPaletteA, uPaletteB;
        uniform float uTime, uBass, uMid, uHigh, uRMS;

        vec2 hash2(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f*f*(3.0-2.0*f);
          float a = dot(hash2(i+vec2(0,0)), f-vec2(0,0));
          float b = dot(hash2(i+vec2(1,0)), f-vec2(1,0));
          float c = dot(hash2(i+vec2(0,1)), f-vec2(0,1));
          float d = dot(hash2(i+vec2(1,1)), f-vec2(1,1));
          return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
        }

        void main(){
          // Velocity field driven by audio
          vec2 uv = vUv;
          float t = uTime;
          vec2 vel = vec2(
            sin(uv.y*10.0 + t*0.6) * (0.002 + 0.004*uBass),
            cos(uv.x*10.0 - t*0.5) * (0.002 + 0.004*uMid)
          );
          // Slight turbulent curl
          vel += (vec2(noise(uv*6.0 + t*0.1), noise(uv*6.0 - t*0.13)) - 0.5) * 0.003 * (1.0 + uHigh);

          vec3 prev = texture2D(uTex, uv - vel).rgb * 0.996;

          // Inject color based on cover/palette + beats
          vec3 inj = mix(uPaletteA, uPaletteB, smoothstep(0.0,1.0,noise(uv*5.0 + t*0.3)));
          if (uCover != sampler2D(0)) {
            vec3 cov = texture2D(uCover, uv).rgb;
            inj = mix(inj, cov, 0.4);
          }
          float pulse = smoothstep(0.7, 1.0, uRMS + uBass*1.2);
          prev += inj * pulse * 0.04;

          gl_FragColor = vec4(prev, 1.0);
        }
      `
    })

    this.viewMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rtA.texture },
        uTint: { value: new THREE.Color(1,1,1) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec3 uTint;
        void main(){
          vec3 c = texture2D(uTex, vUv).rgb;
          // Soft gamma-ish curve for punch
          c = pow(c, vec3(0.85));
          gl_FragColor = vec4(c * uTint, 1.0);
        }
      `
    })

    this.quad = new THREE.Mesh(geo, this.viewMat)
    this.scene.add(this.quad)
  }

  update(t: number, dt: number): void {
    this.clock += dt
    const f = this.engine.analyzer.frame

    // SIM pass
    this.simMat.uniforms.uTime.value = this.clock
    this.simMat.uniforms.uBass.value = f.bands.bass
    this.simMat.uniforms.uMid.value = f.bands.mid
    this.simMat.uniforms.uHigh.value = f.bands.highs
    this.simMat.uniforms.uRMS.value = f.rms
    this.simMat.uniforms.uPaletteA.value.set(this.engine.palette.primary)
    this.simMat.uniforms.uPaletteB.value.set(this.engine.palette.secondary)

    const r = this.engine.renderer
    r.setRenderTarget(this.rtB)
    r.render(new THREE.Mesh(new THREE.PlaneGeometry(2,2), this.simMat), this.engine.camera)
    r.setRenderTarget(null)

    // Swap
    const tmp = this.rtA; this.rtA = this.rtB; this.rtB = tmp
    this.simMat.uniforms.uTex.value = this.rtA.texture
    this.viewMat.uniforms.uTex.value = this.rtA.texture
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    // Tint handled per-frame; background updated by engine
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.quad)
    this.quad.geometry.dispose()
    this.simMat.dispose()
    this.viewMat.dispose()
    this.rtA.dispose()
    this.rtB.dispose()
    if (this.coverTex) this.coverTex.dispose()
  }
}