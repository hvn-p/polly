// The front-end dev server is the worktree's origin: portless routes
// <identity>.polly.localhost to it, and it proxies the API's paths to the API
// and /mcp to the MCP server, on loopback, keeping the Host header so Better
// Auth sees its own origin.

import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// The proxy pipes a response without ending it when the process behind it
// ends mid-body, so a client of an event stream would wait forever: the
// client's response is ended with it.
const endWithUpstream: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyRes', (proxyRes, _request, response) => {
    proxyRes.on('close', () => {
      if (!proxyRes.complete) {
        response.destroy()
      }
    })
  })
}

const target = (port: string | undefined) => ({
  target: `http://127.0.0.1:${port ?? '0'}`,
  changeOrigin: false,
  configure: endWithUpstream,
})
const api = target(process.env['POLLY_API_PORT'])
const mcp = target(process.env['POLLY_MCP_PORT'])

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env['POLLY_WEB_PORT'] ?? 0),
    strictPort: true,
    allowedHosts: ['.polly.localhost'],
    proxy: { '/api': api, '/mcp': mcp, '/.well-known': api },
  },
})
