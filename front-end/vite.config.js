import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // listen on all interfaces (needed for tunnels)
    allowedHosts: true,    // accept Cloudflare *.trycloudflare.com hosts
    proxy: {
      // Same-origin API: the browser calls /api/... and Vite forwards it to
      // the backend on :9000. This makes the app work behind one tunnel URL.
      '/api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
