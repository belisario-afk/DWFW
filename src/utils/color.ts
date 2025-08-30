export type Palette = { primary: string; secondary: string; tert: string; bg: string }

export async function paletteFromAlbumURL(url: string): Promise<Palette> {
  const img = await loadImage(url)
  const { primary, secondary, tert } = extractDominantColors(img)
  // bg is darkened primary luma
  const bg = toHex(shade(primary, -0.8))
  return { primary: toHex(primary), secondary: toHex(secondary), tert: toHex(tert), bg }
}

export function applyPaletteToCSS(p: Palette) {
  const r = document.documentElement
  r.style.setProperty('--acc1', p.primary)
  r.style.setProperty('--acc2', p.secondary)
  r.style.setProperty('--acc3', p.tert)
  r.style.setProperty('--bg', p.bg)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

function extractDominantColors(img: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const w = canvas.width = 64
  const h = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const buckets = new Map<string, number>()
  for (let i=0;i<data.length;i+=4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3]
    if (a < 200) continue
    // quantize
    const key = `${r>>3},${g>>3},${b>>3}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  const top = [...buckets.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([k]) => {
    const [rq,gq,bq] = k.split(',').map(n=>parseInt(n)<<3)
    return { r: rq, g: gq, b: bq }
  })
  const primary = top[0] || { r: 255, g: 90, b: 95 }
  const secondary = top[1] || { r: 46, g: 196, b: 182 }
  const tert = top[2] || { r: 255, g: 209, b: 102 }
  return { primary, secondary, tert }
}

function toHex(c: { r: number, g: number, b: number }) {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}
function shade(hex: string | {r:number,g:number,b:number}, k: number) {
  const c = typeof hex === 'string' ? hexToRgb(hex) : hex
  const l = 1 + k
  return {
    r: Math.max(0, Math.min(255, Math.round(c.r * l))),
    g: Math.max(0, Math.min(255, Math.round(c.g * l))),
    b: Math.max(0, Math.min(255, Math.round(c.b * l)))
  }
}
function hexToRgb(h: string) {
  const m = h.replace('#','')
  return { r: parseInt(m.slice(0,2),16), g: parseInt(m.slice(2,4),16), b: parseInt(m.slice(4,6),16) }
}