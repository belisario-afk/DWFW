import * as THREE from 'three'
import type { BaseScene } from '@visuals/baseScene'
import { BaseScene as SceneBase } from '@visuals/baseScene'
import type { Palette } from '@visuals/engine'

export class SpectralParticlesScene extends SceneBase implements BaseScene {
  private simRes = 256 // 256x256 = 65,536 particles (iGPU safe). Try 384 on dGPU.
  private rtPos!: { ping: THREE.WebGLRenderTarget; pong: THREE.WebGLRenderTarget }
  private rtVel!: { ping: THREE.WebGLRenderTarget; pong: THREE.WebGLRenderTarget }
  private simCam!: THREE.OrthographicCamera
  private simScene!: THREE.Scene
  private quad!: THREE.Mesh
  private matVel!: THREE.ShaderMaterial
  private matPos!: THREE.ShaderMaterial

  private points!: THREE.Points
  private renderMat!: THREE.ShaderMaterial
  private renderGeom!: THREE.BufferGeometry

  private time = 0

  async init(scene: THREE.Scene): Promise<void> {
    const gl = this.engine.renderer.getContext()
    const isWebGL2 = (gl as WebGL2RenderingContext).drawBuffers !== undefined
    const floatType = isWebGL2 ? THREE.HalfFloatType : THREE.FloatType

    const mkRT = () => new THREE.WebGLRenderTarget(this.simRes, this.simRes, {
      type: floatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false
    })

    this.rtPos = { ping: mkRT(), pong: mkRT() }
    this.rtVel = { ping: mkRT(), pong: mkRT() }

    // Simulation scene (fullscreen quad)
    this.simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.simScene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }))
    this.simScene.add(this.quad)

    // Initialize textures
    this.seedRT(this.rtPos.ping, true)
    this.seedRT(this.rtVel.ping, false)
    this.seedRT(this.rtPos.pong, true)
    this.seedRT(this.rtVel.pong, false)

    // Simulation materials
    this.matVel = new THREE.ShaderMaterial({
      uniforms: {
        uPos: { value: this.rtPos.ping.texture },
        uVel: { value: this.rtVel.ping.texture },
        uTime: { value: 0 },
        uDt: { value: 0.016 },
        uBands: { value: new THREE.Vector4() }, // bass, lowMid, mid, highs
        uCentroid: { value: 0.5 },
        uDamp: { value: 0.985 },
        uAttract: { value: 0.15 },
        uTwirl: { value: 0.6 }
      },
      vertexShader: `void main(){ gl_Position = vec4(position,1.0); }`,
      fragmentShader: this.velFrag()
    })
    this.matPos = new THREE.ShaderMaterial({
      uniforms: {
        uPos: { value: this.rtPos.ping.texture },
        uVel: { value: this.rtVel.ping.texture },
        uDt: { value: 0.016 }
      },
      vertexShader: `void main(){ gl_Position = vec4(position,1.0); }`,
      fragmentShader: this.posFrag()
    })

    // Render geometry: one vertex per texel, attribute "ref" = UV
    const N = this.simRes
    const total = N * N
    const refs = new Float32Array(total * 2)
    let p = 0
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        refs[p++] = (x + 0.5) / N
        refs[p++] = (y + 0.5) / N
      }
    }
    this.renderGeom = new THREE.BufferGeometry()
    this.renderGeom.setAttribute('ref', new THREE.BufferAttribute(refs, 2))
    // dummy position to satisfy WebGL
    this.renderGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3))

    this.renderMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPos: { value: this.rtPos.ping.texture },
        uTime: { value: 0 },
        uPointSize: { value: 1.8 },
        uColorA: { value: new THREE.Color(this.engine.palette.primary) },
        uColorB: { value: new THREE.Color(this.engine.palette.secondary) },
        uColorC: { value: new THREE.Color(this.engine.palette.tert) }
      },
      vertexShader: `
        precision highp float;
        attribute vec2 ref;
        uniform sampler2D uPos;
        uniform float uPointSize;
        varying float vDepth;
        varying float vHash;
        void main(){
          vec3 P = texture2D(uPos, ref).xyz;
          vDepth = clamp((P.z + 8.0)/12.0, 0.0, 1.0);
          vHash = fract(sin(dot(ref, vec2(12.9898,78.233))) * 43758.5453);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
          float size = uPointSize * (1.0 + vHash*0.5) * (1.2 - vDepth);
          gl_PointSize = size * 1.5;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vDepth;
        varying float vHash;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = dot(uv, uv);
          float a = smoothstep(0.25, 0.0, d);
          vec3 col = mix(uColorA, uColorB, vHash);
          col = mix(col, uColorC, 0.3*(1.0 - vDepth));
          gl_FragColor = vec4(col, a);
        }
      `
    })

    this.points = new THREE.Points(this.renderGeom, this.renderMat)
    this.points.frustumCulled = false
    scene.add(this.points)

    // subtle ambient
    scene.add(new THREE.AmbientLight(0xffffff, 0.15))
    this.engine.camera.position.set(0, 0, 8)
  }

  update(t: number, dt: number): void {
    this.time += dt

    const f = this.engine.analyzer.frame
    const bands = new THREE.Vector4(
      THREE.MathUtils.clamp(f.bands.bass * 2.5, 0, 1),
      THREE.MathUtils.clamp(f.bands.lowMid * 2.0, 0, 1),
      THREE.MathUtils.clamp(f.bands.mid * 2.0, 0, 1),
      THREE.MathUtils.clamp(f.bands.highs * 1.8, 0, 1)
    )
    const centroid = THREE.MathUtils.clamp(f.spectralCentroid / 8000, 0, 1)

    // Update sim uniforms
    this.matVel.uniforms.uPos.value = this.rtPos.ping.texture
    this.matVel.uniforms.uVel.value = this.rtVel.ping.texture
    this.matVel.uniforms.uTime.value = this.time
    this.matVel.uniforms.uDt.value = Math.min(0.033, dt)
    this.matVel.uniforms.uBands.value = bands
    this.matVel.uniforms.uCentroid.value = centroid

    // Onset twirl boost
    const baseTwirl = 0.6
    this.matVel.uniforms.uTwirl.value = baseTwirl + (f.onset ? 0.6 : 0.0)

    // Slightly stronger attraction with energy
    const energy = THREE.MathUtils.clamp(f.rms * 3.0, 0, 1)
    this.matVel.uniforms.uAttract.value = 0.12 + 0.25 * energy

    // Sim step: velocity -> rtVel.pong
    this.quad.material = this.matVel
    this.engine.renderer.setRenderTarget(this.rtVel.pong)
    this.engine.renderer.render(this.simScene, this.simCam)

    // Update position pass inputs
    this.matPos.uniforms.uPos.value = this.rtPos.ping.texture
    this.matPos.uniforms.uVel.value = this.rtVel.pong.texture
    this.matPos.uniforms.uDt.value = Math.min(0.033, dt)

    // Sim step: position -> rtPos.pong
    this.quad.material = this.matPos
    this.engine.renderer.setRenderTarget(this.rtPos.pong)
    this.engine.renderer.render(this.simScene, this.simCam)

    // Swap
    this.swap(this.rtVel)
    this.swap(this.rtPos)
    this.engine.renderer.setRenderTarget(null)

    // Render uniforms
    this.renderMat.uniforms.uPos.value = this.rtPos.ping.texture
    this.renderMat.uniforms.uTime.value = this.time
    // Dynamic size with bass
    const size = 1.4 + bands.x * 2.2
    this.renderMat.uniforms.uPointSize.value = size

    // Beat-synced camera sway
    if (f.beatConfidence > 0.4) {
      const ph = f.beatPhase
      this.engine.camera.position.x = Math.sin(ph * 6.2831) * (0.4 + bands.y * 0.2)
      this.engine.camera.position.y = Math.cos(ph * 6.2831) * (0.25 + bands.z * 0.15)
      this.engine.camera.lookAt(0, 0, 0)
    }

    // Palette reactive
    const p = this.engine.palette
    ;(this.renderMat.uniforms.uColorA.value as THREE.Color).set(p.primary)
    ;(this.renderMat.uniforms.uColorB.value as THREE.Color).set(p.secondary)
    ;(this.renderMat.uniforms.uColorC.value as THREE.Color).set(p.tert)
  }

  setPalette(p: Palette): void {
    ;(this.renderMat.uniforms.uColorA.value as THREE.Color).set(p.primary)
    ;(this.renderMat.uniforms.uColorB.value as THREE.Color).set(p.secondary)
    ;(this.renderMat.uniforms.uColorC.value as THREE.Color).set(p.tert)
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points)
    this.renderGeom.dispose()
    this.renderMat.dispose()
    this.rtPos.ping.dispose(); this.rtPos.pong.dispose()
    this.rtVel.ping.dispose(); this.rtVel.pong.dispose()
    ;(this.quad.geometry as THREE.BufferGeometry).dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }

  private swap(x: { ping: THREE.WebGLRenderTarget; pong: THREE.WebGLRenderTarget }) {
    const tmp = x.ping; x.ping = x.pong; x.pong = tmp
  }

  private seedRT(rt: THREE.WebGLRenderTarget, isPos: boolean) {
    const N = this.simRes
    const data = new Float32Array(N * N * 4)
    for (let i = 0; i < N * N; i++) {
      if (isPos) {
        // start in a sphere
        const r1 = Math.random()*2.0 - 1.0
        const r2 = Math.random()*2.0 - 1.0
        const r3 = Math.random()*2.0 - 1.0
        const s = 1.0 / Math.max(1.0, Math.hypot(r1, r2, r3))
        data[i*4+0] = r1*s * 3.0
        data[i*4+1] = r2*s * 3.0
        data[i*4+2] = r3*s * 3.0
        data[i*4+3] = 1.0
      } else {
        data[i*4+0] = 0
        data[i*4+1] = 0
        data[i*4+2] = 0
        data[i*4+3] = 1
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true
    const old = rt.texture
    rt.texture.dispose()
    rt.texture = tex
  }

  private velFrag(): string {
    return `
      precision highp float;
      uniform sampler2D uPos;
      uniform sampler2D uVel;
      uniform float uTime;
      uniform float uDt;
      uniform vec4 uBands; // bass, lowMid, mid, highs
      uniform float uCentroid;
      uniform float uDamp;
      uniform float uAttract;
      uniform float uTwirl;
      vec2 hash2(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return -1.0 + 2.0*fract(sin(p)*43758.5453123); }
      float noise(vec3 x){
        const vec3 step = vec3(110,241,171);
        vec3 i = floor(x);
        vec3 f = fract(x);
        float n = dot(i, step);
        vec3 u = f*f*(3.0-2.0*f);
        return mix(mix(mix( fract(sin(n+dot(vec3(0,0,0),step))*43758.5453),
                          fract(sin(n+dot(vec3(1,0,0),step))*43758.5453), u.x),
                     mix( fract(sin(n+dot(vec3(0,1,0),step))*43758.5453),
                          fract(sin(n+dot(vec3(1,1,0),step))*43758.5453), u.x), u.y),
                   mix(mix( fract(sin(n+dot(vec3(0,0,1),step))*43758.5453),
                            fract(sin(n+dot(vec3(1,0,1),step))*43758.5453), u.x),
                       mix( fract(sin(n+dot(vec3(0,1,1),step))*43758.5453),
                            fract(sin(n+dot(vec3(1,1,1),step))*43758.5453), u.x), u.y), u.z);
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / vec2(${this.simRes.toFixed(1)}, ${this.simRes.toFixed(1)});
        vec3 P = texture2D(uPos, uv).xyz;
        vec3 V = texture2D(uVel, uv).xyz;

        // Audio-driven attractors
        vec3 A = vec3(0.0);
        vec3 a1 = vec3(sin(uTime*0.7)*3.0, cos(uTime*0.6)*2.5, -sin(uTime*0.5)*3.5);
        vec3 a2 = vec3(cos(uTime*0.3+2.0)*-2.5, sin(uTime*0.4+1.0)*3.0, cos(uTime*0.5+0.5)*2.0);
        vec3 a3 = vec3(0.0, 0.0, 0.0);
        vec3 d1 = a1 - P; float r1 = length(d1)+1e-3; A += normalize(d1) * (uBands.x) * 0.8 / r1;
        vec3 d2 = a2 - P; float r2 = length(d2)+1e-3; A += normalize(d2) * (uBands.y) * 0.7 / r2;
        vec3 d3 = a3 - P; float r3 = length(d3)+1e-3; A += normalize(d3) * (uBands.z*0.6 + 0.2) / r3;

        // Swirl / curl-ish field
        float n = noise(vec3(P*0.35 + uTime*0.3));
        vec3 swirl = vec3(-(P.y), P.x, (sin(P.x*0.5)+cos(P.y*0.5))*0.5);
        A += normalize(swirl+1e-5) * uTwirl * (0.4 + 0.6*n);

        // Soft confinement
        float bound = 6.0;
        vec3 push = -P * smoothstep(bound*0.6, bound, length(P)) * 0.6;
        A += push * uAttract;

        // Integrate
        V = V * uDamp + A * uDt;
        // clamp to avoid explosion
        V = clamp(V, vec3(-8.0), vec3(8.0));

        gl_FragColor = vec4(V, 1.0);
      }
    `
  }

  private posFrag(): string {
    return `
      precision highp float;
      uniform sampler2D uPos;
      uniform sampler2D uVel;
      uniform float uDt;
      void main(){
        vec2 uv = gl_FragCoord.xy / vec2(${this.simRes.toFixed(1)}, ${this.simRes.toFixed(1)});
        vec3 P = texture2D(uPos, uv).xyz;
        vec3 V = texture2D(uVel, uv).xyz;
        P += V * uDt;
        // wrap softly inside a box
        float B = 8.0;
        P = clamp(P, vec3(-B), vec3(B));
        gl_FragColor = vec4(P, 1.0);
      }
    `
  }
}