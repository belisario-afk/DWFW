// Centralized config: types, curated presets, and an album-driven mapping.

export type FXConfig = {
  scale: number | 'auto'
  msaa: 0 | 2 | 4 | 8
  bloom: boolean
  bloomInt: number
  ssao: boolean
  dof: boolean
  ca: number
  vignette: number
  grain: number
}

export type SceneParams = {
  // Generic knobs most scenes can respect; each scene can ignore what it doesn’t use.
  intensity: number // 0.2–1.8
  speed: number     // 0.5–2.0

  // Particles
  particleCount?: number
  particleSize?: number
  particleSpread?: number

  // Raymarchy scenes
  steps?: number

  // Fluid
  fluidRes?: 512 | 1024 | 2048
}

export type Preset = {
  name: string
  scene: 'Particles' | 'Fluid' | 'Tunnel' | 'Terrain' | 'Typography'
  fx: FXConfig
  params: Partial<SceneParams>
}

export const DEFAULT_FX: FXConfig = {
  scale: 'auto',
  msaa: 0,
  bloom: true,
  bloomInt: 1.1,
  ssao: false,
  dof: false,
  ca: 0.12,
  vignette: 0.22,
  grain: 0.1
}

export const PRESETS: Preset[] = [
  {
    name: 'Balanced Particles',
    scene: 'Particles',
    fx: { ...DEFAULT_FX, bloomInt: 1.0, grain: 0.08, vignette: 0.2, ca: 0.1 },
    params: { intensity: 1.0, speed: 1.0, particleCount: 600_000, particleSize: 1.5, particleSpread: 6 }
  },
  {
    name: 'Dreamy Fluid',
    scene: 'Fluid',
    fx: { ...DEFAULT_FX, bloomInt: 1.2, dof: false, ca: 0.08, vignette: 0.18, grain: 0.06 },
    params: { intensity: 0.9, speed: 0.9, fluidRes: 1024 }
  },
  {
    name: 'Neon Tunnel',
    scene: 'Tunnel',
    fx: { ...DEFAULT_FX, bloomInt: 1.4, ca: 0.18, vignette: 0.26, grain: 0.12 },
    params: { intensity: 1.2, speed: 1.2, steps: 768 }
  },
  {
    name: 'Epic Terrain',
    scene: 'Terrain',
    fx: { ...DEFAULT_FX, bloomInt: 1.05, ssao: true, vignette: 0.24, grain: 0.08, ca: 0.07 },
    params: { intensity: 1.0, speed: 0.95, steps: 704 }
  },
  {
    name: 'Typography Focus',
    scene: 'Typography',
    fx: { ...DEFAULT_FX, bloomInt: 0.9, grain: 0.05, vignette: 0.2, ca: 0.06 },
    params: { intensity: 0.9, speed: 1.0 }
  }
]

// Theme metrics from extractThemeFromImage
export type ThemeMetrics = {
  primary: string
  secondary: string
  tert: string
  bg: string
  swatches: string[]
  brightness: number // 0–1
  saturation: number // 0–1
  warmth: number     // 0–1 (0=cool/blue, 1=warm/red)
}

// “Dumb but musical” mapping from album cover to a preset suggestion.
export function albumDrivenPreset(t: ThemeMetrics): Preset {
  // Scene heuristic: cool/tech -> Tunnel; warm/organic -> Fluid; mid/neutral -> Particles
  const scene: Preset['scene'] =
    t.warmth < 0.38 ? 'Tunnel' :
    t.warmth > 0.62 ? 'Fluid' : 'Particles'

  // FX heuristics
  const bloomInt = 0.9 + t.saturation * 0.8 // more saturation -> more bloom
  const vignette = 0.16 + (1 - t.brightness) * 0.25 // darker cover -> more vignette
  const grain = 0.03 + (1 - t.saturation) * 0.15 // desaturated -> a bit more grain
  const ca = 0.06 + (0.5 - Math.abs(t.warmth - 0.5)) * 0.18 // neutral warmth -> more CA pop

  const fx: FXConfig = {
    ...DEFAULT_FX,
    bloomInt: Number(bloomInt.toFixed(2)),
    vignette: Number(vignette.toFixed(2)),
    grain: Number(grain.toFixed(2)),
    ca: Number(ca.toFixed(2))
  }

  // Motion heuristics
  const intensity = 0.8 + t.saturation * 0.8
  const speed = 0.85 + t.brightness * 0.9

  // Scene-specific params
  const params: Partial<SceneParams> = { intensity: clamp(intensity, 0.2, 1.8), speed: clamp(speed, 0.5, 2.0) }
  if (scene === 'Particles') {
    const baseCount = 500_000
    const count = baseCount + Math.round(t.brightness * 800_000)
    params.particleCount = clampInt(count, 200_000, 2_000_000)
    params.particleSize = clamp(1.2 + (1 - t.brightness) * 0.8, 0.5, 3.0)
    params.particleSpread = clamp(5 + (1 - t.saturation) * 4, 3, 12)
  } else if (scene === 'Tunnel') {
    params.steps = clampInt(608 + Math.round(t.saturation * 416), 256, 1024)
  } else if (scene === 'Fluid') {
    params.fluidRes = (t.brightness > 0.7 ? 2048 : t.brightness > 0.45 ? 1024 : 512) as 512 | 1024 | 2048
  }

  return {
    name: 'Album-driven',
    scene,
    fx,
    params
  }
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function clampInt(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.round(v))) }