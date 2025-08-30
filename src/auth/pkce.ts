type SpotifyConfig = {
  clientId: string
  redirectUri: string
  scopes: string
}

type TokenSet = {
  access_token: string
  token_type: 'Bearer'
  scope: string
  expires_in: number
  refresh_token?: string
  obtained_at: number
}

export class Auth {
  private cfg: SpotifyConfig
  private tokenKey = 'dwfw:token'
  private verifierKey = 'dwfw:verifier'

  constructor(cfg: SpotifyConfig) {
    this.cfg = cfg
  }

  async startLogin() {
    const codeVerifier = this.randomString(64)
    const codeChallenge = await this.sha256base64url(codeVerifier)
    sessionStorage.setItem(this.verifierKey, codeVerifier)
    const url = new URL('https://accounts.spotify.com/authorize')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.cfg.clientId)
    url.searchParams.set('redirect_uri', this.cfg.redirectUri)
    url.searchParams.set('scope', this.cfg.scopes)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('code_challenge', codeChallenge)
    location.assign(url.toString())
  }

  async handleCallback(cbUrl: URL) {
    const err = cbUrl.searchParams.get('error')
    if (err) {
      alert('Spotify auth error: ' + err)
      return
    }
    const code = cbUrl.searchParams.get('code')!
    const verifier = sessionStorage.getItem(this.verifierKey)
    if (!verifier) throw new Error('Missing PKCE verifier')

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
      client_id: this.cfg.clientId,
      code_verifier: verifier
    })
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) throw new Error('Token exchange failed')
    const tok = await res.json() as Omit<TokenSet, 'obtained_at'>
    const full: TokenSet = { ...tok, obtained_at: Date.now() }
    localStorage.setItem(this.tokenKey, JSON.stringify(full))
  }

  async hasValidToken() {
    const t = this.getToken()
    if (!t) return false
    if (this.isExpired(t)) {
      try {
        await this.refresh()
        return true
      } catch {
        return false
      }
    }
    return true
  }

  get accessToken() {
    return this.getToken()?.access_token ?? null
  }

  async ensureToken(): Promise<string> {
    const t = this.getToken()
    if (!t) throw new Error('Not authenticated')
    if (this.isExpired(t)) await this.refresh()
    return this.getToken()!.access_token
  }

  logout() { localStorage.removeItem(this.tokenKey) }

  private getToken(): TokenSet | null {
    const raw = localStorage.getItem(this.tokenKey)
    if (!raw) return null
    try { return JSON.parse(raw) as TokenSet } catch { return null }
  }

  private isExpired(tok: TokenSet) {
    const skew = 30_000
    return Date.now() > tok.obtained_at + tok.expires_in * 1000 - skew
  }

  private async refresh() {
    const t = this.getToken()
    if (!t?.refresh_token) throw new Error('No refresh token')
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: this.cfg.clientId
    })
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) throw new Error('Refresh failed')
    const nt = await res.json()
    const merged: TokenSet = {
      access_token: nt.access_token,
      token_type: nt.token_type,
      scope: nt.scope ?? t.scope,
      expires_in: nt.expires_in,
      refresh_token: nt.refresh_token ?? t.refresh_token,
      obtained_at: Date.now()
    }
    localStorage.setItem(this.tokenKey, JSON.stringify(merged))
  }

  private randomString(len: number) {
    const arr = new Uint8Array(len)
    crypto.getRandomValues(arr)
    return Array.from(arr).map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'[b % 66]).join('')
  }
  private async sha256base64url(s: string) {
    const enc = new TextEncoder().encode(s)
    const digest = await crypto.subtle.digest('SHA-256', enc)
    const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
}