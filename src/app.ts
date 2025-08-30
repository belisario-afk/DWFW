import { CONFIG } from './config'
import { Auth } from '@auth/pkce'
import { SpotifyAPI } from '@spotify/api'
import { Playback } from '@spotify/playback'
import { Analyzer } from '@audio/analyzer'
import { VisualEngine } from '@visuals/engine'
import { Director } from '@controllers/director'
import { VJ } from '@controllers/vj'
import { setupUI } from '@ui/setup'
import { paletteFromAlbumURL, applyPaletteToCSS } from '@utils/color'
import { cacheCover } from '@utils/db'

export async function initApp() {
  const loginEl = document.getElementById('login') as HTMLDivElement
  const uiEl = document.getElementById('ui') as HTMLDivElement
  const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement

  const auth = new Auth(CONFIG.spotify)
  const api = new SpotifyAPI(auth)
  const analyzer = new Analyzer()
  await analyzer.init()

  const engine = new VisualEngine(analyzer)
  await engine.init(document.getElementById('app')!)

  const director = new Director(engine, analyzer, api)
  const vj = new VJ(engine)

  setupUI({ api, auth, playback: null, engine, analyzer, director, vj })

  loginBtn.onclick = () => auth.startLogin()

  if (await auth.hasValidToken()) {
    await postLogin()
  } else {
    loginEl.classList.remove('hidden')
  }

  async function postLogin() {
    loginEl.classList.add('hidden')
    uiEl.classList.remove('hidden')

    const playback = new Playback(api, analyzer)
    await playback.init()

    setupUI({ api, auth, playback, engine, analyzer, director, vj }) // rebind controls

    // Watch track changes to update palette and director
    api.on('track', async (t) => {
      if (!t) return
      director.onTrack(t)
      if (t.item?.album?.images?.[0]?.url) {
        const url = t.item.album.images[0].url
        const cached = await cacheCover(url)
        const pal = await paletteFromAlbumURL(cached.url)
        applyPaletteToCSS(pal)
        engine.setPalette(pal, cached.url)
      }
    })

    // Kick initial state
    const state = await api.getPlaybackState().catch(() => null)
    if (state) api.emit('track', state)

    // Device list polling
    setInterval(() => api.refreshDevices(), 5000)
  }
}