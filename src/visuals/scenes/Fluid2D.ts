import * as THREE from 'three'
import { BaseScene } from '@visuals/baseScene'

export class FluidScene extends BaseScene {
  private scene!: THREE.Scene
  private quad!: THREE.Mesh
  private viewMat!: THREE.ShaderMaterial

  private simMat!: THREE.ShaderMaterial
  private rtA!: THREE.WebGLRenderTarget
  private rtB!: THREE.WebGLRenderTarget
  private fsScene!: THREE.Scene
  private fsCam!: THREE.OrthographicCamera
  private simMesh!: THREE.Mesh

  private t = 0
  private res = 1024

  async init(scene: THREE.Scene) {
    this.scene = scene

    const pars = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false } as THREE.WebGLRenderTargetOptions
    this.rtA = new THREE.WebGLRenderTarget(this.res, this.res, pars)
    this.rtB = new THREE.WebGLRenderTarget(this.res, this.res, pars)

    this.fsScene = new THREE.Scene()
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rtA.texture },
        uTime: { value: 0 },
        uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uRMS: { value: 0 },
        uColA: { value: new THREE.Color(this.engine.palette.primary) },
        uColB: { value: new THREE.Color(this.engine.palette.secondary) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec3 uColA, uColB;
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
          vec2 uv = vUv;
          float t = uTime;
          vec2 vel = vec2(
            sin(uv.y*10.0 + t*0.6) * (0.002 + 0.004*uBass),
            cos(uv.x*10.0 - t*0.5) * (0.002 + 0.004*uMid)
          );
          vel += (vec2(noise(uv*6.0 + t*0.1), noise(uv*6.0 - t*0.13)) - 0.5) * 0.003 * (1.0 + uHigh);
          vec3 prev = texture2D(uTex, uv - vel).rgb * 0.996;

          vec3 inj = mix(uColA, uColB, smoothstep(0.0,1.0,noise(uv*5.0 + t*0.3)));
          float pulse = smoothstep(0.7, 1.0, uRMS + uBass*1.2);
          prev += inj * pulse * 0.04;

          gl_FragColor = vec4(prev, 1.0);
        }
      `
    })

    this.simMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMat)
    this.fsScene.add(this.simMesh)

    this.viewMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.rtA.texture } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        void main(){
          vec3 c = texture2D(uTex, vUv).rgb;
          c = pow(c, vec3(0.85));
          gl_FragColor = vec4(c, 1.0);
        }
      `
    })

    const geo = new THREE.PlaneGeometry(2, 2)
    this.quad = new THREE.Mesh(geo, this.viewMat)
    this.scene.add(this.quad)
  }

  update(t: number, dt: number): void {
    this.t += dt
    const f = this.engine.analyzer.frame
    this.simMat.uniforms.uTime.value = this.t
    this.simMat.uniforms.uBass.value = f.bands.bass
    this.simMat.uniforms.uMid.value = f.bands.mid
    this.simMat.uniforms.uHigh.value = f.bands.highs
    this.simMat.uniforms.uRMS.value = f.rms

    const r = this.engine.renderer
    r.setRenderTarget(this.rtB)
    r.render(this.fsScene, this.fsCam)
    r.setRenderTarget(null)

    const tmp = this.rtA; this.rtA = this.rtB; this.rtB = tmp
    this.simMat.uniforms.uTex.value = this.rtA.texture
    this.viewMat.uniforms.uTex.value = this.rtA.texture
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    this.simMat.uniforms.uColA.value.set(p.primary)
    this.simMat.uniforms.uColB.value.set(p.secondary)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.quad)
    this.quad.geometry.dispose()
    this.viewMat.dispose()
    this.simMat.dispose()
    this.rtA.dispose()
    this.rtB.dispose()
  }
}