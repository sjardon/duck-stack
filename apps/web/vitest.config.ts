import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [['tests/error-tracking/viteConfig.test.ts', 'node']],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
})
