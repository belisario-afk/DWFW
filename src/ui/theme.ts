// Improved theme extraction: palette + simple metrics (brightness/saturation/warmth)
export type Theme = {
  primary: string
  secondary: string
  tert: string
  bg: string
  swatches: string[]
  brightness: number
  saturation: number
  warmth: number
}

// Utility to compute HSL from RGB
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h, s, l }
}

function hex(c: number) { return c.toString(16).padStart(2, '0') }
function toHex(r: number, g: number, b: number) { return `#${hex(r)}${hex(g)}${hex(b)}` }

export async function extractThemeFromImage(url: string): Promise<Theme> {
  // Load image
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = rej
    i.src = url
  })

  const w = 64, h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  let rAcc = 0, gAcc = 0, bAcc = 0
  let sAcc = 0, lAcc = 0
  const buckets = new Map<string, number>()

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3]
    if (a < 16) continue
    rAcc += r; gAcc += g; bAcc += b
    const { h: h1, s: s1, l: l1 } = rgbToHsl(r, g, b)
    sAcc += s1; lAcc += l1
    const key = `${Math.round(h1*12)}-${Math.round(s1*4)}-${Math.round(l1*4)}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  const n = data.length / 4
  const rAvg = Math.round(rAcc / n), gAvg = Math.round(gAcc / n), bAvg = Math.round(bAcc / n)
  const { h: hAvg, s: sAvg, l: lAvg } = rgbToHsl(rAvg, gAvg, bAvg)
  const warmth = (rAvg - bAvg + 255) / 510 // 0=more blue, 1=more red
  const brightness = lAvg // 0–1
  const saturation = sAvg // 0–1

  // Pick top swatches (dominant buckets to colors)
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(entry => entry[0])
  const swatches: string[] = top.map(key => {
    const [hh, ss, ll] = key.split('-').map(Number)
    // approximate back to RGB by sampling the original data for closest bucket
    // simple fallback: perturb avg color by bucket offsets
    const hHat = (hh / 12), sHat = (ss / 4), lHat = (ll / 4)
    // mix with average to avoid extreme artifacts
    const mix = 0.6
    const r2 = Math.round(rAvg * mix + (hHat*255) * (1-mix))
    const g2 = Math.round(gAvg * mix + (sHat*255) * (1-mix))
    const b2 = Math.round(bAvg * mix + (lHat*255) * (1-mix))
    return toHex(clamp(r2,0,255), clamp(g2,0,255), clamp(b2,0,255))
  })

  const primary = swatches[0] || toHex(rAvg, gAvg, bAvg)
  const secondary = swatches[1] || '#2ec4b6'
  const tert = swatches[2] || '#ffd166'
  const bg = lAvg < 0.45 ? '#0a0a0a' : '#111217'

  return { primary, secondary, tert, bg, swatches, brightness, saturation, warmth }
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }