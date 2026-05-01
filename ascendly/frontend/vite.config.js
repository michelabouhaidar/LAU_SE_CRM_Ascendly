import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true },
    allowedHosts: true,
    hmr: {
      protocol: 'wss',
      host: 'localhost',
      clientPort: 443,
    },
  },
})