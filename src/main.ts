import { initApp } from './app'
import { handleCallbackIfPresent } from '@auth/router'

// Restore SPA deep link from 404 fallback
const saved = sessionStorage.getItem('dwfw:path')
if (saved) {
  history.replaceState(null, '', '/DWFW/' + saved.replace(/^\//, ''))
  sessionStorage.removeItem('dwfw:path')
}

handleCallbackIfPresent().then(() => initApp())