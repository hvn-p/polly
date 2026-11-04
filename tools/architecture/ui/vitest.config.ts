import react from '@vitejs/plugin-react'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [react()],
  test: {
    name: 'architecture-ui',
    environment: 'happy-dom',
    setupFiles: ['../../../vitest.setup.ts'],
  },
})
