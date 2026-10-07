import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Билд раздаётся ASP.NET Core из wwwroot (UseStaticFiles + SPA fallback)
    outDir: '../DeskHub.Api/wwwroot',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    proxy: {
      '/api': backend,
      '/health': backend,
      '/hubs': { target: backend, ws: true },
    },
  },
})
