// The view builds into static files the analyzer serves from its watch mode.
// Relative paths, so the same build also opens from any directory.

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: './',
})
