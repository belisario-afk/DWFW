import { defineConfig } from 'vite'

// Important for GitHub Pages to serve from /DWFW/ base
export default defineConfig({
  base: '/DWFW/',
  resolve: {
    alias: [
      { find: /^@auth\/(.*)$/, replacement: '/src/auth/$1' },
      { find: /^@spotify\/(.*)$/, replacement: '/src/spotify/$1' },
      { find: /^@audio\/(.*)$/, replacement: '/src/audio/$1' },
      { find: /^@visuals\/(.*)$/, replacement: '/src/visuals/$1' },
      { find: /^@scenes\/(.*)$/, replacement: '/src/visuals/scenes/$1' },
      { find: /^@controllers\/(.*)$/, replacement: '/src/controllers/$1' },
      { find: /^@ui\/(.*)$/, replacement: '/src/ui/$1' },
      { find: /^@utils\/(.*)$/, replacement: '/src/utils/$1' }
    ]
  },
  build: {
    target: 'es2022'
  },
  server: {
    port: 5173,
    host: '127.0.0.1'
  }
})