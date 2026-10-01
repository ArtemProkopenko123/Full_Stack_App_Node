import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // maplibre-gl spawns its own Web Worker from a file next to its entry point. Vite's dev
  // dependency pre-bundler moves the entry but not that worker file, so the map would fail to
  // render in `npm run dev`. Serving maplibre-gl untouched avoids it (production build is fine).
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
