import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/live-api': { target: 'http://127.0.0.1:8788', changeOrigin: true, rewrite: p => p.replace(/^\/live-api/, '') } } },
})
