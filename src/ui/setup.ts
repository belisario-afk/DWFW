import type { SpotifyAPI } from '@spotify/api'
import type { Auth } from '@auth/pkce'
import type { Playback } from '@spotify/playback'
import type { VisualEngine } from '@visuals/engine'
import type { Analyzer } from '@audio/analyzer'
import { applyThemeToDocument, extractThemeFromImage } from '@ui/theme'

export function setupUI(ctx: { api: SpotifyAPI, auth: Auth, playback: Playback | null, engine: VisualEngine, analyzer: Analyzer }) {
  const el = (id: string) => document.getElementById(id)!

  const fpsEl = el('fps')
  let last = performance.now(), frames = 0, acc = 0
  const raf = () => {
    const now = performance.now(), dt = now - last
    last = now; acc += dt; frames++
    if (acc >= 500) {
      const fps = Math.round((frames / acc) * 1000)
      fpsEl.textContent = `FPS ${fps}`
      frames = 0; acc = 0
    }
    requestAnimationFrame(raf)
  }; raf()

  const trackBadge = el('trackBadge')

  // Playback controls
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

  playPause.onclick = async () => {
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (st?.is_playing) await ctx.api.pause(); else await ctx.api.play()
  }
  prev.onclick = () => ctx.api.previous()
  next.onclick = () => ctx.api.next()
  volume.oninput = () => ctx.api.setVolume(parseFloat(volume.value))
  fullscreen.onclick = () => document.documentElement.requestFullscreen().catch(()=>{})

  // Experimental audio capture for precise analysis
  captureBtn.onclick = async () => {
    const ok = await ctx.analyzer.enableDisplayCapture()
    alert(ok ? 'Audio capture enabled' : 'Capture blocked or not granted')
  }

  // Recording
  let rec: MediaRecorder | null = null
  let chunks: BlobPart[] = []
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
        chunks = []; rec = null
      }
      rec.start()
      record.textContent = 'Stop'
    } else {
      rec.stop()
      record.textContent = 'Record'
    }
  }

  // Devices
  ctx.api.on('devices', (list) => {
    const sel = devices.value
    devices.innerHTML = ''
    for (const d of list) {
      const opt = document.createElement('option')
      opt.value = d.id || ''
      opt.textContent = `${d.name} ${d.is_active ? '•' : ''}`
      devices.appendChild(opt)
    }
    if (sel) devices.value = sel
  })
  devices.onchange = () => { if (devices.value) ctx.api.transferPlayback(devices.value) }

  // Seek/time
  setInterval(async () => {
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (!st) return
    const pos = st.progress_ms || 0
    const dur = st.item?.duration_ms || 1
    seek.value = String(Math.round(pos / dur * 1000))
    time.textContent = `${fmt(pos)} / ${fmt(dur)}`
    if (st.item?.album?.images?.[0]?.url) {
      const url = st.item.album.images[0].url
      ctx.engine.setAlbumCover(url)
      // swatches
      try {
        const t = await extractThemeFromImage(url)
        ;['sw1','sw2','sw3','sw4'].forEach((id, i) => {
          const s = document.getElementById(id) as HTMLSpanElement
          if (s && t.swatches[i]) s.style.background = t.swatches[i]
        })
      } catch {}
    }
    trackBadge.textContent = st.item ? `${st.item.name} — ${st.item.artists?.[0]?.name || ''}` : '—'
  }, 1000)
  seek.oninput = async () => {
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (!st) return
    const dur = st.item?.duration_ms || 1
    const target = Math.round(parseInt(seek.value) / 1000 * dur)
    ctx.api.seek(target)
  }
  const fmt = (ms: number) => { const s = Math.floor(ms/1000), m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}` }

  // Visual tabs & quality
  const sceneSelect = el('sceneSelect') as HTMLSelectElement
  sceneSelect.onchange = () => ctx.engine.switchScene(sceneSelect.value)

  const apply = () => ctx.engine.setQuality({
    renderScale: (document.getElementById('qScale') as HTMLSelectElement).value === 'auto' ? 'auto' : parseFloat((document.getElementById('qScale') as HTMLSelectElement).value),
    msaa: parseInt((document.getElementById('qMSAA') as HTMLSelectElement).value) as any,
    targetFPS: parseInt((document.getElementById('qFPS') as HTMLInputElement).value),
    intensity: parseFloat((document.getElementById('vjIntensity') as HTMLInputElement).value),
    speed: parseFloat((document.getElementById('vjSpeed') as HTMLInputElement).value),

    bloom: (document.getElementById('qBloom') as HTMLInputElement).checked,
    bloomIntensity: parseFloat((document.getElementById('qBloomInt') as HTMLInputElement).value),
    ssao: (document.getElementById('qSSAO') as HTMLInputElement).checked,
    dof: (document.getElementById('qDOF') as HTMLInputElement).checked,
    chromAb: parseFloat((document.getElementById('qCA') as HTMLInputElement).value),
    vignette: parseFloat((document.getElementById('qVig') as HTMLInputElement).value),
    grain: parseFloat((document.getElementById('qGrain') as HTMLInputElement).value),
    glitch: parseFloat((document.getElementById('qGlitch') as HTMLInputElement).value),

    particles: {
      count: parseInt((document.getElementById('qParticles') as HTMLInputElement).value),
      size: parseFloat((document.getElementById('qPSize') as HTMLInputElement).value),
      spread: parseFloat((document.getElementById('qPSpread') as HTMLInputElement).value)
    },
    tunnel: { steps: parseInt((document.getElementById('qSteps') as HTMLInputElement).value) },
    fluid: { res: parseInt((document.getElementById('qFluid') as HTMLSelectElement).value) as any }
  } as any)

  ;['qScale','qMSAA','qFPS','vjIntensity','vjSpeed','qBloom','qBloomInt','qSSAO','qDOF','qCA','qVig','qGrain','qGlitch','qParticles','qPSize','qPSpread','qSteps','qFluid']
    .forEach(id => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).addEventListener('input', apply))
  apply()

  // Accessibility hooks
  const accHighContrast = el('accHighContrast') as HTMLInputElement
  accHighContrast.onchange = () => document.documentElement.style.setProperty('--panel', accHighContrast.checked ? 'rgba(0,0,0,0.8)' : 'rgba(8,8,10,0.6)')
}