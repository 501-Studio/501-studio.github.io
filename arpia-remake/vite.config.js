import { defineConfig } from 'vite';

export default defineConfig({
  base: '/arpia-remake/',
  server: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
