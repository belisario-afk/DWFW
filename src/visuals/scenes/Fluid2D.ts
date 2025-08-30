import * as THREE from 'three'
import { BaseScene } from '@visuals/engine'

export class FluidScene extends BaseScene {
  private scene!: THREE.Scene
  private mesh!: THREE.Mesh
  private mat!: THREE.ShaderMaterial
  private rt!: THREE.WebGLRenderTarget
  private rt2!: THREE.WebGLRenderTarget
  private quad!: THREE.Mesh
  private res = 1024
  private clock = 0

  async init(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.PlaneGeometry(2, 2)
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }
    this.rt = new THREE.WebGLRenderTarget(this.res, this.res, rtOpts)
    this.rt2 = new THREE.WebGLRenderTarget(this.res, this.res, rtOpts)

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rt.texture },
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uPalette: { value: new THREE.Vector3(1, 0.35, 0.1) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uTime, uBass, uMid, uHigh;
        uniform vec3 uPalette;

        // simple advection step
        float rand(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 uv = vUv;
          vec2 flow = vec2(
            sin(uTime*0.5 + uv.y*10.0)*0.002*(0.5+uBass),
            cos(uTime*0.6 + uv.x*10.0)*0.002*(0.5+uMid)
          );
          vec3 c = texture2D(uTex, uv - flow).rgb * 0.995;
          // dye injection on beats
          if (uHigh > 0.35 && rand(uv + uTime) > 0.995) {
            c += vec3(uPalette) * 0.5;
          }
          c += vec3(uv, 1.0)*0.0005*(uMid+uHigh);
          gl_FragColor = vec4(c, 1.0);
        }
      `
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.scene.add(this.mesh)
  }

  update(t: number, dt: number): void {
    this.clock += dt
    const f = this.engine.analyzer.frame
    const r = this.engine.renderer
    // ping-pong
    this.mat.uniforms.uTex.value = this.rt.texture
    this.mat.uniforms.uTime.value = this.clock
    this.mat.uniforms.uBass.value = f.bands.bass
    this.mat.uniforms.uMid.value = f.bands.mid
    this.mat.uniforms.uHigh.value = f.bands.highs

    r.setRenderTarget(this.rt2)
    r.render(this.scene, this.engine.camera)
    r.setRenderTarget(null)

    // swap
    const tmp = this.rt
    this.rt = this.rt2
    this.rt2 = tmp
    this.mat.uniforms.uTex.value = this.rt.texture
  }

  setPalette(p: { primary: string; secondary: string; tert: string; bg: string }): void {
    const col = new THREE.Color(p.secondary)
    this.mat.uniforms.uPalette.value.set(col.r, col.g, col.b)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mat.dispose()
    this.rt.dispose()
    this.rt2.dispose()
  }
}