// The front-end dev server is the worktree's origin: portless routes
// <identity>.polly.localhost to it, and it proxies the API's paths to the API
// on loopback, keeping the Host header so Better Auth sees its own origin.

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiPort = process.env['POLLY_API_PORT'] ?? '0'
const api = { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false }

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env['POLLY_WEB_PORT'] ?? 0),
    strictPort: true,
    allowedHosts: ['.polly.localhost'],
    proxy: { '/api': api, '/mcp': api, '/.well-known': api },
  },
})
