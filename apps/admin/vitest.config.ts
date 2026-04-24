import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// `any` cast: vitest embute sua própria cópia do vite; as tipagens de plugin
// colidem com a versão do vite do projeto (erro TS2769). A checagem em
// runtime segue funcionando — é um edge case conhecido do vitest monorepo.
export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  resolve: {
    alias: {
      '@captive-portal/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    globals: true,
    css: false,
  },
})
