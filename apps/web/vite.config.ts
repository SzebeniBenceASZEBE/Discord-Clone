import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + WebSocket to the Node backend so the browser only
// ever talks to one origin (mirrors how Caddy fronts both in production).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
