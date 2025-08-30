import type { SpotifyAPI } from '@spotify/api'
import type { Auth } from '@spotify/init'
import type { Playback } from '@spotify/init'
import type { VisualEngine } from '@visuals/engine'
import type { Analyzer } from '@audio/analyzer'
import { extractThemeFromImage } from '@ui/theme'

export function setupUI(ctx: { api: SpotifyAPI, auth: Auth, playback: Playback | null, engine: VisualEngine, analyzer: Analyzer }) {
  const el = (id: string) => document.getElementById(id)!

  // FPS
  const fpsEl = el('fps')
  let last = performance.now(), frames = 0, acc = 0
  const raf = () => {
    const now = performance.now(), dt = now - last
    last = now; acc += dt; frames++
    if (acc >= 500) { fpsEl.textContent = `FPS ${Math.round((frames/acc)*1000)}`; frames = 0; acc = 0 }
    requestAnimationFrame(raf)
  }; raf()

  const loginPanel = el('login')
  const hasToken = !!ctx.auth.token
  // Show login if no token; hide only when token exists
  loginPanel.classList.toggle('hidden', hasToken)

  // Controls
  const playPause = el('playPause') as HTMLButtonElement
  const prev = el('prev') as HTMLButtonElement
  const next = el('next') as HTMLButtonElement
  const seek = el('seek') as HTMLInputElement
  const volume = el('volume') as HTMLInputElement
  const devices = el('devices') as HTMLSelectElement
  const fullscreen = el('fullscreen') as HTMLButtonElement
  const record = el('record') as HTMLButtonElement
  const time = el('time') as HTMLSpanElement
  const captureBtn = el('captureBtn') as HTMLButtonElement
  const trackBadge = el('trackBadge')

  // Guard all API calls behind token presence to avoid 400 spam
  const ensureToken = () => !!ctx.auth.token

  playPause.onclick = async () => {
    if (!ensureToken()) return alert('Login with Spotify first.')
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (st?.is_playing) await (ctx.api as any).pause?.()
    else await (ctx.api as any).play?.()
  }
  prev.onclick = () => { if (ensureToken()) (ctx.api as any).previous?.() }
  next.onclick = () => { if (ensureToken()) (ctx.api as any).next?.() }
  volume.oninput = () => { if (ensureToken()) (ctx.api as any).setVolume?.(parseFloat(volume.value)) }
  fullscreen.onclick = () => document.documentElement.requestFullscreen().catch(()=>{})

  captureBtn.onclick = async () => {
    const ok = await ctx.analyzer.enableDisplayCapture()
    alert(ok ? 'Audio capture enabled' : 'Capture blocked or not granted')
  }

  // Recording
  let rec: MediaRecorder | null = null; let chunks: BlobPart[] = []
  record.onclick = () => {
    if (!rec) {
      const stream = (ctx.engine as any).renderer.domElement.captureStream(60)
      rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'dwfw-recording.webm'; a.click()
        chunks = []; rec = null; record.textContent = 'Record'
      }
      rec.start(); record.textContent = 'Stop'
    } else { rec.stop() }
  }

  // Devices (optional events)
  devices.onchange = () => { if (ensureToken() && devices.value) (ctx.api as any).transferPlayback?.(devices.value) }

  // Poll playback ONLY if we have a token
  if (hasToken) {
    setInterval(async () => {
      const st = await ctx.api.getPlaybackState().catch(()=>null)
      if (!st) return
      const pos = st.progress_ms || 0, dur = st.item?.duration_ms || 1
      seek.value = String(Math.round(pos / dur * 1000))
      time.textContent = `${fmt(pos)} / ${fmt(dur)}`
      trackBadge.textContent = st.item ? `${st.item.name} — ${st.item.artists?.[0]?.name || ''}` : '—'
      const cover = st?.item?.album?.images?.[0]?.url
      if (cover && cover !== ctx.engine.albumURL) {
        ctx.engine.albumURL = cover
        try {
          const theme = await extractThemeFromImage(cover)
          document.documentElement.style.setProperty('--acc1', theme.primary)
          document.documentElement.style.setProperty('--acc2', theme.secondary)
          document.documentElement.style.setProperty('--acc3', theme.tert)
          document.documentElement.style.setProperty('--bg', theme.bg)
          ;['sw1','sw2','sw3','sw4'].forEach((id, i) => {
            const s = document.getElementById(id) as HTMLSpanElement
            if (!s) return; s.style.background = theme.swatches[i] || theme.primary
          })
          ctx.engine.setPalette({ primary: theme.primary, secondary: theme.secondary, tert: theme.tert, bg: theme.bg })
        } catch {}
      }
    }, 1000)
  } else {
    trackBadge.textContent = 'Not logged in'
  }

  seek.oninput = async () => {
    if (!ensureToken()) return
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (!st) return
    const dur = st.item?.duration_ms || 1
    const target = Math.round(parseInt(seek.value) / 1000 * dur)
    ;(ctx.api as any).seek?.(target)
  }
  const fmt = (ms: number) => { const s = Math.floor(ms/1000), m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}` }

  // Visuals/FX/Perf wiring
  const sceneSelect = el('sceneSelect') as HTMLSelectElement
  sceneSelect.onchange = () => ctx.engine.switchScene(sceneSelect.value)

  const apply = () => ctx.engine.setQuality({
    scale: ((document.getElementById('qScale') as HTMLSelectElement).value === 'auto') ? 'auto' as any : parseFloat((document.getElementById('qScale') as HTMLSelectElement).value),
    msaa: parseInt((document.getElementById('qMSAA') as HTMLSelectElement).value),
    bloom: (document.getElementById('qBloom') as HTMLInputElement).checked,
    bloomInt: parseFloat((document.getElementById('qBloomInt') as HTMLInputElement).value),
    ssao: (document.getElementById('qSSAO') as HTMLInputElement).checked,
    dof: (document.getElementById('qDOF') as HTMLInputElement).checked,
    ca: parseFloat((document.getElementById('qCA') as HTMLInputElement).value),
    vignette: parseFloat((document.getElementById('qVig') as HTMLInputElement).value),
    grain: parseFloat((document.getElementById('qGrain') as HTMLInputElement).value)
  })
  ;['qScale','qMSAA','qBloom','qBloomInt','qSSAO','qDOF','qCA','qVig','qGrain'].forEach(id => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).addEventListener('input', apply))
  apply()
}