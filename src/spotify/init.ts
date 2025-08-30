import { SpotifyAPI } from '@spotify/api'
import { createVerifierState, createCodeChallenge, getStoredVerifier, getStoredState, clearPkce } from '@auth/pkce'
import { safeGet, safeSet } from '@utils/storage'

const TOKEN_KEY = 'spotify:token'
const REFRESH_KEY = 'spotify:refresh'
const EXPIRES_KEY = 'spotify:expires'

export type Auth = { token: string; expiresAt: number }
export type Playback = null

function getClientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (!id) {
    console.warn('Missing VITE_SPOTIFY_CLIENT_ID. Set it in .env.')
  }
  return id
}

function getRedirectUri(): string {
  // Use callback path; 404.html will bounce back to base and we restore the query
  const base = import.meta.env.BASE_URL || '/'
  const url = new URL(base, location.origin)
  url.pathname = (base.endsWith('/') ? base : base + '/') + 'callback'
  return url.toString()
}

export async function handleAuthRedirectIfNeeded() {
  const url = new URL(location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) return

  const storedState = getStoredState()
  const verifier = getStoredVerifier()
  if (!storedState || !verifier || storedState !== state) {
    clearPkce()
    console.error('State/verifier mismatch; aborting auth.')
    history.replaceState(null, '', location.pathname) // strip params
    return
  }

  try {
    const body = new URLSearchParams()
    body.set('client_id', getClientId())
    body.set('grant_type', 'authorization_code')
    body.set('code', code)
    body.set('redirect_uri', getRedirectUri())
    body.set('code_verifier', verifier)

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error_description || res.statusText)

    const token = json.access_token as string
    const refresh = json.refresh_token as string
    const expiresAt = Date.now() + (json.expires_in as number) * 1000
    safeSet(TOKEN_KEY, token)
    safeSet(REFRESH_KEY, refresh)
    safeSet(EXPIRES_KEY, String(expiresAt))
  } catch (e) {
    console.error('Token exchange failed', e)
  } finally {
    clearPkce()
    // strip query params
    history.replaceState(null, '', location.pathname)
  }
}

async function refreshTokenIfNeeded(): Promise<string | null> {
  const token = safeGet<string>(TOKEN_KEY)
  const refresh = safeGet<string>(REFRESH_KEY)
  const expiresRaw = safeGet<string>(EXPIRES_KEY)
  const expiresAt = expiresRaw ? parseInt(expiresRaw) : 0

  if (token && Date.now() < expiresAt - 60_000) return token
  if (!refresh) return null

  try {
    const body = new URLSearchParams()
    body.set('client_id', getClientId())
    body.set('grant_type', 'refresh_token')
    body.set('refresh_token', refresh)

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error_description || res.statusText)

    const newToken = json.access_token as string
    const expiresAtNew = Date.now() + (json.expires_in as number) * 1000
    safeSet(TOKEN_KEY, newToken)
    safeSet(EXPIRES_KEY, String(expiresAtNew))
    if (json.refresh_token) safeSet(REFRESH_KEY, json.refresh_token as string)
    return newToken
  } catch (e) {
    console.error('Refresh failed', e)
    return null
  }
}

export async function initAuth(): Promise<{ api: SpotifyAPI; auth: Auth; playback: Playback }> {
  const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement | null
  const ensureLogin = async () => {
    const token = await refreshTokenIfNeeded()
    if (token) return token

    // Start auth
    const { verifier, state } = createVerifierState()
    const challenge = await createCodeChallenge(verifier)
    const scopes = [
      'user-read-playback-state',
      'user-modify-playback-state',
      'streaming',
      'user-read-currently-playing'
    ].join(' ')
    const authUrl = new URL('https://accounts.spotify.com/authorize')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', getClientId())
    authUrl.searchParams.set('redirect_uri', getRedirectUri())
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('scope', scopes)
    location.href = authUrl.toString()
    return null
  }

  loginBtn?.addEventListener('click', () => ensureLogin())

  const token = await refreshTokenIfNeeded()
  if (!token) {
    // Show login panel (handled by index.html default)
  }
  const api = new SpotifyAPI(token || '')
  const auth: Auth = { token: token || '', expiresAt: parseInt(safeGet<string>(EXPIRES_KEY) || '0') }
  const playback: Playback = null
  return { api, auth, playback }
}