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
import { BaseScene } from './baseScene'
import { extractThemeFromImage, applyThemeToDocument } from '@ui/theme'

export type Palette = { primary: string; secondary: string; tert: string; bg: string }
export type VisualConfig = {
  // Global
  renderScale: number | 'auto'
  msaa: 0 | 2 | 4 | 8
  targetFPS: number
  intensity: number
  speed: number
  // Post FX
  bloom: boolean; bloomIntensity: number
  ssao: boolean; dof: boolean
  chromAb: number; vignette: number; grain: number; glitch: number
  // Scene specific knobs
  particles: { count: number; size: number; spread: number }
  tunnel: { steps: number }
  terrain: { amp: number }
  fluid: { res: 512 | 1024 | 2048 }
}

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

  config: VisualConfig = {
    renderScale: 'auto',
    msaa: 0,
    targetFPS: 60,
    intensity: 1.0,
    speed: 1.0,

    bloom: true, bloomIntensity: 1.1,
    ssao: false, dof: false,
    chromAb: 0.15, vignette: 0.25, grain: 0.12, glitch: 0.0,

    particles: { count: 500_000, size: 1.6, spread: 6.0 },
    tunnel: { steps: 640 },
    terrain: { amp: 1.0 },
    fluid: { res: 1024 }
  }

  scenes: Record<string, new (engine: VisualEngine) => BaseScene> = {
    'Particles': ParticlesScene,
    'Fluid': FluidScene,
    'Tunnel': TunnelScene,
    'Terrain': TerrainScene,
    'Typography': TypographyScene
  }

  analyzer: Analyzer

  constructor(analyzer: Analyzer) {
    this.analyzer = analyzer
    this.current = new ParticlesScene(this)
  }

  async init(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: this.config.msaa > 0, powerPreference: 'high-performance' })
    this.renderer.setClearColor(this.palette.bg)
    this.renderer.autoClear = false
    container.appendChild(this.renderer.domElement)

    this.sceneA = new THREE.Scene()
    this.sceneB = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000)
    this.camera.position.set(0, 0, 7) // pull back slightly; fixes "overscaled" look

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

  // Smart initial render scale
  private setInitialScale() {
    if (this.config.renderScale === 'auto') {
      const dpr = devicePixelRatio || 1
      // Start lower on high-DPI to avoid overdraw; adaptive loop will ramp up if possible.
      const base = dpr > 1.5 ? Math.max(0.8, 1.4 / dpr) : 1.0
      this.setQuality({ renderScale: base })
    } else {
      this.setQuality({ renderScale: this.config.renderScale as number })
    }
  }

  async setAlbumCover(url: string) {
    this.albumURL = url
    // env map for subtle reflections
    new THREE.TextureLoader().load(url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping
      tex.colorSpace = THREE.SRGBColorSpace
      this.envTex = tex
      this.sceneA.environment = tex
      this.sceneB.environment = tex
    })
    // auto theme
    try {
      const theme = await extractThemeFromImage(url)
      applyThemeToDocument(theme)
      this.setPalette({ primary: theme.primary, secondary: theme.secondary, tert: theme.tert, bg: theme.bg })
    } catch {
      // ignore
    }
  }

  setPalette(p: Palette) {
    this.palette = p
    this.renderer.setClearColor(p.bg)
    this.current.setPalette(p)
    if (this.next) this.next.setPalette(p)
  }

  async switchScene(name: string, duration = 1.0) {
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

  // Atomically update parts of the config
  setQuality(partial: Partial<VisualConfig> & { renderScale?: number | 'auto' }) {
    this.config = { ...this.config, ...partial, particles: { ...this.config.particles, ...(partial as any).particles }, tunnel: { ...this.config.tunnel, ...(partial as any).tunnel }, terrain: { ...this.config.terrain, ...(partial as any).terrain }, fluid: { ...this.config.fluid, ...(partial as any).fluid } }
    // Rendering toggles
    this.renderer.setPixelRatio(this.pixelRatio)
    this.applyPost()
    this.resize()
  }

  private applyPost() {
    const c = this.config
    const build = (composer: EffectComposer) => {
      while ((composer as any).passes.length > 1) composer.removePass((composer as any).passes[(composer as any).passes.length - 1])
      const fx: any[] = []
      if (c.bloom) fx.push(new BloomEffect({ intensity: c.bloomIntensity }))
      if (c.ssao) fx.push(new SSAOEffect(this.camera, (composer as any).getRenderer().getRenderTarget().texture, { samples: 8 }))
      if (c.dof) fx.push(new DepthOfFieldEffect(this.camera, { focusDistance: 0.02, bokehScale: 2.0 }))
      if (c.chromAb > 0) fx.push(new ChromaticAberrationEffect({ offset: new THREE.Vector2(c.chromAb, 0) }))
      if (c.vignette > 0) fx.push(new VignetteEffect({ offset: 0.3, darkness: c.vignette }))
      if (c.grain > 0) fx.push(new NoiseEffect({ premultiply: true, blendFunction: 15, opacity: c.grain }))
      if (c.glitch > 0.01) fx.push(new GlitchEffect({ strength: c.glitch }))
      fx.push(new ToneMappingEffect({ mode: 4 }))
      if (fx.length) composer.addPass(new EffectPass(this.camera, ...fx))
    }
    if (this.composer) build(this.composer)
    if (this.composerB) build(this.composerB)
  }

  resize() {
    const baseScale = typeof this.config.renderScale === 'number' ? this.config.renderScale : 1.0
    const w = Math.floor(innerWidth * baseScale)
    const h = Math.floor(innerHeight * baseScale)
    this.size.set(w, h)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.composer) this.composer.setSize(w, h)
    if (this.composerB) this.composerB.setSize(w, h)
  }

  animate = () => {
    // Adaptive governor to maintain target FPS
    const now = performance.now()
    const dtMs = (now - this.lastFrameTime)
    this.lastFrameTime = now
    const fps = 1000 / Math.max(1, dtMs)
    const target = this.config.targetFPS
    if (this.config.renderScale === 'auto') {
      const cur = typeof this.config.renderScale === 'number' ? (this.config.renderScale as number) : 1.0
      if (fps < target - 5 && cur > 0.75) this.config.renderScale = Math.max(0.75, cur - 0.02)
      else if (fps > target + 10 && cur < 2.0) this.config.renderScale = Math.min(2.0, cur + 0.02)
      this.resize()
    }

    const delta = this.clock.getDelta()
    const t = this.clock.getElapsedTime()
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
        const tmpScene = this.sceneA; this.sceneA = this.sceneB; this.sceneB = tmpScene
      }
    }

    requestAnimationFrame(this.animate)
  }
}