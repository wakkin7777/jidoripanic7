import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['@imgly/background-removal']
  }
});
