export const CONFIG = {
  appName: 'DWFW',
  spotify: {
    clientId: '927fda6918514f96903e828fcd6bb576',
    redirectUri: (import.meta.env.DEV)
      ? 'http://127.0.0.1:5173/callback'
      : 'https://belisario-afk.github.io/DWFW/callback',
    scopes: [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'streaming',
      'app-remote-control',
      'user-read-email',
      'user-read-private'
    ].join(' ')
  },
  visuals: {
    defaultScene: 'Particles',
    adaptiveTargetFPS: 60,
    targetFPSHigh: 120
  }
}