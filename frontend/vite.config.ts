import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      // Dev-only convenience: call /api/... from the frontend without
      // hardcoding the backend origin. Production build reads
      // VITE_API_BASE_URL from env instead (see src/lib/api.ts).
      '/api': {
        target: 'http://backend:4000',
        changeOrigin: true,
      },
    },
  },
})
