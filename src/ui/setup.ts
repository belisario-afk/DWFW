import type { SpotifyAPI } from '@spotify/api'
import type { Auth } from '@auth/pkce'
import type { Playback } from '@spotify/playback'
import type { VisualEngine } from '@visuals/engine'
import type { Analyzer } from '@audio/analyzer'
import type { Director } from '@controllers/director'
import type { VJ } from '@controllers/vj'

export function setupUI(ctx: {
  api: SpotifyAPI, auth: Auth, playback: Playback | null, engine: VisualEngine, analyzer: Analyzer, director: Director, vj: VJ
}) {
  const el = (id: string) => document.getElementById(id)!

  // FPS label
  const fpsEl = el('fps')
  let last = performance.now(), frames = 0, acc = 0
  const raf = () => {
    const now = performance.now()
    const dt = now - last
    last = now
    acc += dt; frames++
    if (acc >= 500) {
      const fps = Math.round((frames / acc) * 1000)
      fpsEl.textContent = `FPS ${fps} • ${navigator.userAgent}`
      frames = 0; acc = 0
    }
    requestAnimationFrame(raf)
  }; raf()

  // Buttons and inputs
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

  const sceneSelect = el('sceneSelect') as HTMLSelectElement
  const autoCine = el('autoCine') as HTMLButtonElement
  const cueAdd = el('cueAdd') as HTMLButtonElement
  const cueList = el('cueList') as HTMLButtonElement

  const qScale = el('qScale') as HTMLInputElement
  const qMSAA = el('qMSAA') as HTMLSelectElement
  const qBloom = el('qBloom') as HTMLInputElement
  const qBloomInt = el('qBloomInt') as HTMLInputElement
  const qSSAO = el('qSSAO') as HTMLInputElement
  const qDOF = el('qDOF') as HTMLInputElement
  const qCA = el('qCA') as HTMLInputElement
  const qVig = el('qVig') as HTMLInputElement
  const qGrain = el('qGrain') as HTMLInputElement
  const qSteps = el('qSteps') as HTMLInputElement
  const qParticles = el('qParticles') as HTMLInputElement
  const qFluid = el('qFluid') as HTMLSelectElement

  const vjIntensity = el('vjIntensity') as HTMLInputElement
  const vjGlitch = el('vjGlitch') as HTMLInputElement
  const vjSpeed = el('vjSpeed') as HTMLInputElement
  const vjLearn = el('vjLearn') as HTMLButtonElement

  const accEpilepsy = el('accEpilepsy') as HTMLInputElement
  const accReducedMotion = el('accReducedMotion') as HTMLInputElement
  const accHighContrast = el('accHighContrast') as HTMLInputElement
  const accLimiter = el('accLimiter') as HTMLInputElement

  // Playback handlers
  playPause.onclick = async () => {
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (st?.is_playing) await ctx.api.pause(); else await ctx.api.play()
  }
  prev.onclick = () => ctx.api.previous()
  next.onclick = () => ctx.api.next()
  volume.oninput = () => ctx.api.setVolume(parseFloat(volume.value))
  fullscreen.onclick = () => document.documentElement.requestFullscreen().catch(()=>{})

  // Experimental: capture tab/system audio to drive precise analysis
  captureBtn.onclick = async () => {
    const ok = await ctx.analyzer.enableDisplayCapture()
    alert(ok ? 'Audio capture enabled. Visuals now react to real audio.' : 'Audio capture was blocked or not granted.')
  }

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

  // Seek and time
  setInterval(async () => {
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (!st) return
    const pos = st.progress_ms || 0
    const dur = st.item?.duration_ms || 1
    seek.value = String(Math.round(pos / dur * 1000))
    time.textContent = `${fmt(pos)} / ${fmt(dur)}`
  }, 1000)
  seek.oninput = async () => {
    const st = await ctx.api.getPlaybackState().catch(()=>null)
    if (!st) return
    const dur = st.item?.duration_ms || 1
    const target = Math.round(parseInt(seek.value) / 1000 * dur)
    ctx.api.seek(target)
  }
  const fmt = (ms: number) => { const s = Math.floor(ms/1000), m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}` }

  // Scene selection
  sceneSelect.onchange = () => ctx.engine.switchScene(sceneSelect.value)
  autoCine.onclick = () => alert('Auto-Cinematic uses Spotify audio features per track.')

  cueAdd.onclick = async () => {
    const bar = prompt('Cue at bar number?', '33')
    const scene = prompt('Scene?', 'Kaleidoscope')
    if (!bar || !scene) return
    await ctx.director.addCue({ bar: parseInt(bar), action: 'switch', scene })
    alert('Cue added.')
  }
  cueList.onclick = () => {
    const cues = ctx.director.listCues().map(c => `Bar ${c.bar} → ${c.scene}`).join('\n')
    alert(cues || 'No cues')
  }

  // Quality
  const applyQuality = () => ctx.engine.setQuality({
    scale: parseFloat(qScale.value),
    msaa: parseInt(qMSAA.value),
    bloom: qBloom.checked,
    bloomInt: parseFloat(qBloomInt.value),
    ssao: qSSAO.checked,
    dof: qDOF.checked,
    ca: parseFloat(qCA.value),
    vignette: parseFloat(qVig.value),
    grain: parseFloat(qGrain.value),
    glitch: parseFloat(vjGlitch.value)
  })
  qScale.oninput = applyQuality
  qMSAA.onchange = applyQuality
  qBloom.onchange = applyQuality
  qBloomInt.oninput = applyQuality
  qSSAO.onchange = applyQuality
  qDOF.onchange = applyQuality
  qCA.oninput = applyQuality
  qVig.oninput = applyQuality
  qGrain.oninput = applyQuality
  vjGlitch.oninput = applyQuality
  applyQuality()

  // Raymarch steps (Tunnel)
  qSteps.oninput = () => { /* If needed, add engine.current param wiring */ }
  qParticles.oninput = () => { /* Could recreate particle scene with new count */ }
  qFluid.onchange = () => { /* Re-init fluid with new res if implemented */ }

  // VJ
  vjIntensity.oninput = () => ctx.vj.setIntensity(parseFloat(vjIntensity.value))
  vjSpeed.oninput = () => ctx.vj.setSpeed(parseFloat(vjSpeed.value))
  vjLearn.onclick = () => ctx.vj.enableMIDILearn((learn) => {
    alert('Twist knobs now to map CCs to Intensity/Glitch/Speed.')
    learn(1, v => vjIntensity.value = String(v))
    learn(2, v => vjGlitch.value = String(v))
    learn(3, v => vjSpeed.value = String(0.5 + v*1.5))
  })

  // Accessibility
  accHighContrast.onchange = () => document.documentElement.style.setProperty('--panel', accHighContrast.checked ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.55)')
  accReducedMotion.onchange = () => { /* throttle engine updates or clamp mapping */ }
  accEpilepsy.onchange = () => { /* clamp bloom/intensity & strobe freq */ }
  accLimiter.oninput = () => { /* clamp global intensity ceiling */ }
}