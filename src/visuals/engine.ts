import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, ToneMappingEffect, DepthOfFieldEffect, SSAOEffect,
  ChromaticAberrationEffect, NoiseEffect, VignetteEffect, GlitchEffect
} from 'postprocessing'
import { Analyzer } from '@audio/analyzer'
import { ParticlesScene } from '@scenes/Particles'
import { FluidScene } from '@scenes/Fluid2D'
import { TunnelScene } from '@scenes/Tunnel'
import { TerrainScene } from '@scenes/Terrain'
import { TypographyScene } from '@scenes/Typography'
import { KaleidoscopeScene } from '@scenes/Kaleidoscope'
import { CoverParticlesScene } from '@scenes/CoverParticles'
import { BaseScene } from './baseScene'

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
  envTex: THREE.Texture | null = null
  albumURL: string | null = null

  current: BaseScene
  next: BaseScene | null = null
  crossfade = 0
  crossDur = 1.0
  lastFrameTime = performance.now()
  targetFPS = 60

  // Postprocessing settings
  useBloom = true
  bloomIntensity = 1.2
  useSSAO = false
  useDOF = false
  chromAb = 0.2
  vignette = 0.25
  grain = 0.15
  glitch = 0.0

  msaa = 0
  renderScale = 1.0

  scenes: Record<string, new (engine: VisualEngine) => BaseScene> = {
    'Particles': ParticlesScene,
    'Fluid': FluidScene,
    'Tunnel': TunnelScene,
    'Terrain': TerrainScene,
    'Typography': TypographyScene,
    'Kaleidoscope': KaleidoscopeScene,
    'CoverParticles': CoverParticlesScene
  }

  analyzer: Analyzer

  constructor(analyzer: Analyzer) {
    this.analyzer = analyzer
    this.current = new ParticlesScene(this)
  }

  async init(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: this.msaa > 0, powerPreference: 'high-performance' })
    this.renderer.setClearColor(this.palette.bg)
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)

    this.sceneA = new THREE.Scene()
    this.sceneB = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000)
    this.camera.position.set(0, 0, 5)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.sceneA, this.camera))

    this.composerB = new EffectComposer(this.renderer)
    this.composerB.addPass(new RenderPass(this.sceneB, this.camera))

    this.applyPost()
    this.resize()
    addEventListener('resize', () => this.resize())

    await this.current.init(this.sceneA)
    this.animate()
  }

  setPalette(p: Palette, albumURL?: string) {
    this.palette = p
    this.renderer.setClearColor(p.bg)
    this.current.setPalette(p)
    if (this.next) this.next.setPalette(p)
    if (albumURL) {
      this.albumURL = albumURL
      new THREE.TextureLoader().load(albumURL, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping
        tex.colorSpace = THREE.SRGBColorSpace
        this.envTex = tex
        this.sceneA.environment = tex
        this.sceneB.environment = tex
      })
    }
    document.documentElement.style.setProperty('--acc1', p.primary)
    document.documentElement.style.setProperty('--acc2', p.secondary)
    document.documentElement.style.setProperty('--acc3', p.tert)
    document.documentElement.style.setProperty('--bg', p.bg)
  }

  async switchScene(name: string, duration = 1.2) {
    const Ctor = this.scenes[name]
    if (!Ctor) return
    if (this.next) { this.next.dispose(this.sceneB); this.next = null }
    this.next = new Ctor(this)
    this.crossfade = 0
    this.crossDur = duration
    this.sceneB.clear()
    await this.next.init(this.sceneB)
    this.next.setPalette(this.palette)
  }

  setQuality(opts: {
    scale?: number; msaa?: number; bloom?: boolean; bloomInt?: number; ssao?: boolean; dof?: boolean;
    ca?: number; vignette?: number; grain?: number; glitch?: number
  }) {
    if (opts.scale !== undefined) this.renderScale = opts.scale
    if (opts.msaa !== undefined) this.msaa = opts.msaa
    if (opts.bloom !== undefined) this.useBloom = opts.bloom
    if (opts.bloomInt !== undefined) this.bloomIntensity = opts.bloomInt
    if (opts.ssao !== undefined) this.useSSAO = opts.ssao
    if (opts.dof !== undefined) this.useDOF = opts.dof
    if (opts.ca !== undefined) this.chromAb = opts.ca
    if (opts.vignette !== undefined) this.vignette = opts.vignette
    if (opts.grain !== undefined) this.grain = opts.grain
    if (opts.glitch !== undefined) this.glitch = opts.glitch
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
      if (this.chromAb > 0) fx.push(new ChromaticAberrationEffect({ offset: new THREE.Vector2(this.chromAb, 0) }))
      if (this.vignette > 0) fx.push(new VignetteEffect({ offset: 0.3, darkness: this.vignette }))
      if (this.grain > 0) fx.push(new NoiseEffect({ premultiply: true, blendFunction: 15 /* ADD */, opacity: this.grain }))
      if (this.glitch > 0.01) fx.push(new GlitchEffect({ strength: this.glitch }))
      fx.push(new ToneMappingEffect({ mode: 4 }))
      if (fx.length) composer.addPass(new EffectPass(this.camera, ...fx))
    }
    if (this.composer) build(this.composer)
    if (this.composerB) build(this.composerB)
  }

  resize() {
    const w = Math.floor(innerWidth * this.renderScale)
    const h = Math.floor(innerHeight * this.renderScale)
    this.size.set(w, h)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.composer) this.composer.setSize(w, h)
    if (this.composerB) this.composerB.setSize(w, h)
  }

  animate = () => {
    const t = this.clock.getElapsedTime()
    const delta = this.clock.getDelta()
    const now = performance.now()
    const dt = (now - this.lastFrameTime)
    this.lastFrameTime = now

    // Adaptive governor to hold target FPS
    const target = this.targetFPS
    const fps = 1000 / dt
    if (fps < target - 5 && this.renderScale > 0.8) { this.renderScale = Math.max(0.8, this.renderScale - 0.02); this.resize() }
    else if (fps > target + 10 && this.renderScale < 2.0) { this.renderScale = Math.min(2.0, this.renderScale + 0.02); this.resize() }

    this.current.update(t, delta)
    if (this.next) { this.next.update(t, delta); this.crossfade = Math.min(1, this.crossfade + delta / this.crossDur) }

    this.renderer.clear()
    this.composer.render(delta)
    if (this.next) {
      this.renderer.setScissorTest(true)
      this.renderer.setScissor(0, 0, this.size.x, this.size.y)
      this.renderer.setViewport(0, 0, this.size.x, this.size.y)
      this.renderer.setClearAlpha(this.crossfade)
      this.composerB.render(delta)
      if (this.crossfade >= 1) {
        this.current.dispose(this.sceneA)
        this.sceneA.clear()
        this.current = this.next
        this.next = null
        const tmpScene = this.sceneA
        this.sceneA = this.sceneB
        this.sceneB = tmpScene
      }
    }

    requestAnimationFrame(this.animate)
  }
}