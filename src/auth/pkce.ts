import { safeGet, safeSet, safeDel } from '@utils/storage'

const KEY_VERIFIER = 'pkce:verifier'
const KEY_STATE = 'pkce:state'

export function createVerifierState() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)))
  safeSet(KEY_VERIFIER, verifier)
  safeSet(KEY_STATE, state)
  return { verifier, state }
}

export async function createCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64url(new Uint8Array(digest))
}

export function getStoredVerifier(): string | null {
  const v = safeGet<string>(KEY_VERIFIER)
  return typeof v === 'string' ? v : null
}
export function getStoredState(): string | null {
  const s = safeGet<string>(KEY_STATE)
  return typeof s === 'string' ? s : null
}
export function clearPkce() { safeDel(KEY_VERIFIER); safeDel(KEY_STATE) }

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}