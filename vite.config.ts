import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  base: '/DWFW/',
  resolve: {
    alias: {
      '@visuals': path.resolve(__dirname, 'src/visuals'),
      '@scenes': path.resolve(__dirname, 'src/visuals/scenes'),
      '@audio': path.resolve(__dirname, 'src/audio'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@spotify': path.resolve(__dirname, 'src/spotify'),
      '@auth': path.resolve(__dirname, 'src/auth'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@controllers': path.resolve(__dirname, 'src/controllers')
    }
  }
})