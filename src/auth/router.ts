import { Auth } from './pkce'
import { CONFIG } from '../config'

export async function handleCallbackIfPresent() {
  const url = new URL(location.href)
  if (url.pathname.endsWith('/callback') && (url.searchParams.get('code') || url.searchParams.get('error'))) {
    const auth = new Auth(CONFIG.spotify)
    await auth.handleCallback(url)
    history.replaceState(null, '', '/DWFW/')
  }
}