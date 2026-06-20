import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base is set to the repo name so the app works when served from
// https://ytcs.github.io/aethelgard/ (GitHub Pages project site).
export default defineConfig({
  base: '/aethelgard/',
  plugins: [react()],
  server: {
    fs: {
      allow: ['..']
    }
  }
})
