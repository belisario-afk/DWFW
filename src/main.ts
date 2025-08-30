// Bundle CSS so Vite resolves it at build time
import './styles.css'

import { Analyzer } from '@audio/analyzer'
import { VisualEngine } from '@visuals/engine'
import { setupUI } from '@ui/setup'
import { handleAuthRedirectIfNeeded, initAuth } from '@spotify/init'
import { safeGet, safeSet } from '@utils/storage'

async function boot() {
  // Restore deep link saved by 404.html if present
  const saved = safeGet<string>('dwfw:path')
  if (saved && location.pathname.endsWith('/')) {
    history.replaceState(null, '', saved)
    safeSet('dwfw:path', '')
  }

  await handleAuthRedirectIfNeeded()

  const analyzer = new Analyzer()
  await analyzer.init(4096)

  const engine = new VisualEngine(analyzer)
  await engine.init(document.getElementById('app')!)

  const { api, auth, playback } = await initAuth()
  setupUI({ api, auth, playback, engine, analyzer })
}
boot().catch(err => console.error(err))