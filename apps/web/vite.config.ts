import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    '@hc/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
    '@hc/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
  } },
  server: { fs: { allow: ['../..'] }, proxy: { '/api': 'http://127.0.0.1:8787', '/sites': 'http://127.0.0.1:8788' } },
});
