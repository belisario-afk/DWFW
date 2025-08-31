import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, ToneMappingEffect, DepthOfFieldEffect, SSAOEffect,
  ChromaticAberrationEffect, NoiseEffect, VignetteEffect
} from 'postprocessing'
import { Analyzer } from '@audio/analyzer'
import { BaseScene } from './baseScene'

import { NeonGridScene } from '@scenes/NeonGrid'
import { LiquidChromeScene } from '@scenes/LiquidChrome'
import { AudioTerrainScene } from '@scenes/AudioTerrain'
import { LissajousOrbitalsScene } from '@scenes/LissajousOrbitals'

export type Palette = { primary: string; secondary: string; tert: string; bg: string }

export class VisualEngine {
  renderer!: THREE.WebGLRenderer
  sceneA!: THREE.Scene
  sceneB!: THREE.Scene
  camera!: THREE.PerspectiveCamera
  composer!: EffectComposer
  composerB!: EffectComposer
  clock = new THREE.Clock()
  size = new THREE.Vector2()
  pixelRatio = Math.min(devicePixelRatio, 2)
  palette: Palette = { primary: '#ff5a5f', secondary: '#2ec4b6', tert: '#ffd166', bg: '#0a0a0a' }
  albumURL: string | null = null
  envTex: THREE.Texture | null = null

  current!: BaseScene
  next: BaseScene | null = null
  crossfade = 0
  crossDur = 1.0
  lastFrameTime = performance.now()
  targetFPS = 60

  useBloom = true
  bloomIntensity = 1.15
  useSSAO = false
  useDOF = false
  chromAb = 0.10
  vignette = 0.22
  grain = 0.08

  msaa = 0
  renderScale: number | 'auto' = 'auto'

  analyzer: Analyzer

  scenes: Record<string, new (engine: VisualEngine) => BaseScene> = {
    NeonGrid: NeonGridScene,
    LiquidChrome: LiquidChromeScene,
    AudioTerrain: AudioTerrainScene,
    Lissajous: LissajousOrbitalsScene
  }

  constructor(analyzer: Analyzer) {
    this.analyzer = analyzer
    this.current = new NeonGridScene(this)
  }

  async init(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: this.msaa > 0, powerPreference: 'high-performance' })
    this.renderer.setClearColor(this.palette.bg)
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)

    this.sceneA = new THREE.Scene()
    this.sceneB = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000)
    this.camera.position.set(0, 0, 7)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.sceneA, this.camera))
    this.composerB = new EffectComposer(this.renderer)
    this.composerB.addPass(new RenderPass(this.sceneB, this.camera))

    this.applyPost()
    this.setInitialScale()
    this.resize()
    addEventListener('resize', () => this.resize())

    await this.current.init(this.sceneA)
    this.animate()
  }

  private setInitialScale() {
    if (this.renderScale === 'auto') {
      const dpr = devicePixelRatio || 1
      this.renderScale = dpr > 1.5 ? Math.max(0.8, 1.4 / dpr) : 1.0
    }
  }

  setPalette(p: Palette) {
    this.palette = p
    this.renderer.setClearColor(p.bg)
    try { this.current.setPalette(p) } catch {}
    try { this.next?.setPalette(p) } catch {}
  }

  async switchScene(name: string, duration = 1.0) {
    const Ctor = this.scenes[name]
    if (!Ctor) return
    if (this.next) { try { this.next.dispose(this.sceneB) } catch {} this.next = null }
    this.next = new Ctor(this)
    this.crossfade = 0
    this.crossDur = duration
    this.sceneB.clear()
    try {
      await this.next.init(this.sceneB)
      this.next.setPalette(this.palette)
    } catch (e) {
      console.error('Scene init failed', name, e)
      this.next = null
    }
  }

  setQuality(opts: Partial<{
    scale: number | 'auto'
    msaa: 0 | 2 | 4 | 8
    bloom: boolean
    bloomInt: number
    ssao: boolean
    dof: boolean
    ca: number
    vignette: number
    grain: number
  }>) {
    if (opts.scale !== undefined) this.renderScale = opts.scale
    if (opts.msaa !== undefined) this.msaa = opts.msaa
    if (opts.bloom !== undefined) this.useBloom = opts.bloom
    if (opts.bloomInt !== undefined) this.bloomIntensity = opts.bloomInt
    if (opts.ssao !== undefined) this.useSSAO = opts.ssao
    if (opts.dof !== undefined) this.useDOF = opts.dof
    if (opts.ca !== undefined) this.chromAb = opts.ca
    if (opts.vignette !== undefined) this.vignette = opts.vignette
    if (opts.grain !== undefined) this.grain = opts.grain
    this.applyPost()
    this.resize()
  }

  private applyPost() {
    const build = (composer: EffectComposer) => {
      while ((composer as any).passes.length > 1) composer.removePass((composer as any).passes[(composer as any).passes.length - 1])
      const fx: any[] = []
      if (this.useBloom) fx.push(new BloomEffect({ intensity: this.bloomIntensity }))
      if (this.useSSAO) fx.push(new SSAOEffect(this.camera, (composer as any).getRenderer().getRenderTarget().texture, { samples: 8 }))
      if (this.useDOF) fx.push(new DepthOfFieldEffect(this.camera, { focusDistance: 0.02, bokehScale: 2.0 }))
      if (this.chromAb > 0) fx.push(new ChromaticAberrationEffect({ offset: new (THREE as any).Vector2(this.chromAb, 0) }))
      if (this.vignette > 0) fx.push(new VignetteEffect({ offset: 0.3, darkness: this.vignette }))
      if (this.grain > 0) fx.push(new NoiseEffect({ premultiply: true, blendFunction: 15, opacity: this.grain }))
      fx.push(new ToneMappingEffect({ mode: 4 }))
      if (fx.length) composer.addPass(new EffectPass(this.camera, ...fx))
    }
    if (this.composer) build(this.composer)
    if (this.composerB) build(this.composerB)
  }

  resize() {
    const scale = typeof this.renderScale === 'number' ? this.renderScale : 1.0
    const w = Math.floor(innerWidth * scale)
    const h = Math.floor(innerHeight * scale)
    this.size.set(w, h)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.composer?.setSize(w, h)
    this.composerB?.setSize(w, h)
  }

  animate = () => {
    const now = performance.now()
    const dtMs = now - this.lastFrameTime
    this.lastFrameTime = now
    const fps = 1000 / Math.max(1, dtMs)
    if (this.renderScale === 'auto') {
      const cur = typeof this.renderScale === 'number' ? this.renderScale : 1.0
      if (fps < this.targetFPS - 5 && cur > 0.75) { this.renderScale = Math.max(0.75, cur - 0.02); this.resize() }
      else if (fps > this.targetFPS + 10 && cur < 2.0) { this.renderScale = Math.min(2.0, cur + 0.02); this.resize() }
    }

    const delta = this.clock.getDelta()
    const t = this.clock.getElapsedTime()

    try { this.current?.update?.(t, delta) } catch {}
    if (this.next) {
      try { this.next.update?.(t, delta) } catch {}
      this.crossfade = Math.min(1, this.crossfade + delta / this.crossDur)
    }

    this.renderer.clear()
    if (this.composer) this.composer.render(delta)
    if (this.next && this.composerB) {
      this.renderer.setScissorTest(true)
      this.renderer.setScissor(0, 0, this.size.x, this.size.y)
      this.renderer.setViewport(0, 0, this.size.x, this.size.y)
      this.renderer.setClearAlpha(this.crossfade)
      this.composerB.render(delta)
      if (this.crossfade >= 1) {
        try { this.current?.dispose?.(this.sceneA) } catch {}
        this.sceneA.clear()
        this.current = this.next
        this.next = null
        const tmp = this.sceneA; this.sceneA = this.sceneB; this.sceneB = tmp
      }
    }

    requestAnimationFrame(this.animate)
  }
}