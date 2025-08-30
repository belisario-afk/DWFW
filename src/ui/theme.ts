export type Theme = { primary: string; secondary: string; tert: string; bg: string; swatches: string[] }

export async function extractThemeFromImage(url: string): Promise<Theme> {
  const img = await loadImage(url)
  const { data } = drawToCanvas(img, 160)
  const samples: [number, number, number][] = []
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 200) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max - min < 12) continue
    samples.push([r, g, b])
  }
  const clusters = kMeans(samples, 5, 12)
  clusters.sort((a, b) => luminance(a) - luminance(b))
  const bg = rgbToHex(...clusters[0])
  const primary = rgbToHex(...clusters[4])
  const secondary = rgbToHex(...clusters[3])
  const tert = rgbToHex(...clusters[2])
  const swatches = clusters.map(c => rgbToHex(...c))
  return { primary, secondary, tert, bg, swatches }
}

export function applyThemeToDocument(t: Theme) {
  document.documentElement.style.setProperty('--acc1', t.primary)
  document.documentElement.style.setProperty('--acc2', t.secondary)
  document.documentElement.style.setProperty('--acc3', t.tert)
  document.documentElement.style.setProperty('--bg', t.bg)
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = url
  })
}

function drawToCanvas(img: HTMLImageElement, size: number) {
  const c = document.createElement('canvas')
  const s = Math.min(size, Math.max(8, Math.floor(Math.min(img.width, img.height))))
  c.width = s; c.height = s
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, s, s)
  const data = ctx.getImageData(0, 0, s, s).data
  return { data, width: s, height: s }
}

function kMeans(points: [number, number, number][], k: number, iters: number) {
  if (points.length === 0) return [[20, 20, 24], [80, 80, 90], [180, 180, 190], [220, 220, 230], [255, 255, 255]]
  const centroids = Array.from({ length: k }, (_, i) => points[Math.floor((i + 1) * points.length / (k + 1))].slice() as [number, number, number])
  const assigns = new Array(points.length).fill(0)
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < points.length; i++) {
      let best = 0, bd = 1e9
      for (let c = 0; c < k; c++) {
        const d = dist3(points[i], centroids[c])
        if (d < bd) { bd = d; best = c }
      }
      assigns[i] = best
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0])
    for (let i = 0; i < points.length; i++) {
      const a = assigns[i]; const p = points[i]
      sums[a][0] += p[0]; sums[a][1] += p[1]; sums[a][2] += p[2]; sums[a][3]++
    }
    for (let c = 0; c < k; c++) {
      const s = sums[c][3] || 1
      centroids[c] = [sums[c][0] / s, sums[c][1] / s, sums[c][2] / s] as [number, number, number]
    }
  }
  return centroids
}

function dist3(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}
function luminance(rgb: [number, number, number]) { const [r, g, b] = rgb.map(v => v / 255); return 0.299 * r + 0.587 * g + 0.114 * b }
function rgbToHex(r: number, g: number, b: number) { return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('') }