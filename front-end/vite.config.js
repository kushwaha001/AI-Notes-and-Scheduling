import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Same-origin API proxy: the browser calls /api/... and Vite forwards it to the
// backend on :9000, so the whole app works behind a single tunnel URL. Applied to
// BOTH the dev server and `vite preview` (which serves the production build).
const apiProxy = {
  '/api': {
    target: 'http://localhost:9000',
    changeOrigin: true,
    ws: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // listen on all interfaces (needed for tunnels)
    allowedHosts: true,    // accept Cloudflare *.trycloudflare.com hosts
    proxy: apiProxy,
  },
  preview: {
    host: true,
    allowedHosts: true,    // production build served over the tunnel
    proxy: apiProxy,
  },
})
