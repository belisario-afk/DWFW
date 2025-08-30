# DWFW — Spotify Visual Director (GitHub Pages SPA)

DWFW is a static, client-only Vite + TypeScript web app that authenticates with Spotify using Authorization Code Flow with PKCE (no client secret), plays or controls Spotify playback, performs real-time audio analysis, and renders audio-reactive 3D visuals with a VJ toolset. Designed to run on GitHub Pages.

IMPORTANT
- Never commit a Spotify client secret. This project does not require it. If you previously exposed one, rotate it in the Spotify Dashboard immediately.

Live paths
- GitHub Pages base: https://belisario-afk.github.io/DWFW/
- Redirect URIs to register:
  - Production: https://belisario-afk.github.io/DWFW/callback
  - Local dev: http://127.0.0.1:5173/callback

Features
- PKCE OAuth, tokens stored in localStorage; refresh handled client-side (no secrets)
- Web Playback SDK support for Premium accounts, with fallback to controlling an active device for Free
- Player controls: play/pause, next/prev, seek, volume, device picker
- Audio features:
  - FFT up to 8192, log bands (bass/mids/highs), spectral flux onsets
  - Beat phase and tempo estimate (placeholder from internal clock; extendable)
  - Chroma vector (placeholder)
  - Loudness (LUFS-style short-term approximation)
  - Section novelty curve (placeholder)
- Color palette extraction from album art; theming and environment usage
- Visual scenes (hot-swappable):
  - Particles (GPU-instanced point cloud with curl-like motion)
  - Fluid 2D (ping-pong advection with beat-synced dye)
  - Ray-marched SDF Tunnel (neon glow)
  - Terrain/Heightfield (per-band displacement)
  - Typography (variable weight/stretch reactive to RMS & centroid)
  - Smooth crossfades between scenes
- Director / VJ:
  - Scene presets and Auto-Cinematic (scene selection via Spotify audio features)
  - Cue markers per track (stored in IndexedDB)
  - MIDI/Keyboard mapping, macro knobs, canvas recording to WebM
- Quality panel:
  - Render scale, MSAA/TAA toggle (TAA via postprocessing approximation), bloom, SSAO/SSGI, motion blur, DOF, volumetrics (subset)
  - Raymarch steps, particle count, fluid resolution
  - Optional WebGPU path-trace demo flag placeholder
- Performance:
  - Adaptive frame governor to hold target FPS
  - Offscreen analysis via AudioWorklet (skeleton)
  - Lazy-load heavy scenes post-auth (Vite chunks)
  - Album art + metadata cached with ETags in IndexedDB
  - Token refresh + rate limit backoff
- Accessibility:
  - Epilepsy-safe mode caps intensity / strobe rate
  - Reduced-motion and high-contrast
  - Intensity limiter
  - Ambient screensaver after 30s pause

Repo and Tech
- Repo: belisario-afk/DWFW
- Stack: Vite + TypeScript + three + postprocessing

Setup

1) Spotify Developer Dashboard
- Create an app and copy the Client ID (do NOT use or expose a client secret in this repo).
- Redirect URIs (exact):
  - https://belisario-afk.github.io/DWFW/callback
  - http://127.0.0.1:5173/callback
- Web Playback SDK: ensure your site origin is allowed in the app settings (the redirect origins above are sufficient for OAuth; the SDK uses the same token).
- Scopes requested: streaming, app-remote-control, user-read-playback-state, user-modify-playback-state, user-read-currently-playing, user-read-email, user-read-private.
- If you previously exposed a secret, rotate it now. Never store secrets in the repo.

2) Local Development
- Node 18+ recommended.
- Install: npm install
- Dev server: npm run dev (opens http://127.0.0.1:5173)
- The Client ID is embedded in src/config.ts as requested. You can override with Vite env (VITE_SPOTIFY_CLIENT_ID) if desired.

3) Build and Deploy to GitHub Pages
- Build: npm run build
- The included GitHub Actions workflow builds on push to main and deploys dist/ to gh-pages.
- Ensure GitHub Pages is configured to serve from the gh-pages branch in your repo settings.

Routing on GitHub Pages
- index.html is served at /DWFW/.
- 404.html captures deep links such as /callback and forwards them to the SPA.

Notes and Caveats
- Due to Spotify’s DRM, raw audio samples from the Web Playback SDK are not accessible to the WebAudio graph. The current analyzer runs in an AudioWorklet with a timing source; visuals react to rhythmic features (tempo/beat proxy) and polled playback data. You can extend this by using microphone/loopback capture on desktop OSes if desired.
- Premium users get in-app playback via the SDK; free users can still control an already active device via Web API.
- MediaRecorder to WebM (VP9) is supported in Chromium-based browsers; Safari support varies.

Extending
- Add more scenes under src/visuals/scenes and register them in engine.scenes.
- Implement tighter beat/onset detection by fusing Spotify’s /audio-analysis endpoints and local spectral flux.
- Wire quality sliders to actual postprocessing parameters in src/visuals/engine.ts.
- Implement epilepsy-safe constraints in VJ mappings (clamp bloom/intensity, limit flicker).

Security
- Authorization Code + PKCE: no client secret needed. Tokens are stored locally; refresh tokens are used with client_id only.
- Never expose a client secret. If one is accidentally committed, rotate it in the Spotify Dashboard immediately.

License
- Choose and add a LICENSE file if you plan to open source.
