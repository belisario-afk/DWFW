import { SpotifyAPI } from '@spotify/api'
import { createVerifierState, createCodeChallenge, getStoredVerifier, getStoredState, clearPkce } from '@auth/pkce'
import { safeGet, safeSet } from '@utils/storage'

const TOKEN_KEY = 'spotify:token'
const REFRESH_KEY = 'spotify:refresh'
const EXPIRES_KEY = 'spotify:expires'
const CLIENT_ID_LS = 'spotify:client_id' // optional runtime override

export type Auth = { token: string; expiresAt: number }
export type Playback = null

function getClientId(): string {
  // 1) Build-time env (Vite replaces this literal in the bundle)
  const envId = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim()

  // 2) Runtime meta tag fallback (edit index.html head to set it)
  const metaId = (document.querySelector('meta[name="spotify-client-id"]') as HTMLMetaElement | null)?.content?.trim()
  const metaValid = metaId && metaId.length > 0 ? metaId : undefined

  // 3) Runtime localStorage fallback (you can set from DevTools)
  const lsRaw = localStorage.getItem(CLIENT_ID_LS)
  const lsId = lsRaw && lsRaw.trim().length > 0 ? lsRaw.trim() : undefined

  const id = envId || metaValid || lsId
  if (!id) {
    console.warn('Spotify Client ID is missing. Set VITE_SPOTIFY_CLIENT_ID in .env at build time, or add <meta name="spotify-client-id" content="..."> in index.html, or set localStorage["spotify:client_id"].')
  }
  return id || ''
}

function getRedirectUri(): string {
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
    history.replaceState(null, '', location.pathname)
    return
  }

  try {
    const clientId = getClientId()
    if (!clientId) throw new Error('Missing Spotify Client ID')

    const body = new URLSearchParams()
    body.set('client_id', clientId)
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
    const clientId = getClientId()
    if (!clientId) throw new Error('Missing Spotify Client ID')

    const body = new URLSearchParams()
    body.set('client_id', clientId)
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

    const clientId = getClientId()
    if (!clientId) {
      alert('Missing Spotify Client ID. Set VITE_SPOTIFY_CLIENT_ID in .env and rebuild, or add it to index.html in the meta[name="spotify-client-id"].')
      return null
    }

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
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', getRedirectUri())
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('scope', scopes)
    location.href = authUrl.toString()
    return null
  }

  loginBtn?.addEventListener('click', () => void ensureLogin())

  const token = await refreshTokenIfNeeded()
  const api = new SpotifyAPI(token || '')
  const auth: Auth = { token: token || '', expiresAt: parseInt(safeGet<string>(EXPIRES_KEY) || '0') }
  const playback: Playback = null
  return { api, auth, playback }
}